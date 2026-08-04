/**
 * World ↔ screen coordinate transforms.
 *
 * The canvas is a window onto an infinite world. `Viewport` describes that
 * window; everything else derives from it. Math works in CSS pixels — DPR is
 * applied only at render time. See ARCHITECTURE.md ("Coordinate spaces").
 */

import type { Point } from "@core/scene";

export interface Viewport {
  /**
   * Pan offset, in SCREEN pixels: the screen position where the world origin
   * (0, 0) currently sits. Panning right by 10px means offsetX increases by 10.
   */
  offsetX: number;
  offsetY: number;
  /**
   * Uniform zoom: how many SCREEN pixels one WORLD unit spans.
   * scale = 1 → 1:1. scale = 2 → zoomed in 2×. Same factor on both axes.
   */
  scale: number;
}

/** Screen pixel → world coordinate. Inverse of worldToScreen. */
export function screenToWorld(screen: Point, viewport: Viewport): Point {
  const worldX = (screen.x - viewport.offsetX) / viewport.scale;
  const worldY = (screen.y - viewport.offsetY) / viewport.scale;

  return { x: worldX, y: worldY };
}

/** World coordinate → screen pixel, under the current pan/zoom. */
export function worldToScreen(world: Point, viewport: Viewport): Point {
  const screenX = world.x * viewport.scale + viewport.offsetX;
  const screenY = world.y * viewport.scale + viewport.offsetY;

  return { x: screenX, y: screenY };
}

/**
 * New Viewport zoomed to `newScale`, keeping the world point under
 * `anchorScreen` (cursor, in screen px) fixed. `newScale` is already decided;
 * only the offset shifts.
 */
export function zoomAtPoint(
  viewport: Viewport,
  anchorScreen: Point,
  newScale: number,
): Viewport {
  const world = screenToWorld(anchorScreen, viewport);

  const newOffsetX = anchorScreen.x - world.x * newScale;
  const newOffsetY = anchorScreen.y - world.y * newScale;

  return {
    ...viewport,
    offsetX: newOffsetX,
    offsetY: newOffsetY,
    scale: newScale,
  };
}
