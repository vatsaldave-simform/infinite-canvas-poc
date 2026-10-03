/**
 * Instruments for stressing the persistence path on purpose: deterministic
 * synthetic scenes, what a scene costs to persist, a live-store fill,
 * deliberate corruptions of the stored document, and writes that fail on
 * demand. See ARCHITECTURE.md ("Persistence").
 */

import type { Scene, SceneElement, SceneStore } from "@core/scene";
import { writeRawDocument } from "./indexed-db";

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
   * Length of the scene as JSON, in UTF-16 code units. The unit localStorage
   * charged its quota in, kept so sizes stay comparable with those measurements.
   */
  chars: number;
  /** The same content as UTF-16 bytes: the footprint, not the charge. */
  utf16Bytes: number;
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

/** What a scene costs to persist, measured as JSON. */
export function measureScene(scene: Scene): SceneCost {
  const chars = JSON.stringify(scene).length;
  const points = scene.reduce(
    (total, element) =>
      element.type === "freehand" ? total + element.points.length : total,
    0,
  );

  return { elements: scene.length, points, chars, utf16Bytes: chars * 2 };
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

export type SceneCorruption =
  | "unknown-type"
  | "wrong-shape"
  | "future-version"
  | "duplicate-id";

const corruptRectangle = {
  id: "corrupt-1",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  style: PROBE_STYLE,
};

/**
 * One stored value per thing the validator must catch. Each is plausible
 * apart from its one defect, so it tests exactly that check.
 */
export const CORRUPTIONS: Record<SceneCorruption, unknown> = {
  "unknown-type": { version: 1, elements: [{ ...corruptRectangle, type: "triangle" }] },
  // The old bare-array format, where the envelope belongs.
  "wrong-shape": [corruptRectangle],
  // A valid document from a newer build: not understood, rather than corrupt.
  "future-version": { version: 2, elements: [corruptRectangle] },
  "duplicate-id": {
    version: 1,
    elements: [corruptRectangle, { ...corruptRectangle, type: "ellipse" }],
  },
};

/** Overwrite the stored document with a value that breaks one assumption. */
export function corruptDocument(
  db: IDBDatabase,
  kind: SceneCorruption,
): Promise<void> {
  return writeRawDocument(db, CORRUPTIONS[kind]);
}

/** A switch that makes the scene's writes fail, for exercising the failure path. */
export interface WriteFaults {
  /** Fail every write from now on (`true`), or let them through again. */
  setFailing(failing: boolean): void;
  /** Wrap a write so that, while failing is set, it rejects without running. */
  wrap(write: (scene: Scene) => Promise<void>): (scene: Scene) => Promise<void>;
}

/**
 * Off until switched on. The injected failure is the one a full disk raises,
 * so it travels the same path a real quota error would.
 */
export function createWriteFaults(): WriteFaults {
  let failing = false;

  return {
    setFailing: (next) => {
      failing = next;
    },
    wrap: (write) => (scene) =>
      failing
        ? Promise.reject(
            new DOMException("Write failed on purpose (diagnostics).", "QuotaExceededError"),
          )
        : write(scene),
  };
}
