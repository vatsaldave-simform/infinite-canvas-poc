import type {
  Point,
  Scene,
  SceneElement,
  RectangleElement,
  EllipseElement,
  FreehandElement,
} from "./types";

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  // vector AB segment
  const abX = b.x - a.x;
  const abY = b.y - a.y;

  // vector AP (point to start)
  const apX = p.x - a.x;
  const apY = p.y - a.y;

  // squared length of AB segment
  const abLenSq = abX * abX + abY * abY;

  //if a and b are same pixel, return distance to that point
  if (abLenSq === 0) {
    return Math.sqrt(apX * apX + apY * apY);
  }

  // scalar product t (dot product / squared length)
  let t = (apX * abX + apY * abY) / abLenSq;

  // clamp t
  t = Math.max(0, Math.min(1, t));

  // closest point c cordinates
  const cX = a.x + t * abX;
  const cY = a.y + t * abY;

  // return final distance from p to c
  const distX = p.x - cX;
  const distY = p.y - cY;

  return Math.sqrt(distX * distX + distY * distY);
}

export function hitTestRectangle(el: RectangleElement, point: Point): boolean {
  const xMax = el.x + el.width;
  const yMax = el.y + el.height;
  return (
    el.x <= point.x && point.x <= xMax && el.y <= point.y && point.y <= yMax
  );
}

export function hitTestEllipse(el: EllipseElement, point: Point): boolean {
  const xRadii = el.width / 2;
  const yRadii = el.height / 2;
  const xCenter = el.x + xRadii;
  const yCenter = el.y + yRadii;

  if (xRadii / yRadii === 0 || xRadii / yRadii === Infinity) return false;

  return (
    Math.pow((point.x - xCenter) / xRadii, 2) +
      Math.pow((point.y - yCenter) / yRadii, 2) <=
    1
  );
}

export function hitTestFreehand(
  el: FreehandElement,
  point: Point,
  tolerance: number,
): boolean {
  const points = el.points;
  if (points.length === 0) return false;

  const localPoint: Point = { x: point.x - el.x, y: point.y - el.y };
  // for single point free hand
  if (points.length === 1) {
    const dx = localPoint.x - points[0].x;
    const dy = localPoint.y - points[0].y;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  }

  // scan across polyline elements
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (distanceToSegment(localPoint, a, b) <= tolerance) {
      return true;
    }
  }
  return false;
}

export function hitTestElement(
  el: SceneElement,
  point: Point,
  tolerance: number,
): boolean {
  switch (el.type) {
    case "rectangle":
      return hitTestRectangle(el, point);
    case "ellipse":
      return hitTestEllipse(el, point);
    case "freehand":
      return hitTestFreehand(el, point, tolerance);
    default: {
      const exhaustive: never = el;
      return exhaustive;
    }
  }
}

export function hitTest(
  scene: Scene,
  point: Point,
  tolerance: number,
): SceneElement | null {
  for (let i = scene.length - 1; i >= 0; i--) {
    const el = scene[i];
    if (hitTestElement(el, point, tolerance)) {
      return el;
    }
  }
  return null;
}
