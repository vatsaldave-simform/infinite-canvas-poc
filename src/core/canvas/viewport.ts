/**
 * Zoom policy: how a wheel/pinch gesture becomes a scale, and how far zoom can
 * go. transform.ts maps coordinates given an absolute scale; this decides the
 * scale. See ARCHITECTURE.md ("Coordinate spaces").
 */

/** Zoom bounds, in screen-pixels-per-world-unit (see `Viewport.scale`). */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 30;

/** Clamp a proposed scale into [MIN_SCALE, MAX_SCALE]. */
export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));
}

/**
 * Wheel `deltaY` → new absolute scale. Multiplicative (a gesture zooms by the
 * same proportion at any level), not additive. Caller clamps.
 */
export function scaleFromWheel(currentScale: number, deltaY: number): number {
  return currentScale * Math.exp(-deltaY * 0.01);
}
