import { describe, expect, it } from "vitest";

import { getBoundingBox } from "./bounds";
import { DEFAULT_STYLE } from "./factory";
import { translateElement } from "./translate";
import type {
  EllipseElement,
  FreehandElement,
  RectangleElement,
} from "./types";

// Fresh fixtures per test, so a mutation bug in one test can't leak into
// another and make the failure look like it came from somewhere else.
const aRectangle = (): RectangleElement => ({
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  style: { ...DEFAULT_STYLE },
});

const anEllipse = (): EllipseElement => ({
  id: "ellipse-1",
  type: "ellipse",
  x: -5,
  y: 8,
  width: 12,
  height: 12,
  style: { ...DEFAULT_STYLE },
});

// A stroke whose offsets deliberately include negatives, so a bug that
// confused offsets with absolute points would show up in the bounding box.
const aFreehand = (): FreehandElement => ({
  id: "freehand-1",
  type: "freehand",
  x: 100,
  y: 200,
  points: [
    { x: 0, y: 0 },
    { x: 15, y: -10 },
    { x: -5, y: 25 },
  ],
  style: { ...DEFAULT_STYLE },
});

describe("translateElement", () => {
  it.each([
    { type: "rectangle", element: aRectangle() },
    { type: "ellipse", element: anEllipse() },
    { type: "freehand", element: aFreehand() },
  ])("offsets a $type's world origin by the delta", ({ element }) => {
    const moved = translateElement(element, { x: 7, y: -3 });

    expect(moved.x).toBe(element.x + 7);
    expect(moved.y).toBe(element.y - 3);
  });

  it("returns a new object rather than mutating the original", () => {
    const rectangle = aRectangle();
    const before = structuredClone(rectangle);

    const moved = translateElement(rectangle, { x: 50, y: 50 });

    expect(moved).not.toBe(rectangle); // a different object...
    expect(rectangle).toEqual(before); // ...and the original is untouched
  });

  it("carries every other field through unchanged", () => {
    const rectangle = aRectangle();

    const moved = translateElement(rectangle, { x: 1, y: 1 });

    expect(moved.id).toBe(rectangle.id);
    expect(moved.type).toBe("rectangle");
    expect(moved.width).toBe(rectangle.width);
    expect(moved.height).toBe(rectangle.height);
    expect(moved.style).toEqual(DEFAULT_STYLE);
  });

  it("is a no-op in value for a zero delta", () => {
    const rectangle = aRectangle();

    expect(translateElement(rectangle, { x: 0, y: 0 })).toEqual(rectangle);
  });

  it("leaves a freehand stroke's offsets alone — they are relative", () => {
    const freehand = aFreehand();

    const moved = translateElement(freehand, { x: -40, y: 60 });

    // The offsets must be identical: moving the origin moves the whole stroke.
    expect(moved.points).toEqual(freehand.points);
  });

  it("shifts a freehand stroke's bounding box by exactly the delta", () => {
    const freehand = aFreehand();
    const before = getBoundingBox(freehand);

    const after = getBoundingBox(translateElement(freehand, { x: -40, y: 60 }));

    expect(after).toEqual({
      x: before.x - 40,
      y: before.y + 60,
      width: before.width, // a move must never resize
      height: before.height,
    });
  });
});
