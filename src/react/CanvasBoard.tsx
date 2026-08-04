import { useEffect, useRef, useState } from "react";
import { createSceneStore, type SceneElement } from "@core/scene";
import { usePanZoom } from "./usePanZoom";
import { useSceneStore } from "./useSceneStore";
import { useDrawTool, type Tool } from "./useDrawTool";
import { Toolbar } from "./Toolbar";

/**
 * CanvasBoard — owns the <canvas> DOM node and its HiDPI sizing, and wires the
 * pan/zoom, draw tool, and toolbar together. Scene state lives in the core
 * SceneStore; this component only subscribes and wires DOM/pointer events.
 */
export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The scene store lives in core/; created once and subscribed to via React.
  const [store] = useState(() => createSceneStore());
  const scene = useSceneStore(store);

  const [tool, setTool] = useState<Tool>("rectangle");
  // In-progress shape, shared with the render loop so it paints on top.
  const draftRef = useRef<SceneElement | null>(null);

  const { viewportRef, scheduleRender } = usePanZoom(canvasRef, scene, draftRef);
  useDrawTool({ canvasRef, viewportRef, scheduleRender, store, tool, draftRef });

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
