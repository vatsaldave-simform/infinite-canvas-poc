/**
 * Resizing elements. See CONTEXT.md ("Resize", "Fit").
 */

import type { Bounds } from "./bounds";
import type { EllipseElement, RectangleElement, SceneElement } from "./types";

/**
 * The smallest size, in world units, an element may have. Drawing refuses
 * anything smaller and resizing never shrinks below it, so every element stays
 * big enough to select again.
 */
export const MIN_ELEMENT_SIZE = 2;

/** The element types that can be resized. */
export type ResizableElement = RectangleElement | EllipseElement;

/** Whether an element can be resized, so whether it shows resize handles. */
export function canResize(el: SceneElement): el is ResizableElement {
  return el.type === "rectangle" || el.type === "ellipse";
}

/**
 * Place an element into `target`, so that its bounding box becomes that box.
 * Returns a new element; `style` is shared by reference, so stroke width
 * never changes.
 *
 * @param target The box to fit into, in world units. Unlike a bounding box,
 *   its width and height may be NEGATIVE, meaning the element is flipped on
 *   that axis: `{ x: 100, width: -80 }` is the box from 20 to 100.
 */
export function fitElement<T extends ResizableElement>(
  el: T,
  target: Bounds,
): T {
  // A rectangle or ellipse looks the same flipped, so it only has to be
  // re-normalised to a non-negative origin and size.
  const x = target.width < 0 ? target.x + target.width : target.x;
  const y = target.height < 0 ? target.y + target.height : target.y;
  const width = Math.abs(target.width);
  const height = Math.abs(target.height);

  return { ...el, x, y, width, height };
}
