/**
 * Zoom math — the "caller's job" that transform.ts (M2) deliberately left out.
 *
 * transform.ts owns the pure world↔screen mapping and, given an *absolute*
 * target scale, the zoom-at-a-point anchor math (`zoomAtPoint`). What it does
 * NOT decide is how a raw wheel/pinch gesture becomes that target scale, or how
 * far the user is allowed to zoom. That policy lives here (Milestone 3), so the
 * React input layer can stay dumb: read a wheel delta, ask this module for the
 * new scale, hand it to `zoomAtPoint`.
 *
 * ─── YOUR TASK ────────────────────────────────────────────────────────────
 * Implement the two functions below. The stubs keep the build green and make
 * PAN work today; ZOOM stays inert until you fill these in.
 */

/** Zoom bounds, in screen-pixels-per-world-unit (see `Viewport.scale`). */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 30;

/**
 * Clamp a proposed scale into [MIN_SCALE, MAX_SCALE].
 *
 * TODO (you): return `scale` bounded to the min/max above.
 */
export function clampScale(scale: number): number {
  // TODO (you): clamp into [MIN_SCALE, MAX_SCALE].
  return Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));
}

/**
 * Turn a wheel `deltaY` into a new ABSOLUTE scale, starting from `currentScale`.
 *
 * Zoom must feel *multiplicative*, not additive: one notch of scroll should
 * multiply the scale by a constant ratio, so the same gesture zooms by the same
 * proportion whether you're at 0.2× or 20×. (Adding a fixed amount would crawl
 * when zoomed out and jump when zoomed in.) A common shape is
 * `currentScale * factor ** (-deltaY * k)` for a small `k`.
 *
 * Return the result already run through `clampScale` so callers don't have to.
 *
 * TODO (you): derive the new scale from currentScale + deltaY, then clamp.
 */
export function scaleFromWheel(currentScale: number, deltaY: number): number {
  // TODO (you): compute a multiplicative new scale from deltaY, then clampScale(...).
  const newScaleFromWheel = currentScale * Math.exp(-deltaY * 0.01);
  return newScaleFromWheel;
}
