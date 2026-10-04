import { useEffect, type RefObject } from "react";
import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";
import type { History, Replay } from "@core/history";
import { selectEntryElement } from "./historySelection";

interface EditorKeysParams {
  /** Whether a pointer is pressed on the canvas; see useCanvasPress. */
  canvasPressRef: RefObject<boolean>;
  store: SceneStore;
  editorStore: EditorStore;
  history: History;
  replay: Replay;
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

/**
 * The editor's keyboard shortcuts, in any tool:
 * - Delete or Backspace deletes the selected element and clears the selection.
 * - Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
 *
 * All of them are ignored while a pointer is pressed on the canvas, so none
 * can cut into a move, a resize, or a shape being drawn. Held keys repeat, so
 * holding Ctrl+Z keeps undoing. Each one pauses a replay before it applies.
 */
export function useEditorKeys({
  canvasPressRef,
  store,
  editorStore,
  history,
  replay,
}: EditorKeysParams) {
  useEffect(() => {
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

    const undo = () => {
      const entry = history.undo();
      // Nothing to undo: leave the selection alone.
      if (entry) selectEntryElement(entry, store, editorStore);
    };

    const redo = () => {
      const entry = history.redo();
      if (entry) selectEntryElement(entry, store, editorStore);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = getAction(e);
      if (action === null) return;
      if (canvasPressRef.current) return;

      // Ours now, so the browser's own Ctrl+Z / Ctrl+Y never runs as well.
      e.preventDefault();
      // All of these change the document, so pause a replay first: a change
      // mid-replay would otherwise throw away the rest of the future.
      replay.pause();

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

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasPressRef, store, editorStore, history, replay]);
}
