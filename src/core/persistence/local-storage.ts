/**
 * Scene persistence over localStorage. Deliberately the naive first pass: one
 * key, one blob, synchronous, with no schema version, no validation and no
 * error handling. Each of those omissions is intentional and load-bearing for
 * the next persistence pass — see `CONTEXT.md` ("Persistence").
 */

import type { Scene } from "@core/scene";

/** Namespaced, so devtools stays legible and later keys cannot collide. */
export const SCENE_STORAGE_KEY = "infinite-canvas:scene";

/**
 * Persist the scene as a bare JSON array. No envelope: the scene *is* an array
 * and its order *is* z-order, so the JSON says exactly that and nothing more.
 * An empty scene is stored as "[]" rather than removing the key.
 */
export function persistScene(scene: Scene): void {
  localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
}

/**
 * Load the persisted scene, or an empty one if nothing has been persisted yet.
 * The stored value is TRUSTED, not validated: a value that is not valid JSON
 * throws from here, and one that parses but is not a Scene passes straight
 * through this cast to fail somewhere later.
 */
export function loadScene(): Scene {
  const raw = localStorage.getItem(SCENE_STORAGE_KEY);
  if (raw === null) return [];

  return JSON.parse(raw) as Scene;
}
