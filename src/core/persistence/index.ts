export { writeDocument, deleteDocument } from "./indexed-db";
export { loadDocument, type LoadedDocument } from "./load";
export {
  makeStressScene,
  measureScene,
  fillStore,
  DEFAULT_STROKE_POINTS,
  type StressSceneOptions,
  type SceneCost,
  type FillResult,
} from "./diagnostics";
