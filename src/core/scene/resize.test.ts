import { describe, expect, it } from "vitest";

import { getBoundingBox } from "./bounds";
import { DEFAULT_STYLE } from "./factory";
import { fitElement } from "./resize";
import type {
  EllipseElement,
  FreehandElement,
  RectangleElement,
} from "./types";

// Fresh fixtures per test, so a mutation bug in one test can't leak into another.
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
  height: 6,
  style: { ...DEFAULT_STYLE },
});

describe("fitElement", () => {
  describe.each([
    { type: "rectangle", make: aRectangle },
    { type: "ellipse", make: anEllipse },
  ])("on a $type", ({ make }) => {
    it("fits a positive target exactly", () => {
      const fitted = fitElement(make(), { x: 100, y: 50, width: 80, height: 25 });

      expect(fitted).toMatchObject({ x: 100, y: 50, width: 80, height: 25 });
    });

    it("flips a negative target and normalises it to a non-negative size", () => {
      // Width -80 from x=100 means the box runs from 20 to 100.
      const fitted = fitElement(make(), { x: 100, y: 50, width: -80, height: -25 });

      expect(fitted).toMatchObject({ x: 20, y: 25, width: 80, height: 25 });
    });

    it("has a bounding box equal to the normalised target", () => {
      const fitted = fitElement(make(), { x: 0, y: 0, width: -10, height: 30 });

      expect(getBoundingBox(fitted)).toEqual({ x: -10, y: 0, width: 10, height: 30 });
    });

    it("keeps the same style object, so stroke width never changes", () => {
      const element = make();

      const fitted = fitElement(element, { x: 0, y: 0, width: 300, height: 300 });

      expect(fitted.style).toBe(element.style);
    });

    it("keeps id and type", () => {
      const element = make();

      const fitted = fitElement(element, { x: 0, y: 0, width: 5, height: 5 });

      expect(fitted.id).toBe(element.id);
      expect(fitted.type).toBe(element.type);
    });

    it("returns a new element and leaves the original untouched", () => {
      const element = make();
      const before = structuredClone(element);

      const fitted = fitElement(element, { x: 1, y: 2, width: -3, height: 4 });

      expect(fitted).not.toBe(element);
      expect(element).toEqual(before);
    });
  });
});

describe("fitElement on a freehand stroke", () => {
  // Its bounding box is x 10..18, y 16..28: 8 wide, 12 tall.
  const aStroke = (): FreehandElement => ({
    id: "freehand-1",
    type: "freehand",
    x: 10,
    y: 20,
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 8 },
      { x: 8, y: -4 },
    ],
    style: { ...DEFAULT_STYLE },
  });

  // A perfectly straight horizontal stroke: its height is 0.
  const aFlatStroke = (): FreehandElement => ({
    id: "freehand-2",
    type: "freehand",
    x: 5,
    y: 7,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ],
    style: { ...DEFAULT_STYLE },
  });

  it("stretches into a larger target", () => {
    const fitted = fitElement(aStroke(), { x: 100, y: 50, width: 16, height: 24 });

    expect(fitted).toMatchObject({
      x: 100,
      y: 58,
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 16 },
        { x: 16, y: -8 },
      ],
    });
  });

  it("shrinks into a smaller target", () => {
    const fitted = fitElement(aStroke(), { x: 0, y: 0, width: 4, height: 6 });

    expect(fitted).toMatchObject({
      x: 0,
      y: 2,
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 4 },
        { x: 4, y: -2 },
      ],
    });
  });

  it("mirrors into a negative target", () => {
    // Width -8 from x=100 means the box runs from 92 to 100, flipped.
    const fitted = fitElement(aStroke(), { x: 100, y: 50, width: -8, height: 12 });

    // World x of each point: the left-most point now sits on the right edge.
    const worldXs = fitted.points.map((p) => fitted.x + p.x);
    expect(worldXs).toEqual([100, 96, 92]);
    // Height is positive, so y is not mirrored.
    expect(fitted.y).toBe(54);
    expect(fitted.points.map((p) => p.y)).toEqual([0, 8, -4]);
  });

  it("has a bounding box equal to the normalised target", () => {
    const fitted = fitElement(aStroke(), { x: 40, y: 30, width: -32, height: -6 });

    expect(getBoundingBox(fitted)).toEqual({ x: 8, y: 24, width: 32, height: 6 });
  });

  it("keeps the offsets on a flat axis and only moves there", () => {
    const fitted = fitElement(aFlatStroke(), { x: 0, y: 100, width: 40, height: 30 });

    expect(fitted).toMatchObject({
      x: 0,
      y: 100,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 40, y: 0 },
      ],
    });
    expect(getBoundingBox(fitted)).toEqual({ x: 0, y: 100, width: 40, height: 0 });
  });

  it("keeps the offsets on a flat vertical axis, even when flipped", () => {
    // A perfectly straight vertical stroke: its width is 0.
    const vertical: FreehandElement = {
      ...aFlatStroke(),
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 0, y: 20 },
      ],
    };

    const fitted = fitElement(vertical, { x: 50, y: 0, width: -30, height: -40 });

    expect(fitted.x).toBe(50);
    expect(fitted.points.map((p) => p.x)).toEqual([0, 0, 0]);
    // Height is negative, so the stroke is mirrored vertically: 0..-40.
    expect(fitted.points.map((p) => fitted.y + p.y)).toEqual([0, -20, -40]);
  });

  it("keeps the same style object, so stroke width never changes", () => {
    const stroke = aStroke();

    const fitted = fitElement(stroke, { x: 0, y: 0, width: 300, height: 300 });

    expect(fitted.style).toBe(stroke.style);
  });

  it("returns a new element and leaves the original untouched", () => {
    const stroke = aStroke();
    const before = structuredClone(stroke);

    const fitted = fitElement(stroke, { x: 1, y: 2, width: -3, height: 4 });

    expect(fitted).not.toBe(stroke);
    expect(stroke).toEqual(before);
  });
});
