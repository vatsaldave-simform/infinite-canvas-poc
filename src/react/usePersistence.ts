import { useEffect, useState } from "react";
import type { Scene, SceneStore } from "@core/scene";
import {
  createPersister,
  writeDocument,
  type PersistStatus,
  type WriteFaults,
} from "@core/persistence";

/** Quiet time after the last scene change before it is persisted. */
const PERSIST_DELAY_MS = 300;

/**
 * Persist the scene, coalesced: a drag notifies on every pointermove. Flushes
 * on hide/unload so a change inside the debounce window is not dropped.
 * Returns whether writes are reaching storage. With no database, persisting is
 * off for the session and nothing is written.
 */
export function usePersistence(
  store: SceneStore,
  db: IDBDatabase | null,
  writeFaults: WriteFaults | null,
): PersistStatus {
  const [status, setStatus] = useState<PersistStatus>("ok");

  useEffect(() => {
    if (!db) return;

    const write = (scene: Scene) => writeDocument(db, scene);
    const persister = createPersister(
      store,
      writeFaults ? writeFaults.wrap(write) : write,
      { delay: PERSIST_DELAY_MS, onStatusChange: setStatus },
    );
    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") persister.flush();
    };
    document.addEventListener("visibilitychange", flushIfHidden);
    window.addEventListener("pagehide", persister.flush);

    return () => {
      document.removeEventListener("visibilitychange", flushIfHidden);
      window.removeEventListener("pagehide", persister.flush);
      // Write any pending change rather than drop it with the subscription.
      persister.flush();
      persister.dispose();
      // The next persister starts out ok and reports only changes from there.
      setStatus("ok");
    };
  }, [store, db, writeFaults]);

  return status;
}
