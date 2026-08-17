import { describe, expect, it } from "vitest";

import {
  createFreehand,
  createRectangle,
  DEFAULT_STYLE,
  freehandGeometry,
  normalizeRect,
} from "./factory";

describe("normalizeRect", () => {
  // Every drag below describes the same rect, just gripped from a different
  // corner — so all four must normalize identically.
  it.each([
    {
      direction: "top-left → bottom-right",
      start: { x: 10, y: 10 },
      end: { x: 40, y: 30 },
    },
    {
      direction: "bottom-right → top-left",
      start: { x: 40, y: 30 },
      end: { x: 10, y: 10 },
    },
    {
      direction: "top-right → bottom-left",
      start: { x: 40, y: 10 },
      end: { x: 10, y: 30 },
    },
    {
      direction: "bottom-left → top-right",
      start: { x: 10, y: 30 },
      end: { x: 40, y: 10 },
    },
  ])("normalizes a $direction drag to a non-negative origin", ({
    start,
    end,
  }) => {
    expect(normalizeRect(start, end)).toEqual({
      x: 10,
      y: 10,
      width: 30,
      height: 20,
    });
  });

  it("yields zero size for a click without a drag", () => {
    expect(normalizeRect({ x: 7, y: 9 }, { x: 7, y: 9 })).toEqual({
      x: 7,
      y: 9,
      width: 0,
      height: 0,
    });
  });
});

describe("freehandGeometry", () => {
  it("splits absolute points into an origin plus relative offsets", () => {
    const geometry = freehandGeometry([
      { x: 100, y: 200 },
      { x: 110, y: 190 },
      { x: 90, y: 260 },
    ]);

    expect(geometry).toEqual({
      x: 100,
      y: 200,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: -10 },
        { x: -10, y: 60 },
      ],
    });
  });

  it("anchors the first offset at exactly the origin", () => {
    // Exact, not approximate: p - p is 0 for any float, so this invariant
    // holds even for fractional world coordinates.
    const geometry = freehandGeometry([
      { x: 3.7, y: -12.25 },
      { x: 4, y: -12 },
    ]);

    expect(geometry.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("falls back to the world origin for an empty point run", () => {
    expect(freehandGeometry([])).toEqual({ x: 0, y: 0, points: [] });
  });
});

describe("element factories", () => {
  it("normalizes geometry and merges style over the defaults", () => {
    const rect = createRectangle(
      { x: 40, y: 30 },
      { x: 10, y: 10 },
      { strokeWidth: 8 },
    );

    expect(rect).toMatchObject({
      type: "rectangle",
      x: 10,
      y: 10,
      width: 30,
      height: 20,
      style: { ...DEFAULT_STYLE, strokeWidth: 8 },
    });
  });

  it("builds a freehand element with offsets relative to its origin", () => {
    expect(
      createFreehand([
        { x: 5, y: 5 },
        { x: 15, y: 25 },
      ]),
    ).toMatchObject({
      type: "freehand",
      x: 5,
      y: 5,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ],
    });
  });

  it("assigns a distinct id to every element", () => {
    // ids come from crypto.randomUUID(), so assert uniqueness — never a value.
    const first = createRectangle({ x: 0, y: 0 }, { x: 1, y: 1 });
    const second = createRectangle({ x: 0, y: 0 }, { x: 1, y: 1 });

    expect(first.id).not.toBe(second.id);
  });
});
