/**
 * Validation of a persisted document, all-or-nothing: one bad element rejects
 * the whole document. Pure, so it never throws, whatever it is given. See
 * ADR-0004 for why a failure is quarantined rather than salvaged.
 */

import type { Scene, SceneElement } from "@core/scene";
import { FORMAT_VERSION, type ValidationFailure } from "./format";

/** The scene, or why and where the first error is. */
export type ValidationResult =
  | { ok: true; scene: Scene }
  | ({ ok: false } & ValidationFailure);

type UnknownRecord = Record<string, unknown>;

/** Each element type's own checks, returning a path relative to the element. */
const GEOMETRY: Record<SceneElement["type"], (element: UnknownRecord) => string | null> = {
  rectangle: sizeError,
  ellipse: sizeError,
  freehand: (element) => pointsError(element.points),
};

export function validateDocument(value: unknown): ValidationResult {
  if (!isPlainObject(value)) return invalid("");

  const { version, elements } = value;
  if (Number.isInteger(version) && (version as number) > FORMAT_VERSION) {
    return { ok: false, reason: "unknown-format-version", path: "version" };
  }
  if (version !== FORMAT_VERSION) return invalid("version");
  if (!Array.isArray(elements)) return invalid("elements");

  // Selection and replaceElement both find elements by id, so a repeat would
  // make both copies wrong.
  const ids = new Set<string>();
  for (const [index, element] of elements.entries()) {
    const error = elementError(element, ids);
    if (error !== null) return invalid(`elements[${index}]${error}`);
  }

  return { ok: true, scene: elements as Scene };
}

function invalid(path: string): ValidationResult {
  return { ok: false, reason: "invalid", path };
}

/** A plain object: not null, and not an array. */
function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSize(value: unknown): boolean {
  return Number.isFinite(value) && (value as number) >= 0;
}

/** The first error's path relative to the element, or null if it is valid. */
function elementError(element: unknown, ids: Set<string>): string | null {
  if (!isPlainObject(element)) return "";

  const { id, type, x, y } = element;
  if (typeof id !== "string" || id === "" || ids.has(id)) return ".id";
  ids.add(id);
  if (typeof type !== "string" || !Object.hasOwn(GEOMETRY, type)) return ".type";
  if (!Number.isFinite(x)) return ".x";
  if (!Number.isFinite(y)) return ".y";

  return GEOMETRY[type as SceneElement["type"]](element) ?? styleError(element.style);
}

function sizeError(element: UnknownRecord): string | null {
  if (!isSize(element.width)) return ".width";
  if (!isSize(element.height)) return ".height";
  return null;
}

function pointsError(points: unknown): string | null {
  if (!Array.isArray(points) || points.length === 0) return ".points";

  for (const [index, point] of points.entries()) {
    if (!isPlainObject(point)) return `.points[${index}]`;
    if (!Number.isFinite(point.x)) return `.points[${index}].x`;
    if (!Number.isFinite(point.y)) return `.points[${index}].y`;
  }
  return null;
}

/** Colours only have to be strings: an invalid CSS colour is ignored by the canvas. */
function styleError(style: unknown): string | null {
  if (!isPlainObject(style)) return ".style";
  if (typeof style.strokeColor !== "string") return ".style.strokeColor";
  if (typeof style.fillColor !== "string") return ".style.fillColor";
  if (!isSize(style.strokeWidth)) return ".style.strokeWidth";
  return null;
}
