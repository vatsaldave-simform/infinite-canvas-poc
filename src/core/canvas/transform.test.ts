import { describe, expect, it } from "vitest";

import {
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type Viewport,
} from "./transform";

/**
 * Round-tripping through a division and a multiplication leaves IEEE noise, so
 * exact equality is the wrong assertion. Precision 10 tolerates that noise
 * while still catching any real algebraic error (a half-pixel drift at zoom
 * would fail here, but would sail through toBeCloseTo's default precision 2).
 */
const PRECISION = 10;

/** Deliberately awkward: power-of-two scales are the ones that hide bugs. */
const AWKWARD_SCALES = [1.5, 0.3, 2.75];

describe("screenToWorld / worldToScreen", () => {
  const viewport: Viewport = { offsetX: 100, offsetY: 50, scale: 2 };

  it("maps a screen point into world space under pan and zoom", () => {
    expect(screenToWorld({ x: 140, y: 90 }, viewport)).toEqual({ x: 20, y: 20 });
  });

  it("maps a world point onto the screen under pan and zoom", () => {
    expect(worldToScreen({ x: 20, y: 20 }, viewport)).toEqual({ x: 140, y: 90 });
  });

  it.each(AWKWARD_SCALES)(
    "round-trips a screen point back to itself at scale %f",
    (scale) => {
      const panned: Viewport = { offsetX: -37.5, offsetY: 12.25, scale };
      const screen = { x: 613, y: 227 };

      const back = worldToScreen(screenToWorld(screen, panned), panned);

      expect(back.x).toBeCloseTo(screen.x, PRECISION);
      expect(back.y).toBeCloseTo(screen.y, PRECISION);
    },
  );
});

describe("zoomAtPoint", () => {
  const viewport: Viewport = { offsetX: -37.5, offsetY: 12.25, scale: 1.5 };
  const cursor = { x: 420, y: 310 };

  it("keeps the world point under the cursor fixed", () => {
    const before = screenToWorld(cursor, viewport);

    const after = screenToWorld(cursor, zoomAtPoint(viewport, cursor, 2.75));

    expect(after.x).toBeCloseTo(before.x, PRECISION);
    expect(after.y).toBeCloseTo(before.y, PRECISION);
  });

  it("keeps the anchor fixed when zooming out too", () => {
    const before = screenToWorld(cursor, viewport);

    const after = screenToWorld(cursor, zoomAtPoint(viewport, cursor, 0.3));

    expect(after.x).toBeCloseTo(before.x, PRECISION);
    expect(after.y).toBeCloseTo(before.y, PRECISION);
  });

  it("applies the requested scale", () => {
    expect(zoomAtPoint(viewport, cursor, 2.75).scale).toBe(2.75);
  });

  it("moves points other than the cursor anchor", () => {
    // Guards the fixed-point assertions above from being vacuous: if
    // zoomAtPoint returned the viewport untouched, they would still pass.
    const zoomed = zoomAtPoint(viewport, cursor, 2.75);

    expect(worldToScreen({ x: 0, y: 0 }, zoomed)).not.toEqual(
      worldToScreen({ x: 0, y: 0 }, viewport),
    );
  });
});
