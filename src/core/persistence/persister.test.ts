import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSceneStore, DEFAULT_STYLE, type RectangleElement } from "@core/scene";
import { createPersister } from "./persister";

const aRectangle = (id: string, x = 0): RectangleElement => ({
  id,
  type: "rectangle",
  x,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

const DELAY = 300;

describe("createPersister", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists a burst of notifications as one write of the latest scene", () => {
    const store = createSceneStore([aRectangle("a")]);
    const write = vi.fn();
    createPersister(store, write, { delay: DELAY });

    // A move-drag: one notification per pointermove.
    store.replaceElement(aRectangle("a", 1));
    store.replaceElement(aRectangle("a", 2));
    store.replaceElement(aRectangle("a", 3));
    vi.advanceTimersByTime(DELAY);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([aRectangle("a", 3)]);
  });

  it("writes `delay` ms after the last notification, not the first", () => {
    const store = createSceneStore([aRectangle("a")]);
    const write = vi.fn();
    createPersister(store, write, { delay: DELAY });

    store.replaceElement(aRectangle("a", 1));
    vi.advanceTimersByTime(200);
    store.replaceElement(aRectangle("a", 2));

    // 300 ms after the first notification, but only 100 after the last.
    vi.advanceTimersByTime(100);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  describe("flush", () => {
    it("writes the pending scene immediately and cancels the timer", () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY });

      store.replaceElement(aRectangle("a", 1));
      persister.flush();

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith([aRectangle("a", 1)]);

      // The debounced write it replaced must not follow.
      vi.advanceTimersByTime(DELAY);
      expect(write).toHaveBeenCalledTimes(1);
    });

    it("writes nothing when nothing has changed", () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY });

      persister.flush();

      expect(write).not.toHaveBeenCalled();
    });

    it("writes nothing when the debounced write already ran", () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY });

      store.replaceElement(aRectangle("a", 1));
      vi.advanceTimersByTime(DELAY);
      persister.flush();

      expect(write).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispose", () => {
    it("drops the pending write and ignores later changes", () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY });

      store.replaceElement(aRectangle("a", 1));
      persister.dispose();
      store.replaceElement(aRectangle("a", 2));
      vi.advanceTimersByTime(DELAY);
      persister.flush();

      expect(write).not.toHaveBeenCalled();
    });
  });
});
