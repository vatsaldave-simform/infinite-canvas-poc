import { useEffect, type RefObject } from "react";
import type { Viewport } from "@core/canvas";
import {
  createErasure,
  eraseAlong,
  getErasePreview,
  isErased,
  type ErasePreview,
  type Erasure,
  type Point,
  type SceneStore,
} from "@core/scene";
import type { EditorStore } from "@core/editor";
import { applyErase, type History } from "@core/history";
import { pointerToWorld } from "./pointer";

/** The eraser's radius, in SCREEN px; divided by scale → world units, like slop. */
const ERASER_RADIUS_PX = 8;

/**
 * A circle the size of the eraser, centred on the pointer. The image has a
 * pixel to spare on each side so the circle's outline is not clipped.
 */
const CURSOR_SIZE = ERASER_RADIUS_PX * 2 + 2;
const CURSOR_CENTER = CURSOR_SIZE / 2;
const ERASER_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}">
  <circle cx="${CURSOR_CENTER}" cy="${CURSOR_CENTER}" r="${ERASER_RADIUS_PX}" fill="rgba(255,255,255,0.6)" stroke="#3a3a3a" stroke-width="1"/>
</svg>`;
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ERASER_CURSOR_SVG)}") ${CURSOR_CENTER} ${CURSOR_CENTER}, crosshair`;

interface EraserToolParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewportRef: RefObject<Viewport>;
  scheduleRender: () => void;
  store: SceneStore;
  editorStore: EditorStore;
  history: History;
  /** Shared with usePanZoom's render loop, which draws it in place of the scene. */
  previewRef: RefObject<ErasePreview | null>;
  /** Only wired up while the eraser is the active tool. */
  active: boolean;
}

/**
 * The eraser: drag across the canvas to erase whatever the pointer's path
 * passes within the eraser's radius of, at any depth. A freehand stroke is cut
 * where the path crosses it, leaving its pieces either side; a rectangle or
 * ellipse is removed whole when the path touches its outline.
 *
 * While pressed, the store is left alone and the canvas draws a preview
 * instead, with the pieces in place of each cut stroke and the parts about to
 * go faded beneath. Releasing makes the erase in the store and records one
 * compound history entry, so one undo brings everything back.
 * Pointercancel, or Escape while pressed, throws the preview away and erases
 * nothing. An erase that touched nothing records nothing.
 *
 * Switching to the eraser clears the selection. The tool stays on the eraser
 * after each gesture, since erasing takes several passes.
 */
export function useEraserTool({
  canvasRef,
  viewportRef,
  scheduleRender,
  store,
  editorStore,
  history,
  previewRef,
  active,
}: EraserToolParams) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    editorStore.select(null);
    canvas.style.cursor = ERASER_CURSOR;

    // The last pointer sample in world space, or null when not pressed.
    let lastPoint: Point | null = null;
    // The pointer erasing right now, or null when not pressed.
    let pointerId: number | null = null;
    // What this gesture has erased so far.
    let erasure: Erasure = createErasure();

    // Erase along one more stretch of the path, in the preview only: the
    // store is untouched until release. The radius is worked out at the
    // current zoom, so the eraser is the same size on screen at every scale.
    const eraseStretch = (path: Point[]) => {
      const radius = ERASER_RADIUS_PX / viewportRef.current.scale;
      const erasedSomething = eraseAlong(store.getScene(), erasure, path, radius);
      if (!erasedSomething) return;

      previewRef.current = getErasePreview(store.getScene(), erasure);
      scheduleRender();
    };

    // Make the erase in the store and record it as one change.
    const commit = () => {
      const entry = applyErase(store, erasure);
      if (!entry) return;
      history.record(entry);

      // The selection must never point at an element that is gone.
      const selectedId = editorStore.getSelectedId();
      if (selectedId !== null && isErased(erasure, selectedId)) {
        editorStore.select(null);
      }
    };

    // Forget the gesture and drop the preview, so the store's scene shows
    // again. Shared by release, pointercancel and Escape.
    const endGesture = () => {
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
      lastPoint = null;
      pointerId = null;
      erasure = createErasure();
      previewRef.current = null;
      scheduleRender();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only
      if (lastPoint) return; // one pointer erases at a time
      canvas.setPointerCapture(e.pointerId); // keep erasing if it leaves the canvas

      pointerId = e.pointerId;
      lastPoint = pointerToWorld(canvas, e, viewportRef.current);
      eraseStretch([lastPoint]);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!lastPoint || e.pointerId !== pointerId) return;

      // The path runs from the last sample to this one, so a fast drag that
      // jumps over a line between samples still erases it.
      const point = pointerToWorld(canvas, e, viewportRef.current);
      eraseStretch([lastPoint, point]);
      lastPoint = point;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!lastPoint || e.pointerId !== pointerId) return;

      eraseStretch([lastPoint, pointerToWorld(canvas, e, viewportRef.current)]);
      commit();
      endGesture();
    };

    // Cancelling erases nothing: nothing was committed, so there is nothing to
    // put back.
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      endGesture();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lastPoint) endGesture();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      // Leaving the tool mid-gesture erases nothing either.
      if (lastPoint) endGesture();
      canvas.style.cursor = "default";
    };
  }, [
    canvasRef,
    viewportRef,
    scheduleRender,
    store,
    editorStore,
    history,
    previewRef,
    active,
  ]);
}
