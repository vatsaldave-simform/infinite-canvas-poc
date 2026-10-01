/**
 * The persisted shapes: the document and its quarantine record. Shared by the
 * validator and the IndexedDB layer. See CONTEXT.md ("Persistence").
 */

import type { Scene } from "@core/scene";

/** The shape of what is stored. Changes only when that shape changes. */
export const FORMAT_VERSION = 1;

/** The persisted document. Array order of `elements` is z-order, as in the scene. */
export interface StoredDocument {
  version: typeof FORMAT_VERSION;
  elements: Scene;
}

/**
 * Why a document was not loaded. A newer format version is "not understood"
 * rather than invalid: it may be a perfectly good document from a newer build.
 */
export type QuarantineReason = "invalid" | "unknown-format-version";

/** Why a document failed validation, and where. */
export interface ValidationFailure {
  reason: QuarantineReason;
  /**
   * Path of the first error, relative to the document (`elements[37].type`).
   * The empty path is the stored value itself.
   */
  path: string;
}

/** A document set aside, whole, because it could not be loaded. Kept forever. */
export interface QuarantineRecord extends ValidationFailure {
  /** The stored value exactly as it was read. */
  value: unknown;
  /** When it was quarantined, as an ISO 8601 string. */
  quarantinedAt: string;
}
