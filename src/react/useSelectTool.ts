import { useEffect, type RefObject } from "react";
import type { Viewport } from "@core/canvas";
import {
  hitTest,
  translateElement,
  type SceneElement,
  type SceneStore,
  type Point,
} from "@core/scene";
import type { EditorStore } from "@core/editor";
import { pointerToWorld } from "./pointer";

/** Click slop for hit-testing, in SCREEN px; divided by scale → world tolerance. */
const HIT_SLOP_PX = 6;

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
 * drag a selected element to move it, Escape to deselect.
 *
 * Moving commits live — every pointermove writes the new position through the
 * scene store, so the selection highlight and hit-testing follow with no second
 * source of truth and no explicit repaint call (usePanZoom repaints on every
 * store mutation). See docs/adr/0002-drag-commits-live-to-the-scene-store.md.
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

    const DRAG_THRESHOLD_PX = 3;
    let pressWorld: Point | null = null;
    let pressScreen: Point | null = null;
    let pressed: SceneElement | null = null;
    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only
      const hit = pick(e);
      editorStore.select(hit?.id ?? null);
      if (!hit) return; // empty press: deselect, nothing to drag

      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      // TODO(M8): capture pressWorld / pressScreen / pressed here.
      pressWorld = pointerToWorld(canvas, e, viewportRef.current);
      pressScreen = { x: e.clientX, y: e.clientY };
      pressed = hit;
    };

    const onPointerMove = (e: PointerEvent) => {
      // TODO(M8): if a press is in progress, arm past the threshold, apply the
      // move, and return — hover feedback must not run during a drag.

      if (pressScreen && pressed && pressWorld) {
        const currentScreen = { x: e.clientX, y: e.clientY };
        const currentWorld = pointerToWorld(canvas, e, viewportRef.current);

        if (
          dragging ||
          Math.hypot(
            currentScreen.x - pressScreen.x,
            currentScreen.y - pressScreen.y,
          ) >= DRAG_THRESHOLD_PX
        ) {
          dragging = true;
          store.replaceElement(
            translateElement(pressed, {
              x: currentWorld.x - pressWorld.x,
              y: currentWorld.y - pressWorld.y,
            }),
          );
        }
      } else {
        canvas.style.cursor = pick(e) ? "move" : "default";
      }
    };

    const endGesture = (e: PointerEvent) => {
      // TODO(M8): clear the press state here.
      pressScreen = null;
      pressWorld = null;
      pressed = null;
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      canvas.style.cursor = pick(e) ? "move" : "default";
    };

    // A captured drag can be cut short by the browser (touch interruption,
    // gesture takeover). The element stays where the last move put it — every
    // position was genuinely committed, so rewinding would be the only place
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
