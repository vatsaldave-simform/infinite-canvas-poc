import { useEffect, type RefObject } from 'react'
import { screenToWorld, type Viewport } from '@core/canvas'
import {
  createRectangle,
  createEllipse,
  createFreehand,
  hitTest,
  normalizeRect,
  DEFAULT_STYLE,
  type FreehandElement,
  type Point,
  type SceneElement,
  type SceneStore,
} from '@core/scene'
import type { EditorStore } from '@core/editor'

/** Active canvas tool. 'select' is an inert placeholder for now. */
export type Tool = 'select' | 'rectangle' | 'ellipse' | 'freehand'

/** Drags smaller than this (world units) are treated as a click, not a shape. */
const MIN_DRAG_SIZE = 2

/** Click slop for hit-testing, in SCREEN px; divided by scale → world tolerance. */
const HIT_SLOP_PX = 6

/** Placeholder id for the in-progress draft — never committed to the scene. */
const DRAFT_ID = 'draft'

interface DrawToolParams {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportRef: RefObject<Viewport>
  scheduleRender: () => void
  store: SceneStore
  tool: Tool
  /** Shared with usePanZoom's render loop, which draws the draft on top. */
  draftRef: RefObject<SceneElement | null>
  /** Single-select state — set on click (select tool) and after drawing. */
  editorStore: EditorStore
}

/**
 * Click-drag to create a shape. Rectangle/ellipse are two-corner drags; freehand
 * captures a point per pointermove. A draft (in draftRef, painted on top by the
 * render loop) previews the shape; pointerup finalizes via the factory and
 * commits with store.addElement. Navigation is wheel-driven, so pointer-drag
 * drawing never collides with it.
 */
export function useDrawTool({
  canvasRef,
  viewportRef,
  scheduleRender,
  store,
  tool,
  draftRef,
  editorStore,
}: DrawToolParams) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Pointer position → world point, using the current viewport.
    const toWorld = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect()
      return screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewportRef.current,
      )
    }

    // Topmost element under a pointer event, within a constant screen slop
    // (converted to world units via / scale). null when the point misses everything.
    const pick = (e: PointerEvent): SceneElement | null => {
      const tolerance = HIT_SLOP_PX / viewportRef.current.scale
      return hitTest(store.getScene(), toWorld(e), tolerance)
    }

    // Select mode: click picks the topmost element (empty click deselects),
    // hovering shows a pointer cursor over a hittable element, Escape deselects.
    if (tool === 'select') {
      const onSelectDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        editorStore.select(pick(e)?.id ?? null)
      }
      const onSelectHover = (e: PointerEvent) => {
        canvas.style.cursor = pick(e) ? 'pointer' : 'default'
      }
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') editorStore.select(null)
      }
      canvas.addEventListener('pointerdown', onSelectDown)
      canvas.addEventListener('pointermove', onSelectHover)
      window.addEventListener('keydown', onKeyDown)
      return () => {
        canvas.removeEventListener('pointerdown', onSelectDown)
        canvas.removeEventListener('pointermove', onSelectHover)
        window.removeEventListener('keydown', onKeyDown)
        canvas.style.cursor = 'default'
      }
    }

    // Two-corner drag (rectangle/ellipse); null when idle or drawing freehand.
    let start: Point | null = null
    // Accumulated world points (freehand); null when idle or drawing a drag shape.
    let freehandPoints: Point[] | null = null
    // The freehand draft, grown in place per move so we never remap all points.
    let freehandDraft: FreehandElement | null = null

    // Draft carries a placeholder id and its own style copy — it isn't committed
    // until pointerup, and must never share DEFAULT_STYLE by reference.
    const dragDraft = (from: Point, to: Point): SceneElement => ({
      id: DRAFT_ID,
      type: tool === 'ellipse' ? 'ellipse' : 'rectangle',
      ...normalizeRect(from, to),
      style: { ...DEFAULT_STYLE },
    })

    // A stroke whose bounding box is sub-minimum on both axes is a stray click,
    // not a mark. Unlike drag shapes, a single-axis freehand line is valid, so
    // both dimensions must be tiny to reject it.
    const isTinyStroke = (points: Point[]): boolean => {
      let minX = points[0].x
      let maxX = points[0].x
      let minY = points[0].y
      let maxY = points[0].y
      for (const p of points) {
        if (p.x < minX) minX = p.x
        else if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        else if (p.y > maxY) maxY = p.y
      }
      return maxX - minX < MIN_DRAG_SIZE && maxY - minY < MIN_DRAG_SIZE
    }

    // Clear any in-progress draft and release capture. Shared by pointerup's
    // early returns and pointercancel.
    const clearDraft = (e: PointerEvent) => {
      start = null
      freehandPoints = null
      freehandDraft = null
      draftRef.current = null
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return // left button only
      canvas.setPointerCapture(e.pointerId) // keep the drag if it leaves the canvas
      const p = toWorld(e)
      if (tool === 'freehand') {
        freehandPoints = [p]
        freehandDraft = {
          id: DRAFT_ID,
          type: 'freehand',
          x: p.x,
          y: p.y,
          points: [{ x: 0, y: 0 }],
          style: { ...DEFAULT_STYLE },
        }
        draftRef.current = freehandDraft
      } else {
        start = p
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const p = toWorld(e)
      if (tool === 'freehand') {
        if (!freehandPoints || !freehandDraft) return
        freehandPoints.push(p)
        // Append just the new offset (O(1)) — never re-map the whole stroke.
        freehandDraft.points.push({
          x: p.x - freehandDraft.x,
          y: p.y - freehandDraft.y,
        })
      } else {
        if (!start) return
        draftRef.current = dragDraft(start, p)
      }
      scheduleRender()
    }

    const onPointerUp = (e: PointerEvent) => {
      const end = toWorld(e)

      if (tool === 'freehand') {
        const points = freehandPoints
        clearDraft(e)
        // Need a couple of points and a non-negligible span to form a stroke.
        if (!points || points.length < 2 || isTinyStroke(points)) {
          scheduleRender()
          return
        }
        const stroke = createFreehand(points)
        store.addElement(stroke)
        editorStore.select(stroke.id) // auto-select the freshly drawn shape
        return
      }

      const from = start
      clearDraft(e)
      if (!from) return
      const { width, height } = normalizeRect(from, end)
      // Ignore a click / near-degenerate drag — no zero-area shapes.
      if (width < MIN_DRAG_SIZE || height < MIN_DRAG_SIZE) {
        scheduleRender() // clear the (empty) draft
        return
      }
      const el =
        tool === 'ellipse'
          ? createEllipse(from, end)
          : createRectangle(from, end)
      store.addElement(el)
      editorStore.select(el.id) // auto-select the freshly drawn shape
    }

    // A captured drag can be cut short by the browser (touch interruption,
    // gesture takeover) with pointercancel instead of pointerup — drop the draft
    // so it doesn't strand and block the next stroke.
    const onPointerCancel = (e: PointerEvent) => {
      clearDraft(e)
      scheduleRender()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [canvasRef, viewportRef, scheduleRender, store, tool, draftRef, editorStore])
}
