import type { SceneElement } from "./types";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getBoundingBox(el: SceneElement): Bounds {
  switch (el.type) {
    case "rectangle":
    case "ellipse":
      return {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      };
    case "freehand": {
      const points = el.points;
      let minX = points[0].x;
      let minY = points[0].y;
      let maxX = points[0].x;
      let maxY = points[0].y;

      for (const p of points) {
        if (p.x < minX) minX = p.x;
        else if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        else if (p.y > maxY) maxY = p.y;
      }

      return {
        x: el.x + minX,
        y: el.y + minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    default: {
      const exhaustive: never = el;
      return exhaustive;
    }
  }
}
