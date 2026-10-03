/**
 * Draws the selection highlight — a dashed box around a selected element's
 * world-space bounding box, with resize handles on its corners when asked.
 * This is editor chrome, painted after the scene in its own render step (never
 * inside drawElement). The margin and handle sizes are constants in SCREEN
 * pixels, so they look the same at any zoom.
 */

import type { Bounds, Point } from "@core/scene";
import { worldToScreen, type Viewport } from "./transform";

const SELECTION_COLOR = "#1e88e5";
/** Gap between the shape and the box, in screen px (constant across zoom). */
const SELECTION_MARGIN_PX = 4;
const SELECTION_LINE_WIDTH = 1;
const SELECTION_DASH = [4, 4];

const HANDLE_FILL = "#ffffff";
/** Side of a drawn handle square, in screen px. */
const HANDLE_SIZE_PX = 8;
/** Side of the square a press must land in to grab a handle, in screen px. */
const HANDLE_HIT_SIZE_PX = 12;

/** A corner of the selection box, named by compass direction. */
export type HandleName = "nw" | "ne" | "se" | "sw";

/** A resize handle and its centre, in screen px. */
export interface Handle {
  name: HandleName;
  x: number;
  y: number;
}

/** The dashed selection box's edges, in screen px. */
function getSelectionBoxEdges(bounds: Bounds, viewport: Viewport) {
  const topLeft = worldToScreen({ x: bounds.x, y: bounds.y }, viewport);
  const width = bounds.width * viewport.scale;
  const height = bounds.height * viewport.scale;

  return {
    left: topLeft.x - SELECTION_MARGIN_PX,
    top: topLeft.y - SELECTION_MARGIN_PX,
    right: topLeft.x + width + SELECTION_MARGIN_PX,
    bottom: topLeft.y + height + SELECTION_MARGIN_PX,
  };
}

/**
 * The resize handles for a selected element's bounding box, at the corners of
 * the dashed selection box. Both drawing and hit-testing use this list, so they
 * can never disagree about where a handle is.
 */
export function getHandles(bounds: Bounds, viewport: Viewport): Handle[] {
  const { left, top, right, bottom } = getSelectionBoxEdges(bounds, viewport);

  return [
    { name: "nw", x: left, y: top },
    { name: "ne", x: right, y: top },
    { name: "se", x: right, y: bottom },
    { name: "sw", x: left, y: bottom },
  ];
}

/**
 * The handle under a screen point, or null. When handles overlap, the first
 * one in getHandles' order wins.
 */
export function getHandleAt(
  bounds: Bounds,
  viewport: Viewport,
  screenPoint: Point,
): HandleName | null {
  const reach = HANDLE_HIT_SIZE_PX / 2;

  for (const handle of getHandles(bounds, viewport)) {
    const dx = Math.abs(screenPoint.x - handle.x);
    const dy = Math.abs(screenPoint.y - handle.y);
    if (dx <= reach && dy <= reach) return handle.name;
  }
  return null;
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  viewport: Viewport,
  showHandles: boolean,
): void {
  const { left, top, right, bottom } = getSelectionBoxEdges(bounds, viewport);

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = SELECTION_LINE_WIDTH;
  ctx.setLineDash(SELECTION_DASH); // dash list is part of saved state
  ctx.strokeRect(left, top, right - left, bottom - top);

  if (showHandles) {
    ctx.setLineDash([]);
    ctx.fillStyle = HANDLE_FILL;
    const half = HANDLE_SIZE_PX / 2;
    for (const handle of getHandles(bounds, viewport)) {
      const handleLeft = handle.x - half;
      const handleTop = handle.y - half;
      ctx.fillRect(handleLeft, handleTop, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
      ctx.strokeRect(handleLeft, handleTop, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
    }
  }
  ctx.restore();
}
