/**
 * Boot-time load of the persisted document. See ARCHITECTURE.md ("Persistence").
 */

import type { Scene } from "@core/scene";
import { openDatabase, readDocument } from "./indexed-db";

/** Where the previous mechanism persisted the scene. Removed, never read. */
export const LEGACY_SCENE_KEY = "infinite-canvas:scene";

export interface LoadedDocument {
  /** The open connection, for every later write. */
  db: IDBDatabase;
  /** The persisted scene, to seed the store with. */
  scene: Scene;
}

/**
 * Remove the old localStorage scene. Unconditional and idempotent, so it runs
 * on every boot with no "already done" flag to persist. Cleanup only: if
 * localStorage is unavailable there is nothing to remove, so it never throws.
 */
export function removeLegacyScene(): void {
  try {
    localStorage.removeItem(LEGACY_SCENE_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/** Drop the legacy key, open the database and read the document. */
export async function loadDocument(): Promise<LoadedDocument> {
  removeLegacyScene();
  const db = await openDatabase();
  const scene = await readDocument(db);
  return { db, scene };
}
