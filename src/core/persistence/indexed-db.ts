/**
 * Scene persistence over the raw IndexedDB API: one database, one `documents`
 * object store, one whole-scene record under a fixed key. See ARCHITECTURE.md
 * ("Persistence") and ADR-0003.
 */

import type { Scene } from "@core/scene";

export const DATABASE_NAME = "infinite-canvas";
/** The object-store layout's version. Independent of the format version. */
export const DATABASE_VERSION = 1;
export const DOCUMENTS_OBJECT_STORE = "documents";
/** The single document's key. Out-of-line: the record carries no id of its own. */
export const DOCUMENT_KEY = "scene";

/** The shape of what is stored. Changes only when that shape changes. */
export const FORMAT_VERSION = 1;

/** The persisted document. Array order of `elements` is z-order, as in the scene. */
export interface StoredDocument {
  version: typeof FORMAT_VERSION;
  elements: Scene;
}

/**
 * Open the database, creating the object store on first open. The connection
 * closes itself on `versionchange`, so a later build opening a higher version
 * in another tab is never blocked by this one.
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DOCUMENTS_OBJECT_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read the persisted scene, or an empty one if nothing has been persisted yet.
 * The record is trusted, not validated.
 */
export function readDocument(db: IDBDatabase): Promise<Scene> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(DOCUMENTS_OBJECT_STORE, "readonly")
      .objectStore(DOCUMENTS_OBJECT_STORE)
      .get(DOCUMENT_KEY);

    request.onsuccess = () => {
      const record = request.result as StoredDocument | undefined;
      resolve(record?.elements ?? []);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist the scene as the document, replacing whatever was there. Resolves
 * once the transaction commits. A failed request aborts the transaction, so
 * `abort` is the one failure path to listen on.
 */
export function writeDocument(db: IDBDatabase, scene: Scene): Promise<void> {
  const record: StoredDocument = { version: FORMAT_VERSION, elements: scene };
  return inReadwrite(db, (documents) => documents.put(record, DOCUMENT_KEY));
}

/** Delete the document, so the next load starts empty. */
export function deleteDocument(db: IDBDatabase): Promise<void> {
  return inReadwrite(db, (documents) => documents.delete(DOCUMENT_KEY));
}

function inReadwrite(
  db: IDBDatabase,
  run: (documents: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENTS_OBJECT_STORE, "readwrite");
    run(transaction.objectStore(DOCUMENTS_OBJECT_STORE));

    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}
