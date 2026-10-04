/**
 * Committing an erase: making the gesture's erasure in the scene store, as
 * one compound history entry. See CONTEXT.md ("Erase", "History entry").
 */

import { isErased, type Erasure, type SceneStore } from "@core/scene";
import type { HistoryEntry, SceneOperation } from "./history";

/**
 * Make the erasure in the store and return it as one compound entry, for the
 * caller to record. A removed rectangle or ellipse is a remove. A cut stroke
 * is a remove, then each of its pieces inserted at the stroke's index and
 * after, so they stand where it stood. Each operation's index is where things
 * are at that moment, so undo, which reverts them last first, puts everything
 * back at its old depth. Returns `null`, and leaves the store alone, when the
 * erasure erased nothing.
 */
export function applyErase(store: SceneStore, erasure: Erasure): HistoryEntry | null {
  const operations: SceneOperation[] = [];

  for (const element of store.getScene()) {
    if (!isErased(erasure, element.id)) continue;

    const index = store.removeElement(element.id);
    operations.push({ kind: "remove", element, index });

    // A removed rectangle or ellipse has no pieces.
    const pieces = erasure.piecesById.get(element.id) ?? [];
    for (let i = 0; i < pieces.length; i++) {
      store.insertElement(pieces[i], index + i);
      operations.push({ kind: "add", element: pieces[i], index: index + i });
    }
  }

  if (operations.length === 0) return null;
  return { kind: "compound", operations };
}
