import type { Point, SceneElement } from "./types";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest box holding every point. `points` must not be empty. */
export function getPointsBounds(points: Point[]): Bounds {
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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
      const box = getPointsBounds(el.points);
      return { ...box, x: el.x + box.x, y: el.y + box.y };
    }
    default: {
      const exhaustive: never = el;
      return exhaustive;
    }
  }
}
