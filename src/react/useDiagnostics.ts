import { useEffect } from "react";
import type { SceneStore } from "@core/scene";
import {
  corruptDocument,
  deleteDocument,
  DEFAULT_STROKE_POINTS,
  fillStore,
  measureScene,
  type FillResult,
  type SceneCorruption,
  type SceneCost,
  type WriteFaults,
} from "@core/persistence";

/**
 * Dev-only console handle for the persistence diagnostics. React owns the
 * *when* here as it does everywhere else: core exposes the instruments, this
 * decides that they exist only in a dev build and only on `window`. Not a
 * product affordance — devtools only, so it never has to be removed.
 */
export interface CanvasDiagnostics {
  /** What the current scene costs to store. */
  measure(): SceneCost;
  /** Append n synthetic strokes to the live scene, one notification each. */
  fill(elements?: number, pointsPerElement?: number, precision?: number): FillResult;
  /** Overwrite the stored document with a broken value. Reload to see it quarantined. */
  corrupt(kind: SceneCorruption): Promise<void>;
  /** Delete the persisted document. Reload to start empty. */
  clear(): Promise<void>;
  /** Make every write fail (or, given `false`, succeed again) until reload. */
  failWrites(failing?: boolean): void;
}

declare global {
  interface Window {
    canvasDiagnostics?: CanvasDiagnostics;
  }
}

export function useDiagnostics(
  store: SceneStore,
  db: IDBDatabase | null,
  writeFaults: WriteFaults | null,
): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.canvasDiagnostics = {
      measure: () => measureScene(store.getScene()),
      // Positional rather than an options object: this is typed by hand into a
      // devtools console, where `fill(30, 250)` beats naming three fields.
      fill: (elements = 50, pointsPerElement = DEFAULT_STROKE_POINTS, precision) =>
        fillStore(store, { elements, pointsPerElement, precision }),
      corrupt: (kind) => (db ? corruptDocument(db, kind) : persistingOff()),
      clear: () => (db ? deleteDocument(db) : persistingOff()),
      failWrites: (failing = true) => writeFaults?.setFailing(failing),
    };

    return () => {
      delete window.canvasDiagnostics;
    };
  }, [store, db, writeFaults]);
}

const persistingOff = () =>
  Promise.reject(new Error("IndexedDB is unavailable; persisting is off for this session."));
