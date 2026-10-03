import { useEffect, type RefObject } from "react";
import { getHandleAt, type HandleName, type Viewport } from "@core/canvas";
import {
  fitElement,
  getBoundingBox,
  hitTest,
  translateElement,
  MIN_ELEMENT_SIZE,
  type Bounds,
  type SceneElement,
  type SceneStore,
  type Point,
} from "@core/scene";
import type { EditorStore } from "@core/editor";
import { pointerToScreen, pointerToWorld } from "./pointer";

/** Click slop for hit-testing, in SCREEN px; divided by scale → world tolerance. */
const HIT_SLOP_PX = 6;

/** How far a press must travel, in SCREEN px, before it moves or resizes. */
const DRAG_THRESHOLD_PX = 3;

/** The cursor shown over each handle, and during a resize from it. */
const HANDLE_CURSORS: Record<HandleName, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

/** Push a size at least MIN_ELEMENT_SIZE away from zero, keeping its sign. */
function clampSize(size: number): number {
  if (size < 0) return Math.min(size, -MIN_ELEMENT_SIZE);
  return Math.max(size, MIN_ELEMENT_SIZE);
}

/**
 * The box to fit an element into while one of its handles is dragged by
 * `delta` (world units). The grabbed corner follows the pointer and the anchor,
 * the opposite corner, stays put. Dragging past the anchor makes the width or
 * height negative, which fitElement reads as a flip.
 */
function getResizeTarget(
  original: Bounds,
  handle: HandleName,
  delta: Point,
): Bounds {
  const movesLeft = handle === "nw" || handle === "sw";
  const movesTop = handle === "nw" || handle === "ne";

  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;

  if (movesLeft) left += delta.x;
  else right += delta.x;
  if (movesTop) top += delta.y;
  else bottom += delta.y;

  const width = clampSize(right - left);
  const height = clampSize(bottom - top);

  // Measure the clamped size out from the anchor, so the anchor never moves.
  return {
    x: movesLeft ? right - width : left,
    y: movesTop ? bottom - height : top,
    width,
    height,
  };
}

interface SelectToolParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewportRef: RefObject<Viewport>;
  store: SceneStore;
  editorStore: EditorStore;
  /** Only wired up while the select tool is the active tool. */
  active: boolean;
}

/**
 * The select tool: click to select the topmost element (empty click clears),
 * drag a selected element to move it, drag one of its corner handles to resize
 * it, Escape to deselect.
 *
 * Moving and resizing commit live: every pointermove writes the new element
 * through the scene store, so the selection highlight and hit-testing follow
 * with no second source of truth and no explicit repaint call (usePanZoom
 * repaints on every store mutation). Each frame is recomputed from the element
 * and press point captured on pointerdown, never from the previous frame.
 * See docs/adr/0002-drag-commits-live-to-the-scene-store.md.
 */
export function useSelectTool({
  canvasRef,
  viewportRef,
  store,
  editorStore,
  active,
}: SelectToolParams) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const pick = (e: PointerEvent): SceneElement | null => {
      const viewport = viewportRef.current;
      return hitTest(
        store.getScene(),
        pointerToWorld(canvas, e, viewport),
        HIT_SLOP_PX / viewport.scale,
      );
    };

    // The selected element, if there is one.
    const getSelected = (): SceneElement | null => {
      const selectedId = editorStore.getSelectedId();
      return store.getScene().find((el) => el.id === selectedId) ?? null;
    };

    // The handle of the selected element under the pointer, if any.
    const pickHandle = (e: PointerEvent): HandleName | null => {
      const selected = getSelected();
      if (!selected) return null;
      return getHandleAt(
        getBoundingBox(selected),
        viewportRef.current,
        pointerToScreen(canvas, e),
      );
    };

    const hoverCursor = (e: PointerEvent): string => {
      const handle = pickHandle(e);
      if (handle) return HANDLE_CURSORS[handle];
      return pick(e) ? "move" : "default";
    };

    let pressWorld: Point | null = null;
    let pressScreen: Point | null = null;
    // The element as it was on pointerdown.
    let pressed: SceneElement | null = null;
    // Set when the press grabbed a handle: the gesture resizes, not moves.
    let grabbedHandle: HandleName | null = null;
    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only

      // Handles first, so a handle wins even over an element drawn on top of
      // it, or where it sits outside the shape.
      const handle = pickHandle(e);
      if (handle) {
        pressed = getSelected();
        grabbedHandle = handle;
        canvas.style.cursor = HANDLE_CURSORS[handle];
      } else {
        const hit = pick(e);
        editorStore.select(hit?.id ?? null);
        if (!hit) return; // empty press: deselect, nothing to drag
        pressed = hit;
        canvas.style.cursor = "grabbing";
      }

      canvas.setPointerCapture(e.pointerId);
      pressWorld = pointerToWorld(canvas, e, viewportRef.current);
      pressScreen = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      // While a press is in progress, hover feedback must not run.
      if (!pressScreen || !pressed || !pressWorld) {
        canvas.style.cursor = hoverCursor(e);
        return;
      }

      const distance = Math.hypot(
        e.clientX - pressScreen.x,
        e.clientY - pressScreen.y,
      );
      if (!dragging && distance < DRAG_THRESHOLD_PX) return;
      dragging = true;

      const currentWorld = pointerToWorld(canvas, e, viewportRef.current);
      const delta = {
        x: currentWorld.x - pressWorld.x,
        y: currentWorld.y - pressWorld.y,
      };

      if (grabbedHandle) {
        const target = getResizeTarget(
          getBoundingBox(pressed),
          grabbedHandle,
          delta,
        );
        store.replaceElement(fitElement(pressed, target));
      } else {
        store.replaceElement(translateElement(pressed, delta));
      }
    };

    const endGesture = (e: PointerEvent) => {
      pressScreen = null;
      pressWorld = null;
      pressed = null;
      grabbedHandle = null;
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      canvas.style.cursor = hoverCursor(e);
    };

    // A captured drag can be cut short by the browser (touch interruption,
    // gesture takeover). The element stays where the last move put it — every
    // change was genuinely committed, so rewinding would be the only place
    // in the app where committed state un-does itself. See ADR-0002.
    const onPointerCancel = (e: PointerEvent) => endGesture(e);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") editorStore.select(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endGesture);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endGesture);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      canvas.style.cursor = "default";
    };
  }, [canvasRef, viewportRef, store, editorStore, active]);
}
