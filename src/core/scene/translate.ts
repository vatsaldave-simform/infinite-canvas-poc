import type { Point, SceneElement } from "./types";

/**
 * Offset an element's world origin by a delta, returning a NEW element.
 */
export function translateElement<T extends SceneElement>(
  el: T,
  delta: Point,
): T {
  const { x, y } = el;
  const translateX = x + delta.x;
  const translateY = y + delta.y;
  const translatedElement: T = { ...el, x: translateX, y: translateY };
  return translatedElement;
}
