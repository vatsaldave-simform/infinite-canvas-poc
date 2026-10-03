import { describe, expect, it } from "vitest";

import { getBoundingBox } from "./bounds";
import { DEFAULT_STYLE } from "./factory";
import { canResize, fitElement } from "./resize";
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

describe("canResize", () => {
  it("is true for a rectangle and an ellipse", () => {
    expect(canResize(aRectangle())).toBe(true);
    expect(canResize(anEllipse())).toBe(true);
  });

  it("is false for a freehand stroke", () => {
    const stroke: FreehandElement = {
      id: "freehand-1",
      type: "freehand",
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      style: { ...DEFAULT_STYLE },
    };

    expect(canResize(stroke)).toBe(false);
  });
});
