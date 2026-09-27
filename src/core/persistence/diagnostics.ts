/**
 * Instruments for breaking the localStorage persistence path on purpose. They
 * provoke failures rather than preventing them; the reasoning and the numbers
 * they produced are in ARCHITECTURE.md ("Persistence") and ADR-0003.
 */

import type { Scene, SceneElement, SceneStore } from "@core/scene";
import { SCENE_STORAGE_KEY } from "./local-storage";

/** Scratch key for the ceiling probe. Always removed again. */
export const STORAGE_PROBE_KEY = "infinite-canvas:storage-probe";

/** Points in an unhurried real stroke — the default size for generated ones. */
export const DEFAULT_STROKE_POINTS = 250;

const PROBE_STYLE = {
  strokeColor: "#1e1e1e",
  fillColor: "transparent",
  strokeWidth: 2,
};

export interface StressSceneOptions {
  /** How many elements to generate. */
  elements: number;
  /** Points per element. A real stroke captures a few hundred. */
  pointsPerElement: number;
  /**
   * Decimal places to round coordinates to. Omit for the long, unrounded
   * floats that pointer events actually produce after a zoom.
   */
  precision?: number;
  /** Seed for the generator, so a measurement can be reproduced exactly. */
  seed?: number;
}

export interface SceneCost {
  elements: number;
  /** Total freehand points across the scene. */
  points: number;
  /**
   * Length of the stored JSON in UTF-16 code units. This is the unit the
   * quota is charged in — Chrome bills `key.length + value.length`, not bytes.
   */
  chars: number;
  /** The same content as UTF-16 bytes: the footprint, not the charge. */
  utf16Bytes: number;
}

export interface PersistProbe extends SceneCost {
  /** Wall-clock milliseconds for stringify + setItem. */
  ms: number;
  /** What the write threw, or null if it succeeded. */
  error: Error | null;
}

/**
 * Seeded LCG. Deterministic on purpose: two runs of the same options must
 * produce byte-identical JSON, or the measurements are not comparable.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function round(value: number, precision: number | undefined): number {
  if (precision === undefined) return value;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * One synthetic freehand element. Freehand only: a rectangle or ellipse is a
 * fixed handful of numbers, so strokes are the entire storage budget.
 */
function makeStressElement(
  index: number,
  { pointsPerElement, precision }: Pick<
    StressSceneOptions,
    "pointsPerElement" | "precision"
  >,
  random: () => number,
): SceneElement {
  const points = Array.from({ length: pointsPerElement }, () => ({
    x: round(random() * 800 - 400, precision),
    y: round(random() * 800 - 400, precision),
  }));

  return {
    id: `stress-${index}`,
    type: "freehand",
    x: round(random() * 2000, precision),
    y: round(random() * 2000, precision),
    points,
    style: PROBE_STYLE,
  };
}

/** Generate a scene of a given size. Deterministic for a given seed. */
export function makeStressScene(options: StressSceneOptions): Scene {
  const random = createRandom(options.seed ?? 1);
  return Array.from({ length: options.elements }, (_, index) =>
    makeStressElement(index, options, random),
  );
}

/** What a scene costs to store, in the units the quota is charged in. */
export function measureScene(scene: Scene): SceneCost {
  const chars = JSON.stringify(scene).length;
  const points = scene.reduce(
    (total, element) =>
      element.type === "freehand" ? total + element.points.length : total,
    0,
  );

  return { elements: scene.length, points, chars, utf16Bytes: chars * 2 };
}

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Time one whole-scene write — what a single `pointermove` costs — and report
 * what it threw instead of dying of it. The catch lives here, in the
 * instrument; the production write path still lets the error escape.
 *
 * The scene key is borrowed and put back, so measuring never turns a synthetic
 * scene into the real document.
 */
export function probePersist(scene: Scene): PersistProbe {
  const cost = measureScene(scene);
  const restore = localStorage.getItem(SCENE_STORAGE_KEY);
  let error: Error | null = null;

  const started = performance.now();
  try {
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
  } catch (thrown) {
    error = toError(thrown);
  }
  const ms = performance.now() - started;

  if (restore === null) localStorage.removeItem(SCENE_STORAGE_KEY);
  else localStorage.setItem(SCENE_STORAGE_KEY, restore);

  return { ...cost, ms, error };
}

export interface StorageCeiling {
  /** Characters accepted under a single key — the unit the quota charges. */
  chars: number;
  /** The same figure as UTF-16 bytes. */
  utf16Bytes: number;
}

/**
 * Binary-search the largest value this origin will accept right now. What comes
 * back is the room that is *left* — the quota is per origin, so an occupied
 * scene key shrinks it. The scratch key is always removed again.
 */
export function findStorageCeiling(maxChars = 16_000_000): StorageCeiling {
  let low = 0;
  let high = maxChars + 1;

  try {
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      try {
        localStorage.setItem(STORAGE_PROBE_KEY, "x".repeat(middle));
        low = middle;
      } catch {
        high = middle;
      }
    }
  } finally {
    localStorage.removeItem(STORAGE_PROBE_KEY);
  }

  return { chars: low, utf16Bytes: low * 2 };
}

export interface FloodOptions
  extends Partial<Omit<StressSceneOptions, "elements">> {
  /** Elements added per round. */
  step?: number;
  /** Give up after this many, so a generous quota cannot hang the tab. */
  maxElements?: number;
}

export interface FloodResult {
  /** The largest scene that persisted; null if even the first round failed. */
  lastOk: PersistProbe | null;
  /** The first round whose write threw; null if the loop ran out first. */
  failed: PersistProbe | null;
}

/**
 * Persist ever-larger scenes through the real write path until it throws.
 * Each round goes through `probePersist`, so the stored document is left as it
 * was found.
 */
export function floodPersist(options: FloodOptions = {}): FloodResult {
  const { step = 25, maxElements = 2000, ...sceneOptions } = options;
  const pointsPerElement = sceneOptions.pointsPerElement ?? DEFAULT_STROKE_POINTS;
  const random = createRandom(sceneOptions.seed ?? 1);

  const scene: Scene = [];
  let lastOk: PersistProbe | null = null;
  let failed: PersistProbe | null = null;

  while (scene.length < maxElements) {
    for (let i = 0; i < step && scene.length < maxElements; i += 1) {
      scene.push(
        makeStressElement(
          scene.length,
          { ...sceneOptions, pointsPerElement },
          random,
        ),
      );
    }

    const probe = probePersist(scene);
    if (probe.error) {
      failed = probe;
      break;
    }
    lastOk = probe;
  }

  return { lastOk, failed };
}

export interface FillResult extends SceneCost {
  /** Wall-clock milliseconds for the append loop, subscribers included. */
  ms: number;
  /**
   * What a persist-on-every-notification subscriber writes across the loop —
   * quadratic, since each append re-serialises everything before it. Derived
   * after timing, so measuring it does not inflate `ms`.
   */
  charsWritten: number;
}

/**
 * Append a synthetic scene to a live store, one `addElement` at a time.
 * Appending rather than seeding is the point: every append notifies, and it is
 * the notifications that make the write path expensive.
 */
export function fillStore(
  store: SceneStore,
  options: StressSceneOptions,
): FillResult {
  const added = makeStressScene(options);

  const started = performance.now();
  for (const element of added) store.addElement(element);
  const ms = performance.now() - started;

  const scene = store.getScene();
  const cost = measureScene(scene);

  // Closed-form prefix sum: JSON of the first n elements is two brackets, the
  // elements, and n-1 commas.
  const lengths = scene.map((element) => JSON.stringify(element).length);
  const startAt = scene.length - added.length;
  let running = lengths.slice(0, startAt).reduce((a, b) => a + b, 0);
  let charsWritten = 0;

  for (let n = startAt; n < scene.length; n += 1) {
    running += lengths[n];
    charsWritten += 2 + running + n;
  }

  return { ...cost, ms, charsWritten };
}

export type SceneCorruption = "malformed" | "unknown-type" | "wrong-shape";

/**
 * Load-bearing literals. `wrong-shape` in particular must stay *plausible*: it
 * is what a later version of this app would legitimately write.
 */
export const CORRUPTIONS: Record<SceneCorruption, string> = {
  malformed: "}{",
  "unknown-type":
    '[{"id":"corrupt-1","type":"triangle","x":0,"y":0,' +
    '"style":{"strokeColor":"#1e1e1e","fillColor":"transparent","strokeWidth":2}}]',
  "wrong-shape":
    '{"elements":[{"id":"corrupt-1","type":"rectangle","x":0,"y":0,' +
    '"width":120,"height":80,' +
    '"style":{"strokeColor":"#1e1e1e","fillColor":"transparent","strokeWidth":2}}]}',
};

/** Overwrite the stored scene with a value that breaks one assumption. */
export function corruptStoredScene(kind: SceneCorruption): void {
  localStorage.setItem(SCENE_STORAGE_KEY, CORRUPTIONS[kind]);
}

/** Remove the stored scene, so the next load starts empty. */
export function clearStoredScene(): void {
  localStorage.removeItem(SCENE_STORAGE_KEY);
}
