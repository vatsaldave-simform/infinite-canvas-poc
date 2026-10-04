import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "./factory";
import type {
  EllipseElement,
  FreehandElement,
  RectangleElement,
} from "./types";
import { getTouchedElements, pathTouchesOutline } from "./erase";

const RADIUS = 2;

// A 100 × 100 box from (0, 0) to (100, 100).
const aRectangle = (id = "r"): RectangleElement => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  style: { ...DEFAULT_STYLE },
});

// A circle of radius 50 centred on (50, 50).
const anEllipse = (id = "e"): EllipseElement => ({
  id,
  type: "ellipse",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  style: { ...DEFAULT_STYLE },
});

describe("pathTouchesOutline", () => {
  describe("a rectangle", () => {
    it("is touched by a point on its outline", () => {
      expect(pathTouchesOutline(aRectangle(), [{ x: 0, y: 50 }], RADIUS)).toBe(true);
    });

    it("is touched by a point just outside, within the radius", () => {
      expect(pathTouchesOutline(aRectangle(), [{ x: 101.5, y: 50 }], RADIUS)).toBe(true);
    });

    it("is not touched by a point further away than the radius", () => {
      expect(pathTouchesOutline(aRectangle(), [{ x: 103, y: 50 }], RADIUS)).toBe(false);
    });

    it("is not touched by a path through its empty inside", () => {
      const path = [
        { x: 20, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
      ];

      expect(pathTouchesOutline(aRectangle(), path, RADIUS)).toBe(false);
    });

    it("is touched by a fast path that crosses its outline between two samples", () => {
      // Neither sample is anywhere near the outline; the line between them
      // crosses the left edge.
      const path = [
        { x: -50, y: 50 },
        { x: 50, y: 50 },
      ];

      expect(pathTouchesOutline(aRectangle(), path, RADIUS)).toBe(true);
    });
  });

  describe("an ellipse", () => {
    it("is touched by a point on its outline", () => {
      expect(pathTouchesOutline(anEllipse(), [{ x: 50, y: 0 }], RADIUS)).toBe(true);
    });

    it("is touched on its curve, not just where it meets its box", () => {
      // 45° round the circle.
      const onCurve = { x: 50 + 50 * Math.SQRT1_2, y: 50 + 50 * Math.SQRT1_2 };

      expect(pathTouchesOutline(anEllipse(), [onCurve], RADIUS)).toBe(true);
    });

    it("is not touched in the corner of its box, outside the curve", () => {
      expect(pathTouchesOutline(anEllipse(), [{ x: 5, y: 5 }], RADIUS)).toBe(false);
    });

    it("is not touched by a path through its empty inside", () => {
      const path = [
        { x: 30, y: 50 },
        { x: 70, y: 50 },
      ];

      expect(pathTouchesOutline(anEllipse(), path, RADIUS)).toBe(false);
    });

    it("is touched by a fast path that crosses its outline between two samples", () => {
      const path = [
        { x: 50, y: 50 },
        { x: 50, y: 200 },
      ];

      expect(pathTouchesOutline(anEllipse(), path, RADIUS)).toBe(true);
    });
  });

  it("leaves a freehand stroke untouched", () => {
    const stroke: FreehandElement = {
      id: "f",
      type: "freehand",
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      style: { ...DEFAULT_STYLE },
    };

    expect(pathTouchesOutline(stroke, [{ x: 50, y: 0 }], RADIUS)).toBe(false);
  });
});

describe("getTouchedElements", () => {
  it("finds every element the path touches, at any depth, in z-order", () => {
    const below = aRectangle("below");
    const above = anEllipse("above");
    const elsewhere = { ...aRectangle("elsewhere"), x: 500 };
    // Touches the rectangle's left edge and the circle's leftmost point.
    const path = [
      { x: 0, y: 40 },
      { x: 0, y: 60 },
    ];

    expect(getTouchedElements([below, elsewhere, above], path, RADIUS)).toEqual([
      below,
      above,
    ]);
  });
});
