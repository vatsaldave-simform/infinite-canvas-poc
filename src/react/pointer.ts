import { screenToWorld, type Viewport } from '@core/canvas'
import type { Point } from '@core/scene'

/**
 * Pointer event → canvas-relative screen point, in CSS px. The canvas reports
 * client coordinates, which are relative to the page, not the canvas.
 */
export function pointerToScreen(
  canvas: HTMLCanvasElement,
  e: PointerEvent,
): Point {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/**
 * Pointer event → world point. Shared by every tool: the canvas-relative
 * screen point is mapped into world space through the viewport.
 */
export function pointerToWorld(
  canvas: HTMLCanvasElement,
  e: PointerEvent,
  viewport: Viewport,
): Point {
  return screenToWorld(pointerToScreen(canvas, e), viewport)
}
