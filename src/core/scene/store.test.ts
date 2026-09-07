import { describe, expect, it, vi } from "vitest";

import { createSceneStore } from "./store";
import { DEFAULT_STYLE } from "./factory";
import type { RectangleElement } from "./types";

const aRectangle = (id: string, x = 0): RectangleElement => ({
  id,
  type: "rectangle",
  x,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

// Three elements so there is a genuine middle — replacing the middle one is
// the only arrangement that can catch a z-order bug.
const threeElements = () => [
  aRectangle("bottom"),
  aRectangle("middle"),
  aRectangle("top"),
];

describe("createSceneStore", () => {
  describe("addElement", () => {
    it("appends to the top of the z-order", () => {
      const store = createSceneStore([aRectangle("first")]);

      store.addElement(aRectangle("second"));

      expect(store.getScene().map((el) => el.id)).toEqual(["first", "second"]);
    });

    it("does not mutate the previous scene array", () => {
      const initial = [aRectangle("first")];
      const store = createSceneStore(initial);

      store.addElement(aRectangle("second"));

      expect(initial).toHaveLength(1);
      expect(store.getScene()).not.toBe(initial);
    });
  });

  describe("replaceElement", () => {
    it("swaps the element in place, preserving its z-order", () => {
      const store = createSceneStore(threeElements());

      store.replaceElement(aRectangle("middle", 999));

      // The order must be untouched — a moved element does not come forward.
      expect(store.getScene().map((el) => el.id)).toEqual([
        "bottom",
        "middle",
        "top",
      ]);
      expect(store.getScene()[1].x).toBe(999);
    });

    it("actually updates the scene the store hands out", () => {
      const store = createSceneStore(threeElements());

      store.replaceElement(aRectangle("middle", 42));

      const found = store.getScene().find((el) => el.id === "middle");
      expect(found?.x).toBe(42);
    });

    it("does not mutate the previous scene array", () => {
      const initial = threeElements();
      const store = createSceneStore(initial);

      store.replaceElement(aRectangle("middle", 42));

      expect(initial[1].x).toBe(0); // the old array still holds the old element
      expect(store.getScene()).not.toBe(initial); // and we got a fresh array
    });

    it("notifies subscribers", () => {
      const store = createSceneStore(threeElements());
      const listener = vi.fn();
      store.subscribe(listener);

      store.replaceElement(aRectangle("middle", 42));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("keeps the same array reference when the id is unknown", () => {
      const store = createSceneStore(threeElements());
      const before = store.getScene();

      store.replaceElement(aRectangle("does-not-exist"));

      // getSnapshot's contract: no change means the SAME array, not an equal
      // one. A fresh array here would make useSyncExternalStore re-render on
      // every no-op — and, in React 18+, can throw "getSnapshot should be
      // cached".
      expect(store.getScene()).toBe(before);
    });

    it("does not notify subscribers when the id is unknown", () => {
      const store = createSceneStore(threeElements());
      const listener = vi.fn();
      store.subscribe(listener);

      store.replaceElement(aRectangle("does-not-exist"));

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
