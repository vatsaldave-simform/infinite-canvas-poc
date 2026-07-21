import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  clampScale,
  drawReferenceGrid,
  renderScene,
  scaleFromWheel,
  zoomAtPoint,
  type Viewport,
} from '@core/canvas'
import type { Scene } from '@core/scene'

/**
 * usePanZoom (Milestone 3) — owns the live Viewport and translates wheel/pinch
 * gestures into pan/zoom, then paints the debug reference grid.
 *
 * Excalidraw-style input:
 *   - plain wheel / two-finger scroll  → pan
 *   - Ctrl/Cmd + wheel, trackpad pinch → zoom at the cursor
 *     (browsers deliver a pinch as a wheel event with ctrlKey = true)
 *
 * The viewport lives in a ref, not state: wheel events fire in bursts and none
 * of them need to re-render React — only the canvas repaints, batched through
 * requestAnimationFrame. The actual gesture→scale math lives in core/ (see
 * `scaleFromWheel`/`clampScale`); this hook is pure plumbing.
 */

// Wheel deltas vary wildly by device: trackpad pinch emits small pixel deltas,
// mouse wheels emit large ones — and some report lines/pages, not pixels. We
// normalize to pixels and cap the magnitude here (the device-adapter layer) so
// core's zoom math stays device-agnostic and one mouse notch can't leap several
// zoom levels. Small pinch deltas pass through untouched.
const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 400
const MAX_ZOOM_DELTA = 20

function normalizeZoomDelta(e: WheelEvent): number {
  let dy = e.deltaY
  if (e.deltaMode === 1) dy *= LINE_HEIGHT_PX // WheelEvent.DOM_DELTA_LINE
  else if (e.deltaMode === 2) dy *= PAGE_HEIGHT_PX // WheelEvent.DOM_DELTA_PAGE
  return Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, dy))
}

export function usePanZoom(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  scene: Scene,
) {
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 1 })
  const frameRef = useRef<number | null>(null)
  // Scene lives in a ref so pan/zoom repaints read the latest without the
  // render callback re-subscribing the wheel listener on every scene change.
  const sceneRef = useRef<Scene>(scene)

  const render = useCallback(() => {
    frameRef.current = null
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Backing store is in physical px; draw in CSS px and let the DPR transform
    // bridge the two (per CLAUDE.md, DPR is handled only at the draw boundary).
    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.width / dpr
    const cssHeight = canvas.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    drawReferenceGrid(ctx, viewportRef.current, cssWidth, cssHeight)
    renderScene(ctx, sceneRef.current, viewportRef.current)
  }, [canvasRef])

  const scheduleRender = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(render)
  }, [render])

  // Keep the scene ref current and repaint when the scene changes.
  useEffect(() => {
    sceneRef.current = scene
    scheduleRender()
  }, [scene, scheduleRender])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const vp = viewportRef.current

      if (e.ctrlKey || e.metaKey) {
        // Zoom at the cursor. Anchor is in CSS px relative to the canvas.
        const rect = canvas.getBoundingClientRect()
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const newScale = clampScale(scaleFromWheel(vp.scale, normalizeZoomDelta(e)))
        viewportRef.current = zoomAtPoint(vp, anchor, newScale)
      } else {
        // Pan: the gesture slides the world beneath the viewport.
        viewportRef.current = {
          ...vp,
          offsetX: vp.offsetX - e.deltaX,
          offsetY: vp.offsetY - e.deltaY,
        }
      }

      scheduleRender()
    }

    // Non-passive so preventDefault() actually suppresses browser page-zoom/scroll.
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current)
        // Reset so a later scheduleRender() isn't blocked by a stale id — matters
        // under StrictMode's mount→unmount→remount, which cancels the first frame.
        frameRef.current = null
      }
    }
  }, [canvasRef, scheduleRender])

  return { viewportRef, scheduleRender }
}
