/**
 * Coalesces scene-store notifications into debounced writes. See
 * ARCHITECTURE.md ("Persistence").
 */

import type { Scene, SceneStore } from "@core/scene";

/** Whether the scene is reaching storage. Starts `ok`: it was just loaded from there. */
export type PersistStatus = "ok" | "failing";

export interface PersisterOptions {
  /** Quiet time, in ms, after the last notification before writing. */
  delay: number;
  /** Called when the status changes, decided by the outcome of each write. */
  onStatusChange?: (status: PersistStatus) => void;
}

export interface Persister {
  /** Write the pending scene now instead of waiting out the delay. */
  flush(): void;
  /**
   * Unsubscribe and drop any pending write, without writing it. A write
   * already in flight still lands, but its outcome is no longer reported.
   */
  dispose(): void;
}

/**
 * Subscribe to the store and write its latest scene `delay` ms after the last
 * notification, so a burst (a move-drag notifies per pointermove) costs one
 * write. Flushing on page hide is the caller's job: this module has no DOM.
 */
export function createPersister(
  store: Pick<SceneStore, "getScene" | "subscribe">,
  write: (scene: Scene) => Promise<void>,
  { delay, onStatusChange }: PersisterOptions,
): Persister {
  // Set exactly while a change is waiting to be written.
  let timer: ReturnType<typeof setTimeout> | undefined;

  let status: PersistStatus = "ok";
  let disposed = false;

  const setStatus = (next: PersistStatus) => {
    if (disposed || next === status) return;
    status = next;
    onStatusChange?.(next);
  };

  // Counts writes started, so only the newest write's outcome sets the status.
  let latestWrite = 0;

  // No retry: every write is a whole scene, so the next write is the retry.
  const persist = (scene: Scene) => {
    const thisWrite = ++latestWrite;
    // The executor runs synchronously, so the write still starts now, and a
    // write that throws (a closed connection does) rejects instead.
    new Promise<void>((resolve) => resolve(write(scene))).then(
      () => {
        if (thisWrite === latestWrite) setStatus("ok");
      },
      (error: unknown) => {
        console.error("Persisting the scene failed.", error);
        if (thisWrite === latestWrite) setStatus("failing");
      },
    );
  };

  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    persist(store.getScene());
  };

  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  const dispose = () => {
    disposed = true;
    unsubscribe();
    clearTimeout(timer);
    timer = undefined;
  };

  return { flush, dispose };
}
