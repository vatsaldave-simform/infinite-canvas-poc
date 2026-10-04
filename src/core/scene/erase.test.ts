import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "./factory";
import type {
  EllipseElement,
  FreehandElement,
  RectangleElement,
} from "./types";
import {
  createErasure,
  eraseAlong,
  getErasePreview,
  pathTouchesOutline,
  splitStroke,
} from "./erase";

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

describe("eraseAlong", () => {
  // A straight stroke from (0, 200) to (100, 200).
  const aStroke = (id = "f"): FreehandElement => ({
    id,
    type: "freehand",
    x: 0,
    y: 200,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    style: { ...DEFAULT_STYLE },
  });

  it("removes every shape whose outline the path touches, at any depth", () => {
    const below = aRectangle("below");
    const above = anEllipse("above");
    const elsewhere = { ...aRectangle("elsewhere"), x: 500 };
    const erasure = createErasure();
    // Touches the rectangle's left edge and the circle's leftmost point.
    const path = [
      { x: 0, y: 40 },
      { x: 0, y: 60 },
    ];

    eraseAlong([below, elsewhere, above], erasure, path, RADIUS);

    expect(erasure.removedIds).toEqual(new Set(["below", "above"]));
  });

  it("keeps the pieces of a stroke it crosses", () => {
    const erasure = createErasure();
    const path = [
      { x: 50, y: 150 },
      { x: 50, y: 250 },
    ];

    eraseAlong([aStroke()], erasure, path, RADIUS);

    expect(erasure.piecesById.get("f")).toHaveLength(2);
  });

  it("cuts the pieces further on a later stretch of the path", () => {
    const scene = [aStroke()];
    const erasure = createErasure();
    eraseAlong(scene, erasure, [{ x: 30, y: 150 }, { x: 30, y: 250 }], RADIUS);

    eraseAlong(scene, erasure, [{ x: 70, y: 150 }, { x: 70, y: 250 }], RADIUS);

    expect(erasure.piecesById.get("f")).toHaveLength(3);
  });

  it("says whether it erased anything new", () => {
    const scene = [aRectangle(), aStroke()];
    const erasure = createErasure();
    const acrossBoth = [
      { x: 50, y: -10 },
      { x: 50, y: 210 },
    ];

    expect(eraseAlong(scene, erasure, acrossBoth, RADIUS)).toBe(true);
    // The same stretch again: the rectangle is already gone and the stroke
    // already cut there.
    expect(eraseAlong(scene, erasure, acrossBoth, RADIUS)).toBe(false);
    expect(eraseAlong(scene, erasure, [{ x: 500, y: 500 }], RADIUS)).toBe(false);
  });
});

describe("getErasePreview", () => {
  it("swaps each cut stroke for its pieces, and fades whatever was erased", () => {
    const removed = aRectangle("removed");
    const kept = { ...aRectangle("kept"), x: 500 };
    const stroke: FreehandElement = {
      id: "f",
      type: "freehand",
      x: 0,
      y: 0,
      points: [],
      style: { ...DEFAULT_STYLE },
    };
    const pieceA = { ...stroke, id: "a" };
    const pieceB = { ...stroke, id: "b" };
    const erasure = createErasure();
    erasure.removedIds.add("removed");
    erasure.piecesById.set("f", [pieceA, pieceB]);

    const preview = getErasePreview([removed, stroke, kept], erasure);

    expect(preview.scene).toEqual([pieceA, pieceB, kept]);
    expect(preview.erased).toEqual([removed, stroke]);
  });
});

describe("splitStroke", () => {
  // A straight stroke from (0, 0) to (100, 0), sampled every 10 units, with
  // the default stroke width of 2.
  const aStroke = (): FreehandElement => ({
    id: "f",
    type: "freehand",
    x: 0,
    y: 0,
    points: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => ({ x, y: 0 })),
    style: { ...DEFAULT_STYLE, strokeColor: "#c00" },
  });

  // The world-space x of a piece's first and last points.
  const span = (piece: FreehandElement) => {
    const first = piece.points[0];
    const last = piece.points[piece.points.length - 1];
    return { from: piece.x + first.x, to: piece.x + last.x };
  };

  it("cuts a stroke crossed in the middle into two pieces, one either side", () => {
    const path = [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ];

    const pieces = splitStroke(aStroke(), path, RADIUS)!;

    expect(pieces).toHaveLength(2);
    expect(span(pieces[0]).from).toBe(0);
    expect(span(pieces[0]).to).toBeLessThan(50 - RADIUS);
    expect(span(pieces[1]).from).toBeGreaterThan(50 + RADIUS);
    expect(span(pieces[1]).to).toBe(100);
  });

  it("leaves one piece when the stroke is crossed at an end", () => {
    const path = [
      { x: 100, y: -20 },
      { x: 100, y: 20 },
    ];

    const pieces = splitStroke(aStroke(), path, RADIUS)!;

    expect(pieces).toHaveLength(1);
    expect(span(pieces[0]).from).toBe(0);
    expect(span(pieces[0]).to).toBeLessThan(100 - RADIUS);
  });

  it("leaves no pieces when the stroke is crossed end to end", () => {
    const path = [
      { x: -10, y: 0 },
      { x: 110, y: 0 },
    ];

    expect(splitStroke(aStroke(), path, RADIUS)).toEqual([]);
  });

  it("cuts where the path crosses the middle of one long segment", () => {
    // Two points 100 apart: the path is nowhere near either of them.
    const longStroke: FreehandElement = {
      ...aStroke(),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const path = [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ];

    expect(splitStroke(longStroke, path, RADIUS)).toHaveLength(2);
  });

  it("drops a leftover piece of a single point", () => {
    // Crossing just inside the start leaves only the first point before the cut.
    const path = [
      { x: 4, y: -20 },
      { x: 4, y: 20 },
    ];

    const pieces = splitStroke(aStroke(), path, RADIUS)!;

    expect(pieces).toHaveLength(1);
    expect(span(pieces[0]).from).toBeGreaterThan(4);
    expect(span(pieces[0]).to).toBe(100);
  });

  it("drops a leftover piece under the minimum size on both axes", () => {
    // Leaves the points at x = 0 and x = 1 before the cut: two points, but
    // only 1 unit long.
    const path = [
      { x: 4.5, y: -20 },
      { x: 4.5, y: 20 },
    ];

    const pieces = splitStroke(aStroke(), path, RADIUS)!;

    expect(pieces).toHaveLength(1);
    expect(span(pieces[0]).from).toBeGreaterThan(4.5);
    expect(span(pieces[0]).to).toBe(100);
  });

  it("gives every piece a new id and the stroke's style", () => {
    const stroke = aStroke();
    const path = [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ];

    const [left, right] = splitStroke(stroke, path, RADIUS)!;

    expect(left.id).not.toBe(stroke.id);
    expect(right.id).not.toBe(stroke.id);
    expect(left.id).not.toBe(right.id);
    expect(left.style).toEqual(stroke.style);
    expect(right.style).toEqual(stroke.style);
  });

  it("counts the stroke's width, so touching its visible edge cuts it", () => {
    const wideStroke: FreehandElement = {
      ...aStroke(),
      style: { ...DEFAULT_STYLE, strokeWidth: 20 },
    };
    // 11 units off the line: beyond the radius, but within half the width.
    const path = [{ x: 50, y: 11 }];

    expect(splitStroke(wideStroke, path, RADIUS)).toHaveLength(2);
  });

  it("returns null when the path does not reach the stroke", () => {
    const path = [
      { x: 50, y: 20 },
      { x: 60, y: 20 },
    ];

    expect(splitStroke(aStroke(), path, RADIUS)).toBeNull();
  });
});
