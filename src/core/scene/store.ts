/**
 * Observable scene store — scene state lives in core/, not React. A tiny
 * observable: immutable mutations + a referentially-stable snapshot, bound to
 * React via useSyncExternalStore. See ARCHITECTURE.md ("Scene model & state").
 */

import type { Scene, SceneElement } from "./types";

export interface SceneStore {
  /**
   * Current scene snapshot. MUST be referentially stable between mutations
   * (same array reference until something actually changes) — this is the
   * getSnapshot contract for useSyncExternalStore.
   */
  getScene(): Scene;

  /**
   * Immutably append an element (new array, new top of z-order) and notify
   * all subscribers. Does not mutate the previous scene array.
   */
  addElement(element: SceneElement): void;

  /**
   * Swap the element with `next.id` for `next`, immutably, PRESERVING its
   * position in the array (z-order must not change). Notifies subscribers.
   * If no element has that id, does nothing — and in particular does NOT
   * allocate a new array, so the getScene() stability contract holds.
   */
  replaceElement(next: SceneElement): void;

  /**
   * Register a listener called after every mutation. Returns an unsubscribe
   * function that removes this listener.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Create a scene store, optionally seeded with an initial scene.
 */
export function createSceneStore(initial?: Scene): SceneStore {
  let current: Scene = initial ?? [];
  const listeners = new Set<() => void>();

  return {
    getScene() {
      return current;
    },
    addElement(element: SceneElement) {
      current = [...current, element];
      listeners.forEach((listener) => {
        listener();
      });
    },
    replaceElement(next: SceneElement) {
      const index = current.findIndex((element) => element.id === next.id);
      if (index === -1) return;

      const updated = [...current];
      updated[index] = next;
      current = updated;

      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
