export { writeDocument, deleteDocument } from "./indexed-db";
export type { QuarantineReason, QuarantineRecord } from "./format";
export { loadDocument, type LoadedDocument } from "./load";
export {
  makeStressScene,
  measureScene,
  fillStore,
  corruptDocument,
  DEFAULT_STROKE_POINTS,
  type StressSceneOptions,
  type SceneCost,
  type FillResult,
  type SceneCorruption,
} from "./diagnostics";
