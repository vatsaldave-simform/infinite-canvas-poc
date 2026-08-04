/**
 * Element factories: turn user input into well-formed SceneElements — assign an
 * id, apply a default style, and normalize geometry. The types allow signed
 * width/height mid-drag; normalization to a non-negative origin + size happens
 * here at creation time.
 */

import type {
  EllipseElement,
  ElementStyle,
  FreehandElement,
  Point,
  RectangleElement,
} from "./types";

/** Default appearance for newly-created elements. */
export const DEFAULT_STYLE: ElementStyle = {
  strokeColor: "#1e1e1e",
  fillColor: "transparent",
  strokeWidth: 2,
};

/**
 * Normalize two drag corners into a non-negative origin + size, regardless of
 * drag direction (e.g. bottom-right → top-left yields a valid rect, not
 * negative dimensions).
 */
export function normalizeRect(
  start: Point,
  end: Point,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Build a RectangleElement from two world-space drag corners.
 * `style` overrides are merged over DEFAULT_STYLE.
 */
export function createRectangle(
  start: Point,
  end: Point,
  style?: Partial<ElementStyle>,
): RectangleElement {
  return {
    id: crypto.randomUUID(),
    type: "rectangle",
    ...normalizeRect(start, end),
    style: { ...DEFAULT_STYLE, ...style },
  };
}

/** Build an EllipseElement from two world-space drag corners (bounding box). */
export function createEllipse(
  start: Point,
  end: Point,
  style?: Partial<ElementStyle>,
): EllipseElement {
  return {
    id: crypto.randomUUID(),
    type: "ellipse",
    ...normalizeRect(start, end),
    style: { ...DEFAULT_STYLE, ...style },
  };
}

/**
 * Split a run of absolute world points into an origin + relative offsets (the
 * first point becomes the origin, so `points[0]` is {0,0}).
 */
export function freehandGeometry(worldPoints: Point[]): {
  x: number;
  y: number;
  points: Point[];
} {
  const origin = worldPoints[0] ?? { x: 0, y: 0 };
  return {
    x: origin.x,
    y: origin.y,
    points: worldPoints.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
  };
}

/** Build a FreehandElement from a run of absolute world points. */
export function createFreehand(
  worldPoints: Point[],
  style?: Partial<ElementStyle>,
): FreehandElement {
  return {
    id: crypto.randomUUID(),
    type: "freehand",
    ...freehandGeometry(worldPoints),
    style: { ...DEFAULT_STYLE, ...style },
  };
}
