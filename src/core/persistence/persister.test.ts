import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSceneStore, DEFAULT_STYLE, type RectangleElement, type Scene } from "@core/scene";
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

/** A write that commits, as a healthy IndexedDB does. */
const succeeding = () => vi.fn<(scene: Scene) => Promise<void>>(() => Promise.resolve());

/** A write that aborts, as a full disk or an evicted database does. */
const failing = (error: unknown) => vi.fn<(scene: Scene) => Promise<void>>(() => Promise.reject(error));

describe("createPersister", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists a burst of notifications as one write of the latest scene", () => {
    const store = createSceneStore([aRectangle("a")]);
    const write = succeeding();
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
    const write = succeeding();
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
      const write = succeeding();
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
      const write = succeeding();
      const persister = createPersister(store, write, { delay: DELAY });

      persister.flush();

      expect(write).not.toHaveBeenCalled();
    });

    it("writes nothing when the debounced write already ran", () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = succeeding();
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
      const write = succeeding();
      const persister = createPersister(store, write, { delay: DELAY });

      store.replaceElement(aRectangle("a", 1));
      persister.dispose();
      store.replaceElement(aRectangle("a", 2));
      vi.advanceTimersByTime(DELAY);
      persister.flush();

      expect(write).not.toHaveBeenCalled();
    });

    it("stops reporting the outcome of a write still in flight", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const store = createSceneStore([aRectangle("a")]);
      const onStatusChange = vi.fn();
      const persister = createPersister(store, failing(new Error("aborted")), {
        delay: DELAY,
        onStatusChange,
      });

      store.replaceElement(aRectangle("a", 1));
      persister.flush();
      persister.dispose();
      await vi.advanceTimersByTimeAsync(0);

      expect(onStatusChange).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledOnce();
    });
  });

  describe("write outcome", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("reports failing when a write fails, and logs the error", async () => {
      const store = createSceneStore([aRectangle("a")]);
      const error = new DOMException("Quota exceeded", "QuotaExceededError");
      const onStatusChange = vi.fn();
      createPersister(store, failing(error), { delay: DELAY, onStatusChange });

      store.replaceElement(aRectangle("a", 1));
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith("failing");
      expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
    });

    it("reports ok again on the next write that succeeds", async () => {
      const store = createSceneStore([aRectangle("a")]);
      const write = succeeding().mockRejectedValueOnce(new Error("aborted"));
      const onStatusChange = vi.fn();
      createPersister(store, write, { delay: DELAY, onStatusChange });

      store.replaceElement(aRectangle("a", 1));
      await vi.advanceTimersByTimeAsync(DELAY);
      store.replaceElement(aRectangle("a", 2));
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(onStatusChange.mock.calls).toEqual([["failing"], ["ok"]]);
    });

    it("reports nothing while writes keep succeeding", async () => {
      const store = createSceneStore([aRectangle("a")]);
      const onStatusChange = vi.fn();
      createPersister(store, succeeding(), { delay: DELAY, onStatusChange });

      store.replaceElement(aRectangle("a", 1));
      await vi.advanceTimersByTimeAsync(DELAY);
      store.replaceElement(aRectangle("a", 2));
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("reports a run of failures once, but logs every one", async () => {
      const store = createSceneStore([aRectangle("a")]);
      const onStatusChange = vi.fn();
      createPersister(store, failing(new Error("aborted")), {
        delay: DELAY,
        onStatusChange,
      });

      store.replaceElement(aRectangle("a", 1));
      await vi.advanceTimersByTimeAsync(DELAY);
      store.replaceElement(aRectangle("a", 2));
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith("failing");
      expect(console.error).toHaveBeenCalledTimes(2);
    });

    it("ignores the outcome of a write a newer one has superseded", async () => {
      const store = createSceneStore([aRectangle("a")]);
      let failFirst: (error: unknown) => void = () => {};
      const write = succeeding().mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => (failFirst = reject)),
      );
      const onStatusChange = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY, onStatusChange });

      store.replaceElement(aRectangle("a", 1));
      persister.flush();
      store.replaceElement(aRectangle("a", 2));
      persister.flush();
      await vi.advanceTimersByTimeAsync(0);
      // The first write fails only after the newer scene reached storage.
      failFirst(new Error("aborted"));
      await vi.advanceTimersByTimeAsync(0);

      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("treats a write that throws instead of rejecting as a failure", async () => {
      const store = createSceneStore([aRectangle("a")]);
      const error = new DOMException("The database connection is closing.", "InvalidStateError");
      const write = succeeding().mockImplementation(() => {
        throw error;
      });
      const onStatusChange = vi.fn();
      const persister = createPersister(store, write, { delay: DELAY, onStatusChange });

      store.replaceElement(aRectangle("a", 1));
      expect(() => persister.flush()).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);

      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith("failing");
      expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
    });
  });
});
