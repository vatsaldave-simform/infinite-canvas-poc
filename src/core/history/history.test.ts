import { describe, expect, it } from "vitest";

import {
  createSceneStore,
  DEFAULT_STYLE,
  type RectangleElement,
  type SceneElement,
  type SceneStore,
} from "@core/scene";
import { createHistory, type History } from "./history";

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

  describe("an add entry", () => {
    it("undo removes the element", () => {
      const drawn = aRectangle("drawn");
      const store = createSceneStore([aRectangle("a"), drawn]);
      const history = createHistory(store);
      history.record({ kind: "add", element: drawn, index: 1 });

      history.undo();

      expect(store.getScene()).toEqual([aRectangle("a")]);
    });

    it("redo puts the element back at the index it was added at", () => {
      // "drawn" sits below "b", so putting it back on top would be wrong.
      const drawn = aRectangle("drawn");
      const store = createSceneStore([aRectangle("a"), drawn, aRectangle("b")]);
      const history = createHistory(store);
      history.record({ kind: "add", element: drawn, index: 1 });
      history.undo();

      history.redo();

      expect(store.getScene()).toEqual([aRectangle("a"), drawn, aRectangle("b")]);
    });

    it("undo and redo return the entry they applied", () => {
      const entry = { kind: "add" as const, element: aRectangle("a"), index: 0 };
      const history = createHistory(createSceneStore([entry.element]));
      history.record(entry);

      expect(history.undo()).toBe(entry);
      expect(history.redo()).toBe(entry);
    });
  });

  describe("a remove entry", () => {
    it("undo puts the element back at its old index, not on top", () => {
      const store = createSceneStore([aRectangle("a"), aRectangle("b"), aRectangle("c")]);
      const history = createHistory(store);
      const index = store.removeElement("b");
      history.record({ kind: "remove", element: aRectangle("b"), index });

      history.undo();

      expect(store.getScene()).toEqual([aRectangle("a"), aRectangle("b"), aRectangle("c")]);
    });

    it("redo removes the element again", () => {
      const store = createSceneStore([aRectangle("a"), aRectangle("b"), aRectangle("c")]);
      const history = createHistory(store);
      const index = store.removeElement("b");
      history.record({ kind: "remove", element: aRectangle("b"), index });
      history.undo();

      history.redo();

      expect(store.getScene()).toEqual([aRectangle("a"), aRectangle("c")]);
    });

    it("undo and redo return the entry they applied", () => {
      const store = createSceneStore([aRectangle("a")]);
      const history = createHistory(store);
      const entry = { kind: "remove" as const, element: aRectangle("a"), index: 0 };
      store.removeElement("a");
      history.record(entry);

      expect(history.undo()).toBe(entry);
      expect(history.redo()).toBe(entry);
    });
  });

  it("undoes a draw and a move of it in reverse order, then redoes them", () => {
    // Draw "a" at x = 0, then move it to x = 50.
    const store = createSceneStore([aRectangle("a", 50)]);
    const history = createHistory(store);
    history.record({ kind: "add", element: aRectangle("a", 0), index: 0 });
    history.record({ kind: "replace", before: aRectangle("a", 0), after: aRectangle("a", 50) });

    history.undo();
    expect(store.getScene()).toEqual([aRectangle("a", 0)]);
    history.undo();
    expect(store.getScene()).toEqual([]);

    history.redo();
    expect(store.getScene()).toEqual([aRectangle("a", 0)]);
    history.redo();
    expect(store.getScene()).toEqual([aRectangle("a", 50)]);
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

  describe("undoing everything", () => {
    // Each change is made the way the app makes it: write the store, then
    // record one entry, as the draw tool, select tool and delete key do.
    const draw = (store: SceneStore, history: History, element: SceneElement) => {
      store.addElement(element);
      const index = store.getScene().length - 1;
      history.record({ kind: "add", element, index });
    };

    const change = (store: SceneStore, history: History, after: SceneElement) => {
      const before = store.getScene().find((el) => el.id === after.id)!;
      store.replaceElement(after);
      history.record({ kind: "replace", before, after });
    };

    const remove = (store: SceneStore, history: History, id: string) => {
      const element = store.getScene().find((el) => el.id === id)!;
      const index = store.removeElement(id);
      history.record({ kind: "remove", element, index });
    };

    const undoAll = (history: History) => {
      while (history.undo()) {
        // keep undoing until there is nothing left
      }
    };

    const redoAll = (history: History) => {
      while (history.redo()) {
        // keep redoing until there is nothing left
      }
    };

    // Starts from a scene that already has elements, as after a reload. "y"
    // has "z" above it for good, so it must come back underneath "z".
    const makeChanges = () => {
      const store = createSceneStore([aRectangle("x"), aRectangle("y", 5), aRectangle("z", 9)]);
      const history = createHistory(store);
      const start = store.getScene();

      draw(store, history, aRectangle("a"));
      draw(store, history, aRectangle("b"));
      change(store, history, aRectangle("a", 40)); // move
      change(store, history, { ...aRectangle("b"), width: 30 }); // resize
      remove(store, history, "y"); // under the others
      draw(store, history, aRectangle("c"));
      remove(store, history, "a");
      change(store, history, aRectangle("x", -20)); // move
      remove(store, history, "c"); // on top

      return { store, history, start, end: store.getScene() };
    };

    it("gives back the starting scene", () => {
      const { store, history, start } = makeChanges();

      undoAll(history);

      expect(store.getScene()).toEqual(start);
    });

    it("then redoing everything gives back the final scene", () => {
      const { store, history, end } = makeChanges();
      undoAll(history);

      redoAll(history);

      expect(store.getScene()).toEqual(end);
    });
  });
});
