/**
 * Draws each SceneElement for a given Viewport. Pure Canvas2D in CSS-pixel space
 * via `worldToScreen`; the caller sets the DPR transform and clears the canvas.
 * Geometry is in world units and `strokeWidth` in world-unit pixels, so sizes
 * and strokes are multiplied by `viewport.scale` — shapes zoom together.
 */

import type { Scene, SceneElement } from "@core/scene";
import { worldToScreen, type Viewport } from "./transform";

/**
 * Paint every element in `scene` onto `ctx` under the current `viewport`.
 * Array order is z-order: elements are drawn front-appending, so a later index
 * paints on top of earlier ones.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  viewport: Viewport,
): void {
  for (const el of scene) {
    drawElement(ctx, el, viewport);
  }
}

/** Paint a single element — used for the in-progress draft overlay. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: SceneElement,
  viewport: Viewport,
): void {
  ctx.save();
  switch (el.type) {
    case "rectangle": {
      const { x, y } = worldToScreen({ x: el.x, y: el.y }, viewport);
      const w = el.width * viewport.scale;
      const h = el.height * viewport.scale;
      if (el.style.fillColor !== "transparent") {
        ctx.fillStyle = el.style.fillColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = el.style.strokeColor;
      ctx.lineWidth = el.style.strokeWidth * viewport.scale;
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const center = worldToScreen(
        { x: el.x + el.width / 2, y: el.y + el.height / 2 },
        viewport,
      );
      const rx = Math.abs(el.width / 2) * viewport.scale;
      const ry = Math.abs(el.height / 2) * viewport.scale;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
      if (el.style.fillColor !== "transparent") {
        ctx.fillStyle = el.style.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.style.strokeColor;
      ctx.lineWidth = el.style.strokeWidth * viewport.scale;
      ctx.stroke();
      break;
    }
    case "freehand": {
      // Points are offsets from the element origin; fill is ignored for strokes.
      if (el.points.length >= 2) {
        ctx.beginPath();
        el.points.forEach((p, i) => {
          const { x, y } = worldToScreen(
            { x: el.x + p.x, y: el.y + p.y },
            viewport,
          );
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = el.style.strokeColor;
        ctx.lineWidth = el.style.strokeWidth * viewport.scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}
