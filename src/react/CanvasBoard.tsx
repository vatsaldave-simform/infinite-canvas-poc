import { useEffect, useRef } from "react";
import type { Scene } from "@core/scene";
import { usePanZoom } from "./usePanZoom";

// Stable empty scene so the render effect isn't retriggered every render.
const EMPTY_SCENE: Scene = [];

/**
 * CanvasBoard — owns the <canvas> DOM node, keeps it sized to the viewport
 * (HiDPI-crisp, M0), wires pan/zoom (M3), and renders the scene (M4).
 *
 * Gesture handling, the reference grid, and scene rendering live in
 * usePanZoom / core; this component just owns the element and its sizing.
 */
export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Empty until M5's store supplies a real scene. (Swap for `sampleScene` from
  // '@core/scene' to visually verify the M4 renderer.)
  const { scheduleRender } = usePanZoom(canvasRef, EMPTY_SCENE);

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

  return <canvas ref={canvasRef} />;
}
