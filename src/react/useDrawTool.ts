import { useEffect, type RefObject } from 'react'
import type { Viewport } from '@core/canvas'
import {
  createRectangle,
  createEllipse,
  createFreehand,
  normalizeRect,
  isTooSmallStroke,
  DEFAULT_STYLE,
  MIN_ELEMENT_SIZE,
  type FreehandElement,
  type Point,
  type SceneElement,
  type SceneStore,
} from '@core/scene'
import type { EditorStore } from '@core/editor'
import type { History } from '@core/history'
import { pointerToWorld } from './pointer'

/**
 * Active canvas tool. Selecting and moving live in useSelectTool, erasing in
 * useEraserTool.
 */
export type Tool = 'select' | 'rectangle' | 'ellipse' | 'freehand' | 'eraser'

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
  /** Undo/redo history — each committed shape is recorded as one `add`. */
  history: History
  /** Switches the active tool; used to return to select after a shape. */
  onToolChange: (tool: Tool) => void
}

/**
 * Click-drag to create a shape. Rectangle/ellipse are two-corner drags; freehand
 * captures a point per pointermove. A draft (in draftRef, painted on top by the
 * render loop) previews the shape; pointerup finalizes via the factory and
 * commits with store.addElement, recording one history `add` so undo can take
 * it back out. Navigation is wheel-driven, so pointer-drag drawing never
 * collides with it.
 *
 * After a rectangle or ellipse the tool returns to select, so the next click
 * can pick up what was just drawn. Freehand stays put: handwriting takes many
 * strokes in a row.
 *
 * Creation only — selecting and moving are useSelectTool's job.
 */
export function useDrawTool({
  canvasRef,
  viewportRef,
  scheduleRender,
  store,
  tool,
  draftRef,
  editorStore,
  history,
  onToolChange,
}: DrawToolParams) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // useSelectTool and useEraserTool own those tools' gestures.
    if (tool === 'select' || tool === 'eraser') return

    // Pointer position → world point, using the current viewport.
    const toWorld = (e: PointerEvent): Point =>
      pointerToWorld(canvas, e, viewportRef.current)

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

    // Add a finished shape to the scene, record it so it can be undone, and
    // select it. It was added on top, so its index is the last one.
    const commit = (element: SceneElement) => {
      store.addElement(element)
      const index = store.getScene().length - 1
      history.record({ kind: 'add', element, index })
      editorStore.select(element.id) // auto-select the freshly drawn shape
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
        if (!points || isTooSmallStroke(points)) {
          scheduleRender()
          return
        }
        commit(createFreehand(points))
        return
      }

      const from = start
      clearDraft(e)
      if (!from) return
      const { width, height } = normalizeRect(from, end)
      // Ignore a click / near-degenerate drag — no zero-area shapes.
      if (width < MIN_ELEMENT_SIZE || height < MIN_ELEMENT_SIZE) {
        scheduleRender() // clear the (empty) draft
        return
      }
      const el =
        tool === 'ellipse'
          ? createEllipse(from, end)
          : createRectangle(from, end)
      commit(el)
      onToolChange('select')
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
  }, [
    canvasRef,
    viewportRef,
    scheduleRender,
    store,
    tool,
    draftRef,
    editorStore,
    history,
    onToolChange,
  ])
}
