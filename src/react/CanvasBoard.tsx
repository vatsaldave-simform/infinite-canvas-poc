import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSceneStore, type Scene, type SceneElement } from "@core/scene";
import { createEditorStore } from "@core/editor";
import { createWriteFaults } from "@core/persistence";
import { usePanZoom } from "./usePanZoom";
import { useDrawTool, type Tool } from "./useDrawTool";
import { useSelectTool } from "./useSelectTool";
import { useDeleteKey } from "./useDeleteKey";
import { usePersistence } from "./usePersistence";
import { useDiagnostics } from "./useDiagnostics";
import { Toolbar } from "./Toolbar";
import { Notice, NoticeStack } from "./Notice";

export interface CanvasBoardProps {
  /**
   * Open database connection the scene is persisted through, or `null` when
   * IndexedDB is unavailable and persisting is off for the session.
   */
  db: IDBDatabase | null;
  /** The persisted scene, already loaded. */
  initialScene: Scene;
  /** The caller's own notices, stacked with the board's so none overlap. */
  notices?: ReactNode;
}

/**
 * CanvasBoard — owns the <canvas> DOM node and its HiDPI sizing, and wires the
 * pan/zoom, draw and select tools, delete key, and toolbar together. Scene
 * state lives in the core SceneStore; this component only subscribes and wires
 * DOM/pointer events.
 * Mounted by DocumentLoader only once the persisted document has arrived.
 */
export function CanvasBoard({ db, initialScene, notices }: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The scene store lives in core/; created once, seeded with the loaded
  // scene so it is born holding the document — no empty-then-populate flash
  // and no "is it loaded yet" state. usePanZoom subscribes to it outside React
  // render, so committing a shape repaints the canvas without re-rendering
  // this component or the toolbar.
  const [store] = useState(() => createSceneStore(initialScene));
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
  useDeleteKey({ canvasRef, store, editorStore });
  // Lets the diagnostics fail writes on purpose. Dev-only, so production writes
  // go straight to storage and the switch is tree-shaken out.
  const [writeFaults] = useState(() =>
    import.meta.env.DEV ? createWriteFaults() : null,
  );
  const persistStatus = usePersistence(store, db, writeFaults);
  // Dev-only: exposes the persistence diagnostics on window.canvasDiagnostics.
  useDiagnostics(store, db, writeFaults);

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
      <NoticeStack>
        {persistStatus === "failing" && (
          <Notice
            tone="error"
            message="Changes aren't being saved. Your next change will try again."
          />
        )}
        {notices}
      </NoticeStack>
    </>
  );
}
