/**
 * World-space reference grid: lines at fixed world coordinates, so they pan and
 * zoom with the viewport (origin axes stay pinned). Pure Canvas2D in CSS
 * pixels — the caller sets the DPR transform and clears the canvas.
 */

import type { Point } from "@core/scene";
import { screenToWorld, worldToScreen, type Viewport } from "./transform";

/** World units between adjacent minor grid lines. */
const MINOR_SPACING_WORLD = 50;
/** Every Nth line is a major (heavier) line. */
const MAJOR_EVERY = 5;
/** Below this on-screen gap (px) the grid is too dense to be useful — skip it. */
const MIN_SCREEN_SPACING = 6;

const MINOR_COLOR = "#d5d8dd";
const MAJOR_COLOR = "#b3b9c2";
const AXIS_COLOR = "#8a92a0";

/**
 * Stroke the reference grid across a `cssWidth` × `cssHeight` viewport.
 * Coordinates are CSS pixels; the caller is responsible for the DPR transform.
 */
export function drawReferenceGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  cssWidth: number,
  cssHeight: number,
): void {
  const screenSpacing = MINOR_SPACING_WORLD * viewport.scale;
  if (screenSpacing < MIN_SCREEN_SPACING) return; // too dense to be legible

  // World-space bounds currently visible on screen.
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: cssWidth, y: cssHeight }, viewport);

  // First grid line at or before the visible edge, snapped to the world grid.
  const firstWorldX =
    Math.floor(topLeft.x / MINOR_SPACING_WORLD) * MINOR_SPACING_WORLD;
  const firstWorldY =
    Math.floor(topLeft.y / MINOR_SPACING_WORLD) * MINOR_SPACING_WORLD;

  ctx.lineWidth = 1;

  // Vertical lines.
  for (let wx = firstWorldX; wx <= bottomRight.x; wx += MINOR_SPACING_WORLD) {
    const { x } = worldToScreen({ x: wx, y: 0 } as Point, viewport);
    strokeVertical(ctx, snapToPixel(x), cssHeight, gridLineColor(wx));
  }
  
  // Horizontal lines.
  for (let wy = firstWorldY; wy <= bottomRight.y; wy += MINOR_SPACING_WORLD) {
    const { y } = worldToScreen({ x: 0, y: wy } as Point, viewport);
    strokeHorizontal(ctx, snapToPixel(y), cssWidth, gridLineColor(wy));
  }
}

/** Major every MAJOR_EVERY steps; the world origin (0) reads as an axis. */
function gridLineColor(worldCoord: number): string {
  if (worldCoord === 0) return AXIS_COLOR;
  const step = Math.round(worldCoord / MINOR_SPACING_WORLD);
  return step % MAJOR_EVERY === 0 ? MAJOR_COLOR : MINOR_COLOR;
}

/** Align to a device-pixel boundary so 1px lines stay crisp, not blurry. */
function snapToPixel(v: number): number {
  return Math.round(v) + 0.5;
}

function strokeVertical(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

function strokeHorizontal(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}
