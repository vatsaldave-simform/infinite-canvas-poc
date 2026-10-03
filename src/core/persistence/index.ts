export { writeDocument, deleteDocument } from "./indexed-db";
export type { QuarantineReason, QuarantineRecord } from "./format";
export { loadDocument, type LoadedDocument } from "./load";
export { createPersister, type Persister, type PersistStatus } from "./persister";
export {
  makeStressScene,
  measureScene,
  fillStore,
  corruptDocument,
  createWriteFaults,
  DEFAULT_STROKE_POINTS,
  type StressSceneOptions,
  type SceneCost,
  type FillResult,
  type SceneCorruption,
  type WriteFaults,
} from "./diagnostics";
