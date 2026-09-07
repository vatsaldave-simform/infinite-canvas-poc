import { screenToWorld, type Viewport } from '@core/canvas'
import type { Point } from '@core/scene'

/**
 * Pointer event → world point. Shared by every tool: the canvas reports client
 * coordinates, which must be made canvas-relative before the viewport can map
 * them into world space.
 */
export function pointerToWorld(
  canvas: HTMLCanvasElement,
  e: PointerEvent,
  viewport: Viewport,
): Point {
  const rect = canvas.getBoundingClientRect()
  return screenToWorld(
    { x: e.clientX - rect.left, y: e.clientY - rect.top },
    viewport,
  )
}
