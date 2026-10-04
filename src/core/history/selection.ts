import type { Scene } from "@core/scene";
import { getOperations, type HistoryEntry, type SceneOperation } from "./history";

/** The id of the element a scene operation touched. */
function getOperationElementId(operation: SceneOperation): string {
  switch (operation.kind) {
    case "add":
      return operation.element.id;
    case "replace":
      return operation.after.id;
    case "remove":
      return operation.element.id;
  }
}

/** The ids of every element an entry touched, each one once. */
function getTouchedIds(entry: HistoryEntry): Set<string> {
  const ids = new Set<string>();
  for (const operation of getOperations(entry)) {
    ids.add(getOperationElementId(operation));
  }
  return ids;
}

/**
 * What to select after an entry was undone or redone, given the scene it left
 * behind: the element the entry touched, if exactly one of the elements it
 * touched is in the scene, so you see what changed. Otherwise `null`, since
 * only one element can be selected and the selection must never point at a
 * missing element.
 */
export function getEntrySelection(
  entry: HistoryEntry,
  scene: Scene,
): string | null {
  const touchedIds = getTouchedIds(entry);

  const inScene: string[] = [];
  for (const element of scene) {
    if (touchedIds.has(element.id)) inScene.push(element.id);
  }

  if (inScene.length === 1) return inScene[0];
  return null;
}
