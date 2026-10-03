/**
 * Resizing elements. See CONTEXT.md ("Resize", "Fit").
 */

import { getBoundingBox, type Bounds } from "./bounds";
import type { FreehandElement, SceneElement } from "./types";

/**
 * The smallest size, in world units, an element may have. Drawing refuses
 * anything smaller and resizing never shrinks below it, so every element stays
 * big enough to select again.
 */
export const MIN_ELEMENT_SIZE = 2;

/**
 * Place an element into `target`, so that its bounding box becomes that box.
 * Returns a new element; `style` is shared by reference, so stroke width
 * never changes.
 *
 * @param target The box to fit into, in world units. Unlike a bounding box,
 *   its width and height may be NEGATIVE, meaning the element is flipped on
 *   that axis: `{ x: 100, width: -80 }` is the box from 20 to 100.
 */
export function fitElement<T extends SceneElement>(el: T, target: Bounds): T {
  switch (el.type) {
    case "rectangle":
    case "ellipse":
      return { ...el, ...fitBox(target) };
    case "freehand":
      return { ...el, ...fitStroke(el, target) };
    default: {
      const exhaustive: never = el;
      return exhaustive;
    }
  }
}

/**
 * A rectangle or ellipse looks the same flipped, so fitting it only
 * re-normalises the target to a non-negative origin and size.
 */
function fitBox(target: Bounds): Bounds {
  const x = target.width < 0 ? target.x + target.width : target.x;
  const y = target.height < 0 ? target.y + target.height : target.y;
  const width = Math.abs(target.width);
  const height = Math.abs(target.height);

  return { x, y, width, height };
}

/**
 * Stretch a stroke so its bounding box becomes `target`: the origin and every
 * point offset are scaled by the same factor per axis. A negative factor
 * mirrors the stroke. On a flat axis the stroke keeps its zero extent and
 * only moves to the target's x or y.
 */
function fitStroke(stroke: FreehandElement, target: Bounds) {
  const box = getBoundingBox(stroke);

  // A flat axis (a perfectly straight stroke) has nothing to stretch, and
  // dividing by its zero size would give NaN. Keep its offsets instead.
  const scaleX = box.width === 0 ? 1 : target.width / box.width;
  const scaleY = box.height === 0 ? 1 : target.height / box.height;

  // The stroke's bounding box corner lands on the target's corner, and the
  // origin keeps its scaled distance from that corner.
  const x = target.x + (stroke.x - box.x) * scaleX;
  const y = target.y + (stroke.y - box.y) * scaleY;
  const points = stroke.points.map((p) => ({
    x: p.x * scaleX,
    y: p.y * scaleY,
  }));

  return { x, y, points };
}
