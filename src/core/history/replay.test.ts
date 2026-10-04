import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSceneStore,
  DEFAULT_STYLE,
  type RectangleElement,
  type SceneStore,
} from "@core/scene";
import { createHistory, type History } from "./history";
import { createReplay, REPLAY_STEP_MS } from "./replay";

const aRectangle = (id: string): RectangleElement => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

// Draw three rectangles, then undo them all, so the whole drawing is in the
// future and a replay has three entries to step through.
function setUpRewoundHistory(): { store: SceneStore; history: History } {
  const store = createSceneStore();
  const history = createHistory(store);
  for (const id of ["a", "b", "c"]) {
    const element = aRectangle(id);
    const index = store.getScene().length;
    store.addElement(element);
    history.record({ kind: "add", element, index });
  }
  history.goTo(0);
  return { store, history };
}

const sceneIds = (store: SceneStore) => store.getScene().map((el) => el.id);

describe("createReplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("steps forward one entry each step", () => {
    const { store, history } = setUpRewoundHistory();
    const replay = createReplay(history, () => {});

    replay.play();
    vi.advanceTimersByTime(REPLAY_STEP_MS);
    expect(sceneIds(store)).toEqual(["a"]);

    vi.advanceTimersByTime(REPLAY_STEP_MS);
    expect(sceneIds(store)).toEqual(["a", "b"]);
  });

  it("stops as soon as the last entry is redone", () => {
    const { history } = setUpRewoundHistory();
    const replay = createReplay(history, () => {});

    replay.play();
    expect(replay.isPlaying()).toBe(true);

    vi.advanceTimersByTime(REPLAY_STEP_MS * 3);
    expect(history.getPresent()).toBe(3);
    expect(replay.isPlaying()).toBe(false);
  });

  it("pause stops stepping where it is", () => {
    const { store, history } = setUpRewoundHistory();
    const replay = createReplay(history, () => {});
    replay.play();
    vi.advanceTimersByTime(REPLAY_STEP_MS);

    replay.pause();
    vi.advanceTimersByTime(REPLAY_STEP_MS * 5);

    expect(replay.isPlaying()).toBe(false);
    expect(sceneIds(store)).toEqual(["a"]);
  });

  it("play with nothing to redo does nothing", () => {
    const { history } = setUpRewoundHistory();
    history.goTo(3);
    const replay = createReplay(history, () => {});

    replay.play();

    expect(replay.isPlaying()).toBe(false);
  });

  it("hands every entry a step applies to onStep", () => {
    const { history } = setUpRewoundHistory();
    const stepped: string[] = [];
    const replay = createReplay(history, (entry) => {
      if (entry.kind === "add") stepped.push(entry.element.id);
    });

    replay.play();
    vi.advanceTimersByTime(REPLAY_STEP_MS * 3);

    expect(stepped).toEqual(["a", "b", "c"]);
  });

  it("playing while it plays does not step any faster", () => {
    const { store, history } = setUpRewoundHistory();
    const replay = createReplay(history, () => {});

    replay.play();
    replay.play();
    vi.advanceTimersByTime(REPLAY_STEP_MS);

    expect(sceneIds(store)).toEqual(["a"]);
  });

  describe("subscribe", () => {
    it("tells the listener when it plays, pauses and reaches the end", () => {
      const { history } = setUpRewoundHistory();
      const replay = createReplay(history, () => {});
      const heard: boolean[] = [];
      replay.subscribe(() => heard.push(replay.isPlaying()));

      replay.play();
      replay.pause();
      replay.play();
      vi.advanceTimersByTime(REPLAY_STEP_MS * 3);

      expect(heard).toEqual([true, false, true, false]);
    });

    it("stays quiet when a pause or a play changes nothing", () => {
      const { history } = setUpRewoundHistory();
      const replay = createReplay(history, () => {});
      let calls = 0;
      replay.subscribe(() => calls++);

      replay.pause();
      replay.play();
      replay.play();

      expect(calls).toBe(1);
    });

    it("stops telling the listener once it unsubscribes", () => {
      const { history } = setUpRewoundHistory();
      const replay = createReplay(history, () => {});
      let calls = 0;
      const unsubscribe = replay.subscribe(() => calls++);

      unsubscribe();
      replay.play();

      expect(calls).toBe(0);
    });
  });
});
