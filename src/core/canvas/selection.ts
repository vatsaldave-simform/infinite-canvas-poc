/**
 * Draws the selection highlight — a dashed box around a selected element's
 * world-space bounding box. This is editor chrome, painted after the scene in
 * its own render step (never inside drawElement). The margin is a constant in
 * SCREEN pixels, so the box sits the same distance outside the shape at any zoom.
 */

import type { Bounds } from "@core/scene";
import { worldToScreen, type Viewport } from "./transform";

const SELECTION_COLOR = "#1e88e5";
/** Gap between the shape and the box, in screen px (constant across zoom). */
const SELECTION_MARGIN_PX = 4;
const SELECTION_LINE_WIDTH = 1;
const SELECTION_DASH = [4, 4];

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  viewport: Viewport,
): void {
  const topLeft = worldToScreen({ x: bounds.x, y: bounds.y }, viewport);
  const w = bounds.width * viewport.scale;
  const h = bounds.height * viewport.scale;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = SELECTION_LINE_WIDTH;
  ctx.setLineDash(SELECTION_DASH); // dash list is part of saved state
  ctx.strokeRect(
    topLeft.x - SELECTION_MARGIN_PX,
    topLeft.y - SELECTION_MARGIN_PX,
    w + SELECTION_MARGIN_PX * 2,
    h + SELECTION_MARGIN_PX * 2,
  );
  ctx.restore();
}
