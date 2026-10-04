/**
 * Replay: stepping forward through history on its own, one entry at a time at
 * a steady rate, so the document rebuilds itself. A replay is redo on a timer:
 * each step is a real redo through history, so the store hears every one.
 */

import type { History, HistoryEntry } from "./history";

/** Time between two steps of a replay: about 4 entries per second. */
export const REPLAY_STEP_MS = 250;

export interface Replay {
  /** Start stepping forward. Does nothing when there is no future. */
  play(): void;

  /** Stop stepping, leaving the present where it is. */
  pause(): void;

  /** Whether a replay is running right now. */
  isPlaying(): boolean;

  /**
   * Register a listener called whenever the replay starts or stops, including
   * when it stops on its own at the end of history. Returns an unsubscribe
   * function that removes this listener.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Create a replay for one history. `onStep` hears every entry a step applies,
 * so the caller can select what just changed.
 */
export function createReplay(
  history: History,
  onStep: (entry: HistoryEntry) => void,
): Replay {
  // The running timer, or null while paused.
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const hasFuture = () => history.getPresent() < history.getCount();

  const pause = () => {
    // Already paused: nothing changes, so nobody hears about it.
    if (timer === null) return;

    clearInterval(timer);
    timer = null;
    notify();
  };

  const step = () => {
    const entry = history.redo();
    if (entry) onStep(entry);
    // Stop right after the last entry, not one step later.
    if (!hasFuture()) pause();
  };

  const play = () => {
    // Already playing: a second timer would step twice as fast.
    if (timer !== null) return;
    // Nothing to redo, so nothing to replay.
    if (!hasFuture()) return;

    timer = setInterval(step, REPLAY_STEP_MS);
    notify();
  };

  return {
    play,
    pause,
    isPlaying() {
      return timer !== null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
