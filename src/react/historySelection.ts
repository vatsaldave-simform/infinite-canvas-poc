import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";
import type { HistoryEntry } from "@core/history";

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
 * After an undo, a redo or a scrub, select the element the last entry applied
 * changed if it is in the scene now, so you see what changed. Otherwise clear
 * the selection, so it never points at a missing element.
 */
export function selectEntryElement(
  entry: HistoryEntry,
  store: SceneStore,
  editorStore: EditorStore,
) {
  const id = getEntryElementId(entry);
  const inScene = store.getScene().some((element) => element.id === id);
  editorStore.select(inScene ? id : null);
}
