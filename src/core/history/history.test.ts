import { describe, expect, it } from "vitest";

import {
  createErasure,
  createSceneStore,
  DEFAULT_STYLE,
  eraseAlong,
  type FreehandElement,
  type Point,
  type RectangleElement,
  type SceneElement,
  type SceneStore,
} from "@core/scene";
import { applyErase } from "./erase";
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

  describe("a compound entry", () => {
    // Remove "b" and "d" one at a time, as an erase does, recording where
    // each one stood when it was taken out.
    const eraseTwo = () => {
      const store = createSceneStore([
        aRectangle("a"),
        aRectangle("b"),
        aRectangle("c"),
        aRectangle("d"),
        aRectangle("e"),
      ]);
      const history = createHistory(store);
      const indexOfB = store.removeElement("b");
      const indexOfD = store.removeElement("d");
      const entry = {
        kind: "compound" as const,
        operations: [
          { kind: "remove" as const, element: aRectangle("b"), index: indexOfB },
          { kind: "remove" as const, element: aRectangle("d"), index: indexOfD },
        ],
      };
      history.record(entry);
      return { store, history, entry };
    };

    it("undo puts every removed element back at its old depth", () => {
      const { store, history } = eraseTwo();

      history.undo();

      expect(store.getScene()).toEqual([
        aRectangle("a"),
        aRectangle("b"),
        aRectangle("c"),
        aRectangle("d"),
        aRectangle("e"),
      ]);
    });

    it("redo removes them all again", () => {
      const { store, history } = eraseTwo();
      history.undo();

      history.redo();

      expect(store.getScene()).toEqual([aRectangle("a"), aRectangle("c"), aRectangle("e")]);
    });

    it("undo reverts its operations in reverse order", () => {
      // Draw "a", then move it. Reverting the move first is the only way back
      // to an empty scene; removing "a" first would leave the move nothing to
      // revert.
      const store = createSceneStore();
      const history = createHistory(store);
      store.addElement(aRectangle("a", 50));
      history.record({
        kind: "compound",
        operations: [
          { kind: "add", element: aRectangle("a", 0), index: 0 },
          { kind: "replace", before: aRectangle("a", 0), after: aRectangle("a", 50) },
        ],
      });

      history.undo();
      expect(store.getScene()).toEqual([]);

      history.redo();
      expect(store.getScene()).toEqual([aRectangle("a", 50)]);
    });

    it("moves the present and the count by one", () => {
      const { history } = eraseTwo();

      expect(history.getPresent()).toBe(1);
      expect(history.getCount()).toBe(1);

      history.undo();
      expect(history.getPresent()).toBe(0);
      expect(history.getCount()).toBe(1);

      history.redo();
      expect(history.getPresent()).toBe(1);
    });

    it("undo and redo return the entry they applied", () => {
      const { history, entry } = eraseTwo();

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

  describe("the present and the count", () => {
    it("start at zero", () => {
      const history = createHistory(createSceneStore());

      expect(history.getPresent()).toBe(0);
      expect(history.getCount()).toBe(0);
    });

    it("both move up when a change is recorded", () => {
      const history = createHistory(createSceneStore([aRectangle("a")]));
      history.record({ kind: "add", element: aRectangle("a"), index: 0 });

      expect(history.getPresent()).toBe(1);
      expect(history.getCount()).toBe(1);
    });

    it("undo moves the present back and keeps the count", () => {
      const history = createHistory(createSceneStore([aRectangle("a")]));
      history.record({ kind: "add", element: aRectangle("a"), index: 0 });

      history.undo();

      expect(history.getPresent()).toBe(0);
      expect(history.getCount()).toBe(1);
    });

    it("redo moves the present forward and keeps the count", () => {
      const history = createHistory(createSceneStore([aRectangle("a")]));
      history.record({ kind: "add", element: aRectangle("a"), index: 0 });
      history.undo();

      history.redo();

      expect(history.getPresent()).toBe(1);
      expect(history.getCount()).toBe(1);
    });
  });

  describe("subscribe", () => {
    it("tells the listener about a record, an undo and a redo", () => {
      const history = createHistory(createSceneStore([aRectangle("a")]));
      let calls = 0;
      history.subscribe(() => {
        calls += 1;
      });

      history.record({ kind: "add", element: aRectangle("a"), index: 0 });
      expect(calls).toBe(1);
      history.undo();
      expect(calls).toBe(2);
      history.redo();
      expect(calls).toBe(3);
    });

    it("stays quiet when there is nothing to undo or redo", () => {
      const history = createHistory(createSceneStore());
      let calls = 0;
      history.subscribe(() => {
        calls += 1;
      });

      history.undo();
      history.redo();

      expect(calls).toBe(0);
    });

    it("stops telling the listener once it unsubscribes", () => {
      const history = createHistory(createSceneStore([aRectangle("a")]));
      let calls = 0;
      const unsubscribe = history.subscribe(() => {
        calls += 1;
      });

      unsubscribe();
      history.record({ kind: "add", element: aRectangle("a"), index: 0 });

      expect(calls).toBe(0);
    });
  });

  describe("goTo", () => {
    // Three moves of "a": x 0 → 10 → 20 → 30. The present ends at 3.
    const moveThreeTimes = () => {
      const store = createSceneStore([aRectangle("a", 30)]);
      const history = createHistory(store);
      const moves = [
        { kind: "replace" as const, before: aRectangle("a", 0), after: aRectangle("a", 10) },
        { kind: "replace" as const, before: aRectangle("a", 10), after: aRectangle("a", 20) },
        { kind: "replace" as const, before: aRectangle("a", 20), after: aRectangle("a", 30) },
      ];
      moves.forEach((move) => history.record(move));
      return { store, history, moves };
    };

    it("going back undoes until the present is there", () => {
      const { store, history } = moveThreeTimes();

      history.goTo(1);

      expect(history.getPresent()).toBe(1);
      expect(store.getScene()).toEqual([aRectangle("a", 10)]);
    });

    it("going back returns the last entry it undid", () => {
      const { history, moves } = moveThreeTimes();

      // Undoes the third move, then the second.
      expect(history.goTo(1)).toBe(moves[1]);
    });

    it("going forward redoes until the present is there", () => {
      const { store, history } = moveThreeTimes();
      history.goTo(0);

      history.goTo(2);

      expect(history.getPresent()).toBe(2);
      expect(store.getScene()).toEqual([aRectangle("a", 20)]);
    });

    it("going forward returns the last entry it redid", () => {
      const { history, moves } = moveThreeTimes();
      history.goTo(0);

      // Redoes the first move, then the second.
      expect(history.goTo(2)).toBe(moves[1]);
    });

    it("going to the present does nothing and returns null", () => {
      const { store, history } = moveThreeTimes();
      const scene = store.getScene();
      let calls = 0;
      history.subscribe(() => {
        calls += 1;
      });

      expect(history.goTo(3)).toBeNull();
      expect(store.getScene()).toBe(scene);
      expect(calls).toBe(0);
    });

    it("going before the start stops at the document as loaded", () => {
      const { store, history, moves } = moveThreeTimes();

      expect(history.goTo(-5)).toBe(moves[0]);
      expect(history.getPresent()).toBe(0);
      expect(store.getScene()).toEqual([aRectangle("a", 0)]);
    });

    it("going past the end stops at the latest change", () => {
      const { store, history, moves } = moveThreeTimes();
      history.goTo(0);

      expect(history.goTo(99)).toBe(moves[2]);
      expect(history.getPresent()).toBe(3);
      expect(store.getScene()).toEqual([aRectangle("a", 30)]);
    });

    it("tells the listener once per entry it applies", () => {
      const { history } = moveThreeTimes();
      let calls = 0;
      history.subscribe(() => {
        calls += 1;
      });

      // Two undos, and each one notifies.
      history.goTo(1);

      expect(calls).toBe(2);
    });

    it("recording after going back drops the future", () => {
      const { store, history } = moveThreeTimes();
      history.goTo(1);

      // A new move from x = 10 to x = 50, made after going back.
      store.replaceElement(aRectangle("a", 50));
      history.record({ kind: "replace", before: aRectangle("a", 10), after: aRectangle("a", 50) });

      expect(history.getPresent()).toBe(2);
      expect(history.getCount()).toBe(2);
      expect(history.goTo(3)).toBeNull();
      expect(store.getScene()).toEqual([aRectangle("a", 50)]);
    });
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

    // One erase gesture along `path`, committed as the eraser tool does.
    const erase = (store: SceneStore, history: History, path: Point[]) => {
      const erasure = createErasure();
      eraseAlong(store.getScene(), erasure, path, 2);
      const entry = applyErase(store, erasure);
      if (entry) history.record(entry);
    };

    // A straight stroke from (0, 50) to (100, 50).
    const aStroke = (id: string): FreehandElement => ({
      id,
      type: "freehand",
      x: 0,
      y: 50,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      style: { ...DEFAULT_STYLE },
    });

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
      draw(store, history, aStroke("s"));
      draw(store, history, aRectangle("d"));
      // Cuts the stroke in two and removes "d", whose left edge is at x = 0.
      erase(store, history, [
        { x: 50, y: 40 },
        { x: 50, y: 60 },
        { x: 0, y: 5 },
      ]);

      return { store, history, start, end: store.getScene() };
    };

    it("includes an erase that cut the stroke and removed a rectangle", () => {
      const { end } = makeChanges();

      const ids = end.map((element) => element.id);
      expect(ids).not.toContain("s");
      expect(ids).not.toContain("d");
      expect(end.filter((element) => element.type === "freehand")).toHaveLength(2);
    });

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

    it("goTo(0) gives back the starting scene", () => {
      const { store, history, start } = makeChanges();

      history.goTo(0);

      expect(store.getScene()).toEqual(start);
    });

    it("then goTo(count) gives back the final scene", () => {
      const { store, history, end } = makeChanges();
      history.goTo(0);

      history.goTo(history.getCount());

      expect(store.getScene()).toEqual(end);
    });
  });
});
