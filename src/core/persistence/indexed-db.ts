/**
 * Scene persistence over the raw IndexedDB API: one database, a `documents`
 * object store holding one whole-scene record under a fixed key, and a
 * `quarantine` object store for documents that could not be loaded. See
 * ARCHITECTURE.md ("Persistence"), ADR-0003 and ADR-0004.
 */

import type { Scene } from "@core/scene";
import { FORMAT_VERSION, type QuarantineRecord, type StoredDocument } from "./format";

export const DATABASE_NAME = "infinite-canvas";
/** The object-store layout's version. Independent of the format version. */
export const DATABASE_VERSION = 2;
export const DOCUMENTS_OBJECT_STORE = "documents";
export const QUARANTINE_OBJECT_STORE = "quarantine";

/** The single document's key. Out-of-line: the record carries no id of its own. */
export const DOCUMENT_KEY = "scene";

type ObjectStoreName = typeof DOCUMENTS_OBJECT_STORE | typeof QUARANTINE_OBJECT_STORE;

/**
 * Open the database, creating whichever object stores this database version
 * adds over the one on disk. The connection closes itself on `versionchange`,
 * so a later build opening a higher version in another tab is never blocked by
 * this one. An open that *is* blocked, by a tab that will not let go, rejects
 * rather than waiting indefinitely; if it is unblocked later, the late
 * connection is closed again.
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore(DOCUMENTS_OBJECT_STORE);
      if (event.oldVersion < 2) {
        db.createObjectStore(QUARANTINE_OBJECT_STORE, { autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) return db.close();
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new DOMException("Another tab is blocking the database open.", "AbortError"));
    };
  });
}

/**
 * Read the stored document exactly as it is, or `undefined` if nothing has
 * been persisted yet. Untyped on purpose: it is validated before it is trusted.
 */
export function readDocument(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(DOCUMENTS_OBJECT_STORE, "readonly")
      .objectStore(DOCUMENTS_OBJECT_STORE)
      .get(DOCUMENT_KEY);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist the scene as the document, replacing whatever was there. Resolves
 * once the transaction commits.
 */
export function writeDocument(db: IDBDatabase, scene: Scene): Promise<void> {
  return writeRawDocument(db, toStoredDocument(scene));
}

function toStoredDocument(scene: Scene): StoredDocument {
  return { version: FORMAT_VERSION, elements: scene };
}

/** How long one document write took, split where the main thread is released. */
export interface WriteTiming {
  /** Milliseconds inside `put()`: the synchronous structured clone. */
  cloneMs: number;
  /** Milliseconds from `put()` returning to the transaction's `complete`. */
  commitMs: number;
}

/**
 * `writeDocument`, timed: the same transaction and the same value, with the
 * synchronous `put()` and the wait for the commit measured separately.
 * Diagnostics only.
 */
export async function writeDocumentTimed(
  db: IDBDatabase,
  scene: Scene,
): Promise<WriteTiming> {
  const record = toStoredDocument(scene);
  let cloneMs = 0;
  let queuedAt = 0;

  await inReadwrite(db, [DOCUMENTS_OBJECT_STORE], (transaction) => {
    const documents = transaction.objectStore(DOCUMENTS_OBJECT_STORE);
    const started = performance.now();
    documents.put(record, DOCUMENT_KEY);
    queuedAt = performance.now();
    cloneMs = queuedAt - started;
  });

  return { cloneMs, commitMs: performance.now() - queuedAt };
}

/** Write any value as the document, bypassing the envelope. Diagnostics only. */
export function writeRawDocument(db: IDBDatabase, value: unknown): Promise<void> {
  return inReadwrite(db, [DOCUMENTS_OBJECT_STORE], (transaction) => {
    transaction.objectStore(DOCUMENTS_OBJECT_STORE).put(value, DOCUMENT_KEY);
  });
}

/** Delete the document, so the next load starts empty. */
export function deleteDocument(db: IDBDatabase): Promise<void> {
  return inReadwrite(db, [DOCUMENTS_OBJECT_STORE], (transaction) => {
    transaction.objectStore(DOCUMENTS_OBJECT_STORE).delete(DOCUMENT_KEY);
  });
}

/**
 * Move the document into quarantine. One transaction across both object
 * stores, so the record is never in both places and never in neither.
 */
export function quarantineDocument(
  db: IDBDatabase,
  record: QuarantineRecord,
): Promise<void> {
  return inReadwrite(
    db,
    [DOCUMENTS_OBJECT_STORE, QUARANTINE_OBJECT_STORE],
    (transaction) => {
      transaction.objectStore(QUARANTINE_OBJECT_STORE).add(record);
      transaction.objectStore(DOCUMENTS_OBJECT_STORE).delete(DOCUMENT_KEY);
    },
  );
}

/**
 * Run requests in one readwrite transaction; resolve when it commits. A failed
 * request aborts the transaction, so `abort` is the one failure path to watch.
 * Committed explicitly once `run` has queued its requests, because a write
 * issued during page unload may never reach the implicit end-of-task commit.
 */
function inReadwrite(
  db: IDBDatabase,
  objectStores: ObjectStoreName[],
  run: (transaction: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(objectStores, "readwrite");
    run(transaction);
    transaction.commit();

    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}
