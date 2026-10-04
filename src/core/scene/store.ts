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
   * Immutably put an element into the scene at `index`, so it sits at that
   * depth in the z-order. The elements around it keep their order. Notifies
   * subscribers. An index equal to the scene's length puts it on top.
   */
  insertElement(element: SceneElement, index: number): void;

  /**
   * Swap the element with `next.id` for `next`, immutably, PRESERVING its
   * position in the array (z-order must not change). Notifies subscribers.
   * If no element has that id, does nothing — and in particular does NOT
   * allocate a new array, so the getScene() stability contract holds.
   */
  replaceElement(next: SceneElement): void;

  /**
   * Take the element with this id out of the scene, immutably. The elements
   * left keep their order. Notifies subscribers. Returns the index it removed
   * the element from, so the removal can be undone at the same depth. Same
   * contract as replaceElement: an unknown id does nothing, does not allocate
   * a new array, and returns -1.
   */
  removeElement(id: string): number;

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
    insertElement(element: SceneElement, index: number) {
      const updated = [...current];
      updated.splice(index, 0, element);
      current = updated;

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
    removeElement(id: string) {
      const index = current.findIndex((element) => element.id === id);
      if (index === -1) return -1;

      const updated = [...current];
      updated.splice(index, 1);
      current = updated;

      listeners.forEach((listener) => {
        listener();
      });
      return index;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
