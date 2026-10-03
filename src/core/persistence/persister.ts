/**
 * Coalesces scene-store notifications into debounced writes. See
 * ARCHITECTURE.md ("Persistence").
 */

import type { Scene, SceneStore } from "@core/scene";

export interface PersisterOptions {
  /** Quiet time, in ms, after the last notification before writing. */
  delay: number;
}

export interface Persister {
  /** Write the pending scene now instead of waiting out the delay. */
  flush(): void;
  /** Unsubscribe and drop any pending write, without writing it. */
  dispose(): void;
}

/**
 * Subscribe to the store and write its latest scene `delay` ms after the last
 * notification, so a burst (a move-drag notifies per pointermove) costs one
 * write. Flushing on page hide is the caller's job: this module has no DOM.
 */
export function createPersister(
  store: Pick<SceneStore, "getScene" | "subscribe">,
  write: (scene: Scene) => void,
  { delay }: PersisterOptions,
): Persister {
  // Set exactly while a change is waiting to be written.
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    write(store.getScene());
  };

  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  const dispose = () => {
    unsubscribe();
    clearTimeout(timer);
    timer = undefined;
  };

  return { flush, dispose };
}
