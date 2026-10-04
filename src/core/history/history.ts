/**
 * Undo/redo history: a linear stack of history entries, each a plain-data
 * record of one scene operation. Undo applies an entry's inverse through the
 * scene store and redo applies it again, so the store stays the source of
 * truth. Entries are recorded by whoever owns the action, when it finishes.
 * See docs/adr/0005-history-records-scene-operations.md.
 */

import type { SceneElement, SceneStore } from "@core/scene";

/**
 * One change to the scene:
 * - `add` put a new element into the scene at `index`, as drawing does.
 * - `replace` swapped an element for a new version of itself, as a move or a
 *   resize does.
 * - `remove` took an element out of the scene from `index`, as deleting does.
 */
export type HistoryEntry =
  | {
      kind: "add";
      element: SceneElement;
      index: number;
    }
  | {
      kind: "replace";
      before: SceneElement;
      after: SceneElement;
    }
  | {
      kind: "remove";
      element: SceneElement;
      index: number;
    };

export interface History {
  /** Add a finished change. Anything that could have been redone is dropped. */
  record(entry: HistoryEntry): void;

  /**
   * Revert the most recent change. Returns the entry it reverted, or `null`
   * when there is nothing to undo (and then the scene is left alone).
   */
  undo(): HistoryEntry | null;

  /**
   * Re-apply the most recently undone change. Returns the entry it applied, or
   * `null` when there is nothing to redo (and then the scene is left alone).
   */
  redo(): HistoryEntry | null;
}

/**
 * Create the history for one scene store. It lives as long as the page does:
 * it is never persisted and has no size limit.
 */
export function createHistory(store: SceneStore): History {
  const undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  // Put the scene back as it was before the entry's change.
  const revert = (entry: HistoryEntry) => {
    switch (entry.kind) {
      case "add":
        store.removeElement(entry.element.id);
        break;
      case "replace":
        store.replaceElement(entry.before);
        break;
      case "remove":
        // Back at its old depth, not on top.
        store.insertElement(entry.element, entry.index);
        break;
    }
  };

  // Make the entry's change again.
  const apply = (entry: HistoryEntry) => {
    switch (entry.kind) {
      case "add":
        // Insert, not add: the element goes back at the depth it was drawn at.
        store.insertElement(entry.element, entry.index);
        break;
      case "replace":
        store.replaceElement(entry.after);
        break;
      case "remove":
        store.removeElement(entry.element.id);
        break;
    }
  };

  return {
    record(entry) {
      undoStack.push(entry);
      // History is linear: a new change throws away anything undone.
      redoStack = [];
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return null;

      revert(entry);
      redoStack.push(entry);
      return entry;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return null;

      apply(entry);
      undoStack.push(entry);
      return entry;
    },
  };
}
