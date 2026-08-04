/**
 * Scene element data model — the shared vocabulary the whole engine speaks.
 * Pure types only (no factories/store logic). Framework-agnostic: no React, no
 * DOM assumptions beyond plain data.
 */

/** A 2D point. In freehand elements, stored as an offset from the element's (x, y). */
export interface Point {
  x: number
  y: number
}

/** Shared visual style across all element types. */
export interface ElementStyle {
  /** CSS color for the outline / path. */
  strokeColor: string
  /** CSS color for the interior ('transparent' allowed); ignored by freehand. */
  fillColor: string
  /** Stroke width in world-unit pixels. */
  strokeWidth: number
}

/** Fields common to every scene element. */
export interface BaseElement {
  id: string
  /** World-space origin of the element. */
  x: number
  y: number
  style: ElementStyle
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle'
  width: number
  height: number
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  /** Bounding-box width; the ellipse is inscribed within it. */
  width: number
  /** Bounding-box height; the ellipse is inscribed within it. */
  height: number
}

export interface FreehandElement extends BaseElement {
  type: 'freehand'
  /** Offsets from (x, y). The first point is typically { x: 0, y: 0 }. */
  points: Point[]
}

/**
 * Discriminated union of all element types. `type` is the discriminant, so
 * `switch (el.type)` narrows to the exact shape (with exhaustiveness checking).
 */
export type SceneElement = RectangleElement | EllipseElement | FreehandElement

/**
 * The in-memory scene: an ordered array of elements.
 * Array order is z-order — a later index draws on top, so hit-testing walks
 * back-to-front to find the topmost element under a point.
 */
export type Scene = SceneElement[]
