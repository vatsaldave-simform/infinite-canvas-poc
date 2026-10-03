import { useEffect, type RefObject } from "react";
import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";

interface DeleteKeyParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  store: SceneStore;
  editorStore: EditorStore;
}

/**
 * Delete or Backspace deletes the selected element, in any tool. It removes
 * the element from the scene and clears the selection.
 *
 * The key is ignored while a pointer is pressed on the canvas, so it can't
 * cut into a move, a resize, or a shape being drawn. This hook tracks that
 * press itself rather than asking the tools.
 */
export function useDeleteKey({ canvasRef, store, editorStore }: DeleteKeyParams) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let pressing = false;

    const onPointerDown = (e: PointerEvent) => {
      // Only the left button starts a gesture in any tool.
      if (e.button === 0) pressing = true;
    };

    const onPointerEnd = () => {
      pressing = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (pressing) return;

      const selectedId = editorStore.getSelectedId();
      if (selectedId === null) return;

      store.removeElement(selectedId);
      editorStore.select(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    // Listen on window so a release anywhere ends the press, even one the
    // canvas didn't capture.
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasRef, store, editorStore]);
}
