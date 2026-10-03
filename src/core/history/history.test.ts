import { describe, expect, it } from "vitest";

import { createSceneStore, DEFAULT_STYLE, type RectangleElement } from "@core/scene";
import { createHistory } from "./history";

const aRectangle = (id: string, x = 0): RectangleElement => ({
  id,
  type: "rectangle",
  x,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

describe("createHistory", () => {
  describe("a replace entry", () => {
    it("undo puts the element back as it was before", () => {
      const before = aRectangle("a", 0);
      const after = aRectangle("a", 50);
      const store = createSceneStore([after]);
      const history = createHistory(store);
      history.record({ kind: "replace", before, after });

      history.undo();

      expect(store.getScene()).toEqual([before]);
    });

    it("redo puts the element back as it was after", () => {
      const before = aRectangle("a", 0);
      const after = aRectangle("a", 50);
      const store = createSceneStore([after]);
      const history = createHistory(store);
      history.record({ kind: "replace", before, after });
      history.undo();

      history.redo();

      expect(store.getScene()).toEqual([after]);
    });

    it("undo and redo return the entry they applied", () => {
      const entry = {
        kind: "replace" as const,
        before: aRectangle("a", 0),
        after: aRectangle("a", 50),
      };
      const history = createHistory(createSceneStore([entry.after]));
      history.record(entry);

      expect(history.undo()).toBe(entry);
      expect(history.redo()).toBe(entry);
    });
  });

  describe("with nothing to apply", () => {
    it("undo returns null and leaves the scene alone", () => {
      const store = createSceneStore([aRectangle("a")]);
      const scene = store.getScene();
      const history = createHistory(store);

      expect(history.undo()).toBeNull();
      expect(store.getScene()).toBe(scene);
    });

    it("redo returns null and leaves the scene alone", () => {
      const store = createSceneStore([aRectangle("a")]);
      const scene = store.getScene();
      const history = createHistory(store);

      expect(history.redo()).toBeNull();
      expect(store.getScene()).toBe(scene);
    });

    it("redo returns null once everything undone is redone", () => {
      const before = aRectangle("a", 0);
      const after = aRectangle("a", 50);
      const store = createSceneStore([after]);
      const history = createHistory(store);
      history.record({ kind: "replace", before, after });
      history.undo();
      history.redo();

      expect(history.redo()).toBeNull();
      expect(store.getScene()).toEqual([after]);
    });
  });

  it("recording after an undo clears what could be redone", () => {
    const store = createSceneStore([aRectangle("a", 50)]);
    const history = createHistory(store);
    history.record({
      kind: "replace",
      before: aRectangle("a", 0),
      after: aRectangle("a", 50),
    });
    history.undo();

    // A new move from x = 0 to x = 20, made after the undo.
    store.replaceElement(aRectangle("a", 20));
    history.record({
      kind: "replace",
      before: aRectangle("a", 0),
      after: aRectangle("a", 20),
    });

    expect(history.redo()).toBeNull();
    expect(store.getScene()).toEqual([aRectangle("a", 20)]);
  });

  it("undoes several entries in reverse order and redoes them in order", () => {
    // Two moves of "a" (x 0 → 10 → 20), then one of "b" (x 0 → 5).
    const store = createSceneStore([aRectangle("a", 20), aRectangle("b", 5)]);
    const history = createHistory(store);
    history.record({ kind: "replace", before: aRectangle("a", 0), after: aRectangle("a", 10) });
    history.record({ kind: "replace", before: aRectangle("a", 10), after: aRectangle("a", 20) });
    history.record({ kind: "replace", before: aRectangle("b", 0), after: aRectangle("b", 5) });

    history.undo();
    expect(store.getScene()).toEqual([aRectangle("a", 20), aRectangle("b", 0)]);
    history.undo();
    expect(store.getScene()).toEqual([aRectangle("a", 10), aRectangle("b", 0)]);
    history.undo();
    expect(store.getScene()).toEqual([aRectangle("a", 0), aRectangle("b", 0)]);

    history.redo();
    expect(store.getScene()).toEqual([aRectangle("a", 10), aRectangle("b", 0)]);
    history.redo();
    expect(store.getScene()).toEqual([aRectangle("a", 20), aRectangle("b", 0)]);
    history.redo();
    expect(store.getScene()).toEqual([aRectangle("a", 20), aRectangle("b", 5)]);
  });
});
