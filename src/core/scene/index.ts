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
export { getBoundingBox, type Bounds } from './bounds'
