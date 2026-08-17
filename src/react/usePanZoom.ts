import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  clampScale,
  drawElement,
  drawReferenceGrid,
  drawSelectionBox,
  renderScene,
  scaleFromWheel,
  zoomAtPoint,
  type Viewport,
} from '@core/canvas'
import { getBoundingBox } from '@core/scene'
import type { Scene, SceneElement, SceneStore } from '@core/scene'
import type { EditorStore } from '@core/editor'

/**
 * Owns the live Viewport, the wheel-driven pan/zoom input, and the rAF-batched
 * render loop (grid → scene → draft). Viewport + scene live in refs so bursts of
 * events repaint the canvas without re-rendering React. Excalidraw-style input:
 * plain wheel/scroll pans, Ctrl/Cmd+wheel or pinch zooms at the cursor.
 * See ARCHITECTURE.md ("The render loop").
 */

// Normalize wheel deltas to pixels and cap magnitude, so core's zoom math stays
// device-agnostic and one mouse notch can't leap several zoom levels.
const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 400
const MAX_ZOOM_DELTA = 20

// Placeholder until the store-sync effect seeds sceneRef on mount. Shared and
// never mutated — scene mutations always produce a new array.
const EMPTY_SCENE: Scene = []

// Line/page-mode wheel events report deltas in lines/pages, not pixels; scale
// them so pan and zoom behave the same across devices and browsers.
function deltaModeScale(deltaMode: number): number {
  if (deltaMode === 1) return LINE_HEIGHT_PX // WheelEvent.DOM_DELTA_LINE
  if (deltaMode === 2) return PAGE_HEIGHT_PX // WheelEvent.DOM_DELTA_PAGE
  return 1
}

function normalizeZoomDelta(e: WheelEvent): number {
  const dy = e.deltaY * deltaModeScale(e.deltaMode)
  return Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, dy))
}

export function usePanZoom(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  store: SceneStore,
  draftRef: RefObject<SceneElement | null>,
  editorStore: EditorStore,
) {
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 1 })
  const frameRef = useRef<number | null>(null)
  // Scene lives in a ref so pan/zoom repaints read the latest without the
  // render callback re-subscribing the wheel listener on every scene change.
  // Seeded by the store-sync effect below, which runs before the first frame.
  const sceneRef = useRef<Scene>(EMPTY_SCENE)
  // Selected id in a ref for the same reason — the render loop reads it without
  // re-subscribing. Selection is editor state, kept separate from the scene.
  const selectedIdRef = useRef<string | null>(null)

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
    // Selection highlight: chrome over the committed scene, under the draft.
    const selectedId = selectedIdRef.current
    if (selectedId) {
      const selected = sceneRef.current.find((el) => el.id === selectedId)
      if (selected) {
        drawSelectionBox(ctx, getBoundingBox(selected), viewportRef.current)
      }
    }
    // Draw the in-progress draft (if any) on top of the committed scene.
    const draft = draftRef.current
    if (draft) drawElement(ctx, draft, viewportRef.current)
  }, [canvasRef, draftRef])

  const scheduleRender = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(render)
  }, [render])

  // Subscribe to the store here — outside React's render — so committing a
  // shape repaints the canvas via the ref/rAF path without re-rendering
  // CanvasBoard or the toolbar.
  useEffect(() => {
    const sync = () => {
      sceneRef.current = store.getScene()
      scheduleRender()
    }
    sync()
    return store.subscribe(sync)
  }, [store, scheduleRender])

  // Repaint when the selection changes, via the same ref/rAF path.
  useEffect(() => {
    const sync = () => {
      selectedIdRef.current = editorStore.getSelectedId()
      scheduleRender()
    }
    sync()
    return editorStore.subscribe(sync)
  }, [editorStore, scheduleRender])

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
        // Pan: the gesture slides the world beneath the viewport. Normalize
        // line/page-mode deltas so panning matches the zoom path's units.
        const scale = deltaModeScale(e.deltaMode)
        viewportRef.current = {
          ...vp,
          offsetX: vp.offsetX - e.deltaX * scale,
          offsetY: vp.offsetY - e.deltaY * scale,
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
