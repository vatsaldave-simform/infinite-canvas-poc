/**
 * World ↔ screen coordinate transforms (Milestone 2 — Category A).
 *
 * The canvas shows a *window* onto an infinite world. Two coordinate spaces:
 *   - world:  where elements live (their x/y in the scene). Never changes when
 *             you pan or zoom.
 *   - screen: pixels relative to the canvas's top-left, as reported by pointer
 *             events (CSS pixels — device-pixel-ratio is handled separately at
 *             render time in M4, don't fold it in here).
 *
 * The `Viewport` below fully describes the current window. Everything else is
 * derived from it.
 *
 * ─── YOUR TASK ────────────────────────────────────────────────────────────
 * Implement the three functions. The Viewport field meanings are the contract;
 * derive the math from them. Do not change the signatures.
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

/**
 * Screen pixel → world coordinate.
 * Inverse of worldToScreen: given where something is on screen, where is it in
 * the world? (You'll use this to turn a pointer position into a world point.)
 */
export function screenToWorld(screen: Point, viewport: Viewport): Point {
  // TODO (you): invert the world→screen mapping using the Viewport fields.
  const worldX = (screen.x - viewport.offsetX) / viewport.scale;
  const worldY = (screen.y - viewport.offsetY) / viewport.scale;

  return { x: worldX, y: worldY };
}

/**
 * World coordinate → screen pixel.
 * Where on the canvas does a given world point land, under the current pan/zoom?
 */
export function worldToScreen(world: Point, viewport: Viewport): Point {
  // TODO (you): map world → screen using scale (about the world origin) then offset.
  const screenX = world.x * viewport.scale + viewport.offsetX;
  const screenY = world.y * viewport.scale + viewport.offsetY;

  return { x: screenX, y: screenY };
}

/**
 * Return a NEW Viewport zoomed to `newScale` such that the world point currently
 * under `anchorScreen` stays under `anchorScreen` after the zoom.
 *
 * `newScale` is the already-decided absolute scale (clamping / how a wheel delta
 * becomes a scale is the caller's job in M3 — not here). `anchorScreen` is the
 * cursor position in screen pixels. Only offsetX/offsetY should change relative
 * to what a naive scale swap would give.
 */
export function zoomAtPoint(
  viewport: Viewport,
  anchorScreen: Point,
  newScale: number,
): Viewport {
  // TODO (you): keep the world point beneath the cursor fixed across the zoom.

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
