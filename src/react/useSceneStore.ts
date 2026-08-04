import { useSyncExternalStore } from 'react'
import type { Scene, SceneStore } from '@core/scene'

/**
 * Subscribe React to the core SceneStore — the only bridge between the two.
 * getScene's stable snapshot means React re-renders exactly when the scene
 * actually changes.
 */
export function useSceneStore(store: SceneStore): Scene {
  return useSyncExternalStore(store.subscribe, store.getScene)
}
