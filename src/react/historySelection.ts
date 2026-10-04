import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";
import { getEntrySelection, type HistoryEntry } from "@core/history";

/**
 * After an undo, a redo or a scrub, select what the last entry applied
 * touched, by the rule in getEntrySelection: the one touched element in the
 * scene now, or nothing.
 */
export function selectEntryElement(
  entry: HistoryEntry,
  store: SceneStore,
  editorStore: EditorStore,
) {
  editorStore.select(getEntrySelection(entry, store.getScene()));
}
