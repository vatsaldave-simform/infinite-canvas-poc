import { useEffect, useState, type RefObject } from "react";
import type { SceneStore } from "@core/scene";
import type { EditorStore } from "@core/editor";
import { createReplay, type History, type Replay } from "@core/history";
import { selectEntryElement } from "./historySelection";

interface ReplayParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  store: SceneStore;
  editorStore: EditorStore;
  history: History;
  timelineOpen: boolean;
}

/**
 * The replay for this page's history. Each step selects the element it
 * changed, so the selection box shows what just happened.
 *
 * Pressing on the canvas with a tool pauses it, since a draw mid-replay would
 * throw away the rest of the future. The wheel is left alone, so pan and zoom
 * keep working. Closing the timeline pauses it too.
 */
export function useReplay({
  canvasRef,
  store,
  editorStore,
  history,
  timelineOpen,
}: ReplayParams): Replay {
  const [replay] = useState(() =>
    createReplay(history, (entry) =>
      selectEntryElement(entry, store, editorStore),
    ),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      // Only the left button starts a gesture in any tool.
      if (e.button === 0) replay.pause();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    return () => canvas.removeEventListener("pointerdown", onPointerDown);
  }, [canvasRef, replay]);

  useEffect(() => {
    if (!timelineOpen) return;

    // Runs when the timeline closes, and when the board goes away, so a
    // replay never keeps stepping with no bar to show it.
    return () => replay.pause();
  }, [timelineOpen, replay]);

  return replay;
}
