import { describe, expect, it } from "vitest";

import {
  createErasure,
  createSceneStore,
  DEFAULT_STYLE,
  eraseAlong,
  type FreehandElement,
  type RectangleElement,
} from "@core/scene";
import { applyErase } from "./erase";
import { createHistory } from "./history";

const RADIUS = 2;

const aRectangle = (id: string, x: number): RectangleElement => ({
  id,
  type: "rectangle",
  x,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

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

describe("applyErase", () => {
  // From back to front: a rectangle the path misses, the stroke, and a
  // rectangle the path erases. The path runs down through the middle of the
  // stroke and the left edge of "erased".
  const eraseAcross = () => {
    const kept = aRectangle("kept", 300);
    const stroke = aStroke("stroke");
    const erased = aRectangle("erased", 50);
    const store = createSceneStore([kept, stroke, erased]);
    const history = createHistory(store);
    const start = store.getScene();

    const erasure = createErasure();
    eraseAlong(store.getScene(), erasure, [
      { x: 50, y: 5 },
      { x: 50, y: 60 },
    ], RADIUS);
    const entry = applyErase(store, erasure)!;
    history.record(entry);

    return { store, history, start, end: store.getScene(), kept, stroke };
  };

  it("leaves the stroke's pieces where it stood and removes the rectangle", () => {
    const { end, kept, stroke } = eraseAcross();

    expect(end).toHaveLength(3);
    expect(end[0]).toBe(kept);
    expect(end[1].type).toBe("freehand");
    expect(end[2].type).toBe("freehand");
    expect(end.map((element) => element.id)).not.toContain(stroke.id);
  });

  it("undoes to the starting scene, the stroke back at its old depth", () => {
    const { store, history, start } = eraseAcross();

    history.undo();

    expect(store.getScene()).toEqual(start);
  });

  it("redoes to the pieces", () => {
    const { store, history, end } = eraseAcross();
    history.undo();

    history.redo();

    expect(store.getScene()).toEqual(end);
  });

  it("is one entry", () => {
    const { history } = eraseAcross();

    expect(history.getCount()).toBe(1);
  });

  it("gives null and leaves the scene alone when nothing was erased", () => {
    const store = createSceneStore([aRectangle("a", 0)]);
    const start = store.getScene();

    expect(applyErase(store, createErasure())).toBeNull();
    expect(store.getScene()).toBe(start);
  });
});
