import { useEffect, useRef, useState } from "react";
import { createSceneStore, type SceneElement } from "@core/scene";
import { createEditorStore } from "@core/editor";
import { loadScene, persistScene } from "@core/persistence";
import { usePanZoom } from "./usePanZoom";
import { useDrawTool, type Tool } from "./useDrawTool";
import { useSelectTool } from "./useSelectTool";
import { useDiagnostics } from "./useDiagnostics";
import { Toolbar } from "./Toolbar";

/**
 * CanvasBoard — owns the <canvas> DOM node and its HiDPI sizing, and wires the
 * pan/zoom, draw and select tools, and toolbar together. Scene state lives in the core
 * SceneStore; this component only subscribes and wires DOM/pointer events.
 */
export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The scene store lives in core/; created once, seeded with the persisted
  // scene so it is born holding the document — no empty-then-populate flash
  // and no "is it loaded yet" state. usePanZoom subscribes to it outside React
  // render, so committing a shape repaints the canvas without re-rendering
  // this component or the toolbar.
  const [store] = useState(() => createSceneStore(loadScene()));
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
  useSelectTool({
    canvasRef,
    viewportRef,
    store,
    editorStore,
    active: tool === "select",
  });
  // Dev-only: exposes the persistence diagnostics on window.canvasDiagnostics.
  useDiagnostics(store);

  // The scene is the document, so persist it on every mutation. Deliberately
  // uncoalesced: a drag commits live to the store, so this stringifies and
  // writes on every pointermove. The naive cost is meant to be visible.
  useEffect(() => {
    return store.subscribe(() => {
      persistScene(store.getScene());
    });
  }, [store]);

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
