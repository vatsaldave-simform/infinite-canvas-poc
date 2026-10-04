import { useEffect, type RefObject } from "react";
import type { Viewport } from "@core/canvas";
import {
  getTouchedElements,
  type Point,
  type Scene,
  type SceneElement,
  type SceneStore,
} from "@core/scene";
import type { EditorStore } from "@core/editor";
import type { History, SceneOperation } from "@core/history";
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

/**
 * What the canvas draws instead of the store's scene while the eraser is
 * pressed: the scene without the elements about to be erased, and those
 * elements, drawn faded beneath it.
 */
export interface ErasePreview {
  scene: Scene;
  erased: SceneElement[];
}

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
 * The eraser: drag across shapes to erase every one whose outline the
 * pointer's path passes within the eraser's radius of, at any depth.
 *
 * While pressed, the store is left alone and the canvas draws a preview
 * instead, with the elements about to go faded. Releasing removes them all
 * and records one compound history entry, so one undo brings them all back.
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
    // The ids of every element this gesture has touched so far.
    let touchedIds = new Set<string>();

    // Split the scene into what the erase will leave and what it will remove.
    const showPreview = () => {
      const scene: Scene = [];
      const erased: SceneElement[] = [];
      for (const element of store.getScene()) {
        if (touchedIds.has(element.id)) {
          erased.push(element);
        } else {
          scene.push(element);
        }
      }
      previewRef.current = { scene, erased };
      scheduleRender();
    };

    // Touch whatever the path passes over. Nothing is erased until release. The radius is worked out at the
    // current zoom, so the eraser is the same size on screen at every scale.
    const touchAlong = (path: Point[]) => {
      const radius = ERASER_RADIUS_PX / viewportRef.current.scale;
      const touched = getTouchedElements(store.getScene(), path, radius);

      let touchedSomethingNew = false;
      for (const element of touched) {
        if (!touchedIds.has(element.id)) {
          touchedIds.add(element.id);
          touchedSomethingNew = true;
        }
      }
      if (touchedSomethingNew) showPreview();
    };

    // Remove every touched element and record them as one change. Each one
    // is removed where it stands at that moment, so undo, which puts them back
    // last first, returns each one to its old depth.
    const commit = () => {
      if (touchedIds.size === 0) return;

      const operations: SceneOperation[] = [];
      for (const element of store.getScene()) {
        if (!touchedIds.has(element.id)) continue;
        const index = store.removeElement(element.id);
        operations.push({ kind: "remove", element, index });
      }
      history.record({ kind: "compound", operations });

      // The selection must never point at an element that is gone.
      const selectedId = editorStore.getSelectedId();
      if (selectedId !== null && touchedIds.has(selectedId)) {
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
      touchedIds = new Set();
      previewRef.current = null;
      scheduleRender();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only
      if (lastPoint) return; // one pointer erases at a time
      canvas.setPointerCapture(e.pointerId); // keep erasing if it leaves the canvas

      pointerId = e.pointerId;
      lastPoint = pointerToWorld(canvas, e, viewportRef.current);
      touchAlong([lastPoint]);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!lastPoint || e.pointerId !== pointerId) return;

      // The path runs from the last sample to this one, so a fast drag that
      // jumps over an outline still touches it.
      const point = pointerToWorld(canvas, e, viewportRef.current);
      touchAlong([lastPoint, point]);
      lastPoint = point;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!lastPoint || e.pointerId !== pointerId) return;

      touchAlong([lastPoint, pointerToWorld(canvas, e, viewportRef.current)]);
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
