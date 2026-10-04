import { useEffect, useRef, type RefObject } from "react";

/**
 * Whether a pointer is pressed on the canvas right now, as a ref. Anything
 * that changes the document from outside the tools (the editor keys, the
 * timeline) checks it, so none can cut into a move, a resize, or a shape being
 * drawn. Tracked here rather than asked of the tools.
 */
export function useCanvasPress(
  canvasRef: RefObject<HTMLCanvasElement | null>,
): RefObject<boolean> {
  const pressingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      // Only the left button starts a gesture in any tool.
      if (e.button === 0) pressingRef.current = true;
    };

    const onPointerEnd = () => {
      pressingRef.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    // Listen on window so a release anywhere ends the press, even one the
    // canvas didn't capture.
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [canvasRef]);

  return pressingRef;
}
