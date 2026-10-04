export type {
  Point,
  ElementStyle,
  BaseElement,
  RectangleElement,
  EllipseElement,
  FreehandElement,
  SceneElement,
  Scene,
} from './types'

export { createSceneStore, type SceneStore } from './store'
export {
  createRectangle,
  createEllipse,
  createFreehand,
  normalizeRect,
  freehandGeometry,
  isTooSmallStroke,
  DEFAULT_STYLE,
} from './factory'
export {
  hitTest,
  hitTestElement,
  hitTestRectangle,
  hitTestEllipse,
  hitTestFreehand,
  distanceToSegment,
} from './hit-test'
export { getBoundingBox, getPointsBounds, type Bounds } from './bounds'
export {
  splitStroke,
  createErasure,
  eraseAlong,
  getErasePreview,
  isErased,
  type Erasure,
  type ErasePreview,
} from './erase'
export { translateElement } from './translate'
export {
  MIN_ELEMENT_SIZE,
  fitElement,
} from './resize'
