/**
 * Boot-time load of the persisted document. See ARCHITECTURE.md ("Persistence").
 */

import type { Scene } from "@core/scene";
import type { QuarantineRecord } from "./format";
import {
  DATABASE_NAME,
  openDatabase,
  QUARANTINE_OBJECT_STORE,
  quarantineDocument,
  readDocument,
} from "./indexed-db";
import { validateDocument } from "./validate";

/** Where the previous mechanism persisted the scene. Removed, never read. */
export const LEGACY_SCENE_KEY = "infinite-canvas:scene";

export interface LoadedDocument {
  /** The open connection, for every later write. */
  db: IDBDatabase;
  /** The persisted scene to seed the store with; empty after a quarantine. */
  scene: Scene;
  /** The record the document was set aside as, if it could not be loaded. */
  quarantined: QuarantineRecord | null;
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

/**
 * Drop the legacy key, open the database and read the document. A document
 * that fails validation is quarantined whole, and the scene starts empty.
 */
export async function loadDocument(): Promise<LoadedDocument> {
  removeLegacyScene();
  const db = await openDatabase();
  const value = await readDocument(db);
  if (value === undefined) return { db, scene: [], quarantined: null };

  const result = validateDocument(value);
  if (result.ok) return { db, scene: result.scene, quarantined: null };

  const record: QuarantineRecord = {
    value,
    reason: result.reason,
    path: result.path,
    quarantinedAt: new Date().toISOString(),
  };
  await quarantineDocument(db, record);
  // Recovery is devtools-only, so say where the document went.
  console.warn(
    `Persisted document quarantined (${record.reason} at ${record.path || "the root"}). ` +
      `It is kept in IndexedDB: ${DATABASE_NAME} → ${QUARANTINE_OBJECT_STORE}.`,
  );
  return { db, scene: [], quarantined: record };
}
