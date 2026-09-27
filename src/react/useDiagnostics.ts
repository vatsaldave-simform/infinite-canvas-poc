import { useEffect } from "react";
import type { SceneStore } from "@core/scene";
import {
  clearStoredScene,
  corruptStoredScene,
  DEFAULT_STROKE_POINTS,
  fillStore,
  findStorageCeiling,
  floodPersist,
  makeStressScene,
  measureScene,
  probePersist,
  type FillResult,
  type FloodOptions,
  type FloodResult,
  type PersistProbe,
  type SceneCorruption,
  type SceneCost,
  type StorageCeiling,
} from "@core/persistence";

/**
 * Dev-only console handle for the persistence diagnostics. React owns the
 * *when* here as it does everywhere else: core exposes the instruments, this
 * decides that they exist only in a dev build and only on `window`. Not a
 * product affordance — devtools only, so it never has to be removed.
 */
export interface CanvasDiagnostics {
  /** How much room this origin has left, in characters and UTF-16 bytes. */
  ceiling(): StorageCeiling;
  /** What the current scene costs to store. */
  measure(): SceneCost;
  /** Persist ever-larger scenes until the write throws. Restores the scene. */
  flood(options?: FloodOptions): FloodResult;
  /** Cost of one whole-scene write at a given size — what a pointermove pays. */
  probe(elements: number, pointsPerElement?: number, precision?: number): PersistProbe;
  /** Append n synthetic strokes to the live scene, one notification each. */
  fill(elements?: number, pointsPerElement?: number, precision?: number): FillResult;
  /** Overwrite the stored scene with a broken value. Reload to see it fail. */
  corrupt(kind: SceneCorruption): void;
  /** Remove the stored scene. Reload to start empty. */
  clear(): void;
}

declare global {
  interface Window {
    canvasDiagnostics?: CanvasDiagnostics;
  }
}

export function useDiagnostics(store: SceneStore): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.canvasDiagnostics = {
      ceiling: findStorageCeiling,
      flood: floodPersist,
      corrupt: corruptStoredScene,
      clear: clearStoredScene,
      measure: () => measureScene(store.getScene()),
      // Positional rather than an options object: this is typed by hand into a
      // devtools console, where `fill(30, 250)` beats naming three fields.
      probe: (elements, pointsPerElement = DEFAULT_STROKE_POINTS, precision) =>
        probePersist(makeStressScene({ elements, pointsPerElement, precision })),
      fill: (elements = 50, pointsPerElement = DEFAULT_STROKE_POINTS, precision) =>
        fillStore(store, { elements, pointsPerElement, precision }),
    };

    return () => {
      delete window.canvasDiagnostics;
    };
  }, [store]);
}
