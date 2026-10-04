import { useEffect, type RefObject } from "react";
import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";
import type { History, HistoryEntry } from "@core/history";

interface EditorKeysParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  store: SceneStore;
  editorStore: EditorStore;
  history: History;
}

type EditorAction = "delete" | "undo" | "redo";

/** The editor action a key press asks for, or `null` if it is not ours. */
function getAction(e: KeyboardEvent): EditorAction | null {
  if (e.key === "Delete" || e.key === "Backspace") return "delete";

  // Cmd on a Mac, Ctrl everywhere else.
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return null;

  // Shift turns the key into "Z", so compare in lower case.
  const key = e.key.toLowerCase();
  if (key === "z" && e.shiftKey) return "redo";
  if (key === "z") return "undo";
  if (key === "y" && e.ctrlKey) return "redo";
  return null;
}

/** The id of the element a history entry changed. */
function getEntryElementId(entry: HistoryEntry): string {
  switch (entry.kind) {
    case "add":
      return entry.element.id;
    case "replace":
      return entry.after.id;
    case "remove":
      return entry.element.id;
  }
}

/**
 * The editor's keyboard shortcuts, in any tool:
 * - Delete or Backspace deletes the selected element and clears the selection.
 * - Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
 *
 * All of them are ignored while a pointer is pressed on the canvas, so none
 * can cut into a move, a resize, or a shape being drawn. This hook tracks that
 * press itself rather than asking the tools. Held keys repeat, so holding
 * Ctrl+Z keeps undoing.
 */
export function useEditorKeys({
  canvasRef,
  store,
  editorStore,
  history,
}: EditorKeysParams) {
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

    const deleteSelected = () => {
      const selectedId = editorStore.getSelectedId();
      if (selectedId === null) return;

      const element = store
        .getScene()
        .find((sceneElement) => sceneElement.id === selectedId);
      if (element) {
        // Record where it was, so undo can put it back at the same depth.
        const index = store.removeElement(selectedId);
        history.record({ kind: "remove", element, index });
      }
      editorStore.select(null);
    };

    // After an undo or redo, select the element the entry changed if it is in
    // the scene now, so you see what changed. Otherwise clear the selection,
    // so it never points at a missing element.
    const selectEntryElement = (entry: HistoryEntry) => {
      const id = getEntryElementId(entry);
      const inScene = store.getScene().some((element) => element.id === id);
      editorStore.select(inScene ? id : null);
    };

    const undo = () => {
      const entry = history.undo();
      // Nothing to undo: leave the selection alone.
      if (entry) selectEntryElement(entry);
    };

    const redo = () => {
      const entry = history.redo();
      if (entry) selectEntryElement(entry);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = getAction(e);
      if (action === null) return;
      if (pressing) return;

      // Ours now, so the browser's own Ctrl+Z / Ctrl+Y never runs as well.
      e.preventDefault();

      switch (action) {
        case "delete":
          deleteSelected();
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
      }
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
  }, [canvasRef, store, editorStore, history]);
}
