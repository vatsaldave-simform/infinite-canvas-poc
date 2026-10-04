/**
 * What the eraser touches, and what it leaves of a stroke. The eraser's path
 * is the polyline through its pointer samples, so a fast drag that jumps over
 * an outline between two samples still touches it. For rectangles and
 * ellipses only outlines count: fills are transparent, so a path through a
 * shape's empty inside touches nothing. That is why this does not reuse the
 * hit test, which counts the inside. See CONTEXT.md ("Erase", "Split").
 */

import { getBoundingBox, getPointsBounds } from "./bounds";
import { createFreehand, isTooSmallStroke } from "./factory";
import { distanceToSegment } from "./hit-test";
import type { FreehandElement, Point, Scene, SceneElement } from "./types";

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

/** The path's segments; a path of one point is a segment from that point to itself. */
function getPathSegments(path: Point[]): [Point, Point][] {
  if (path.length === 1) return [[path[0], path[0]]];

  const segments: [Point, Point][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    segments.push([path[i], path[i + 1]]);
  }
  return segments;
}

/** The shortest distance from a point to the eraser's path. */
function distanceToPath(point: Point, path: Point[]): number {
  let shortest = Infinity;
  for (const [start, end] of getPathSegments(path)) {
    shortest = Math.min(shortest, distanceToSegment(point, start, end));
  }
  return shortest;
}

/** A stroke's points in world space rather than as offsets from its origin. */
function getWorldPoints(stroke: FreehandElement): Point[] {
  return stroke.points.map((p) => ({ x: stroke.x + p.x, y: stroke.y + p.y }));
}

/**
 * The same line, with extra points added along any segment longer than
 * `maxSegmentLength`, so that no segment is longer than that.
 */
function subdivide(points: Point[], maxSegmentLength: number): Point[] {
  if (points.length === 0) return [];

  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(length / maxSegmentLength));

    // Points evenly spaced from just after `start` up to and including `end`.
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      result.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }
  return result;
}

/**
 * Whether any of the path comes within `reach` of the stroke's bounding box.
 * A cheap check that saves subdividing every stroke the path is nowhere near.
 */
function isPathNearStroke(path: Point[], stroke: FreehandElement, reach: number): boolean {
  if (path.length === 0) return false;

  const strokeBox = getBoundingBox(stroke);
  const pathBox = getPointsBounds(path);

  return (
    pathBox.x + pathBox.width + reach >= strokeBox.x &&
    pathBox.x - reach <= strokeBox.x + strokeBox.width &&
    pathBox.y + pathBox.height + reach >= strokeBox.y &&
    pathBox.y - reach <= strokeBox.y + strokeBox.height
  );
}

/**
 * Cut a freehand stroke where the eraser's path crossed it, into new pieces
 * with the stroke's style, in stroke order. `null` when the path did not reach
 * it; an empty array when it was erased end to end. Pieces too small to have
 * been drawn are not kept.
 */
export function splitStroke(
  stroke: FreehandElement,
  path: Point[],
  radius: number,
): FreehandElement[] | null {
  // Half the stroke's width counts too, so touching its visible edge cuts it.
  const reach = radius + stroke.style.strokeWidth / 2;
  if (!isPathNearStroke(path, stroke, reach)) return null;

  // Without subdividing, a path crossing the middle of a long segment would
  // find no point near it to drop.
  const points = subdivide(getWorldPoints(stroke), radius / 2);

  // Runs of points the path did not reach, in stroke order.
  const runs: Point[][] = [];
  let currentRun: Point[] = [];
  let droppedAny = false;

  for (const point of points) {
    if (distanceToPath(point, path) <= reach) {
      droppedAny = true;
      if (currentRun.length > 0) runs.push(currentRun);
      currentRun = [];
    } else {
      currentRun.push(point);
    }
  }
  if (currentRun.length > 0) runs.push(currentRun);

  if (!droppedAny) return null;

  const pieces: FreehandElement[] = [];
  for (const run of runs) {
    if (isTooSmallStroke(run)) continue;
    pieces.push(createFreehand(run, stroke.style));
  }
  return pieces;
}

/**
 * What one erase gesture has done so far. It is gesture state, like a draft:
 * not part of the scene, so it is changed in place as the gesture goes on.
 */
export interface Erasure {
  /** The ids of rectangles and ellipses the path touched. They go whole. */
  removedIds: Set<string>;
  /** For each stroke the path crossed, by id, the pieces left of it so far. */
  piecesById: Map<string, FreehandElement[]>;
}

/** Whether the erasure removes the element or cuts it into pieces. */
export function isErased(erasure: Erasure, id: string): boolean {
  return erasure.removedIds.has(id) || erasure.piecesById.has(id);
}

/** An erasure that has erased nothing yet. */
export function createErasure(): Erasure {
  return { removedIds: new Set(), piecesById: new Map() };
}

/**
 * Cut whichever of a stroke's pieces the path crosses. Returns the pieces
 * after the cut, or `null` when the path crossed none of them.
 */
function cutPieces(
  pieces: FreehandElement[],
  path: Point[],
  radius: number,
): FreehandElement[] | null {
  const result: FreehandElement[] = [];
  let cutAny = false;

  for (const piece of pieces) {
    const smallerPieces = splitStroke(piece, path, radius);
    if (smallerPieces === null) {
      result.push(piece);
    } else {
      result.push(...smallerPieces);
      cutAny = true;
    }
  }

  if (!cutAny) return null;
  return result;
}

/**
 * Erase along one more stretch of the eraser's path, at every depth: mark the
 * rectangles and ellipses whose outline it touches, and cut the strokes it
 * crosses. A stroke already cut has only its pieces cut further, so earlier
 * stretches are never worked out again. `scene` is the scene as it was when
 * the gesture began. Returns whether anything new was erased.
 */
export function eraseAlong(
  scene: Scene,
  erasure: Erasure,
  path: Point[],
  radius: number,
): boolean {
  let erasedSomething = false;

  for (const element of scene) {
    if (element.type === "freehand") {
      const piecesSoFar = erasure.piecesById.get(element.id) ?? [element];
      const pieces = cutPieces(piecesSoFar, path, radius);
      if (pieces !== null) {
        erasure.piecesById.set(element.id, pieces);
        erasedSomething = true;
      }
    } else if (!erasure.removedIds.has(element.id) && pathTouchesOutline(element, path, radius)) {
      erasure.removedIds.add(element.id);
      erasedSomething = true;
    }
  }

  return erasedSomething;
}

/**
 * What the canvas draws instead of the scene while the eraser is pressed:
 * `scene` is what the erase will leave, with each cut stroke's pieces in its
 * place, and `erased` is every element it touched, drawn faded beneath. A cut
 * stroke is in both, so the faded part showing between its pieces is exactly
 * the part being erased.
 */
export interface ErasePreview {
  scene: Scene;
  erased: SceneElement[];
}

/** The preview of an erasure, for the scene as it was when the gesture began. */
export function getErasePreview(scene: Scene, erasure: Erasure): ErasePreview {
  const left: Scene = [];
  const erased: SceneElement[] = [];

  for (const element of scene) {
    const pieces = erasure.piecesById.get(element.id);
    if (erasure.removedIds.has(element.id)) {
      erased.push(element);
    } else if (pieces) {
      erased.push(element);
      left.push(...pieces);
    } else {
      left.push(element);
    }
  }

  return { scene: left, erased };
}
