/**
 * What the eraser touches. The eraser's path is the polyline through its
 * pointer samples, so a fast drag that jumps over an outline between two
 * samples still touches it. Only outlines count: fills are transparent, so a
 * path through a shape's empty inside touches nothing. That is why this does
 * not reuse the hit test, which counts the inside.
 */

import { distanceToSegment } from "./hit-test";
import type { Point, Scene, SceneElement } from "./types";

/** How many sides the polygon standing in for an ellipse's outline has. */
const ELLIPSE_SIDES = 64;

/** The corners of a rectangle, in order round its outline. */
function getRectangleCorners(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Points round an ellipse inscribed in a box, close enough to stand for its curve. */
function getEllipsePoints(x: number, y: number, width: number, height: number): Point[] {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;

  const points: Point[] = [];
  for (let i = 0; i < ELLIPSE_SIDES; i++) {
    const angle = (i / ELLIPSE_SIDES) * Math.PI * 2;
    points.push({
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    });
  }
  return points;
}

/**
 * The element's outline as a closed polygon in world space: the last point
 * joins back to the first. `null` for a freehand stroke, which has no
 * outline for the eraser to touch.
 */
function getOutline(element: SceneElement): Point[] | null {
  switch (element.type) {
    case "rectangle":
      return getRectangleCorners(element.x, element.y, element.width, element.height);
    case "ellipse":
      return getEllipsePoints(element.x, element.y, element.width, element.height);
    case "freehand":
      return null;
  }
}

/**
 * Which side of the line through `a` and `b` the point `p` is on: positive on
 * one side, negative on the other, zero on the line.
 */
function sideOfLine(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** Whether segment a–b crosses segment c–d, each one's ends either side of the other. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const aAndBOnOppositeSides = sideOfLine(c, d, a) * sideOfLine(c, d, b) < 0;
  const cAndDOnOppositeSides = sideOfLine(a, b, c) * sideOfLine(a, b, d) < 0;
  return aAndBOnOppositeSides && cAndDOnOppositeSides;
}

/** The shortest distance between segment a–b and segment c–d. */
function distanceBetweenSegments(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;

  // Segments that do not cross are closest at one of the four ends.
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/**
 * Whether the eraser's path comes within `radius` of the element's outline.
 * `path` is in world space; a single point is a press that has not moved yet.
 */
export function pathTouchesOutline(
  element: SceneElement,
  path: Point[],
  radius: number,
): boolean {
  const outline = getOutline(element);
  if (!outline || path.length === 0) return false;

  // A path of one point is a segment from that point to itself.
  const points = path.length === 1 ? [path[0], path[0]] : path;

  for (let i = 0; i < points.length - 1; i++) {
    const pathStart = points[i];
    const pathEnd = points[i + 1];

    for (let j = 0; j < outline.length; j++) {
      const outlineStart = outline[j];
      // The last side joins back to the first corner.
      const outlineEnd = outline[(j + 1) % outline.length];

      const distance = distanceBetweenSegments(pathStart, pathEnd, outlineStart, outlineEnd);
      if (distance <= radius) return true;
    }
  }
  return false;
}

/**
 * Every element whose outline the eraser's path touches, at any depth, in
 * z-order (back to front).
 */
export function getTouchedElements(
  scene: Scene,
  path: Point[],
  radius: number,
): SceneElement[] {
  return scene.filter((element) => pathTouchesOutline(element, path, radius));
}
