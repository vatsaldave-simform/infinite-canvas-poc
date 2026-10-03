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

/**
 * Every way a load can end. None of them is an error thrown at the caller, so
 * the board's `use()` never throws into render.
 */
export type LoadedDocument =
  /** The persisted scene, or an empty one if nothing was persisted yet. */
  | { status: "loaded"; db: IDBDatabase; scene: Scene }
  /** The document could not be loaded and was set aside; the scene starts empty. */
  | { status: "quarantined"; db: IDBDatabase; record: QuarantineRecord }
  /** IndexedDB would not open or read: start empty, and persist nothing this session. */
  | { status: "unavailable"; error: unknown };

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
 * that fails validation is quarantined whole, and the scene starts empty. If
 * the database cannot be opened, read or quarantined into, storage is
 * unavailable: the document is left untouched and nothing is written over it.
 */
export async function loadDocument(): Promise<LoadedDocument> {
  removeLegacyScene();
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    return await readAndValidate(db);
  } catch (error) {
    db?.close();
    console.error("IndexedDB is unavailable, so persisting is off for this session.", error);
    return { status: "unavailable", error };
  }
}

async function readAndValidate(db: IDBDatabase): Promise<LoadedDocument> {
  const value = await readDocument(db);
  if (value === undefined) return { status: "loaded", db, scene: [] };

  const result = validateDocument(value);
  if (result.ok) return { status: "loaded", db, scene: result.scene };

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
  return { status: "quarantined", db, record };
}
