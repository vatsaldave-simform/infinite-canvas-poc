import { useEffect, useRef, useState } from "react";
import { createSceneStore, type SceneElement } from "@core/scene";
import { createEditorStore } from "@core/editor";
import { usePanZoom } from "./usePanZoom";
import { useDrawTool, type Tool } from "./useDrawTool";
import { Toolbar } from "./Toolbar";

/**
 * CanvasBoard — owns the <canvas> DOM node and its HiDPI sizing, and wires the
 * pan/zoom, draw tool, and toolbar together. Scene state lives in the core
 * SceneStore; this component only subscribes and wires DOM/pointer events.
 */
export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The scene store lives in core/; created once. usePanZoom subscribes to it
  // outside React render, so committing a shape repaints the canvas without
  // re-rendering this component or the toolbar.
  const [store] = useState(() => createSceneStore());
  // Editor state (current selection) — kept separate from the scene document,
  // so it is never persisted and survives immutable element replacement.
  const [editorStore] = useState(() => createEditorStore());

  const [tool, setTool] = useState<Tool>("rectangle");
  // In-progress shape, shared with the render loop so it paints on top.
  const draftRef = useRef<SceneElement | null>(null);

  const { viewportRef, scheduleRender } = usePanZoom(
    canvasRef,
    store,
    draftRef,
    editorStore,
  );
  useDrawTool({
    canvasRef,
    viewportRef,
    scheduleRender,
    store,
    tool,
    draftRef,
    editorStore,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the backing store to physical pixels (DPR) while keeping the CSS
    // size at viewport dimensions, so the canvas is crisp on HiDPI displays.
    // Resizing clears the canvas, so repaint afterwards.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scheduleRender();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [scheduleRender]);

  return (
    <>
      <Toolbar tool={tool} onToolChange={setTool} />
      <canvas ref={canvasRef} />
    </>
  );
}
