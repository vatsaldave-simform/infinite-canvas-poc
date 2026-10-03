import { describe, expect, it } from "vitest";

import type { Bounds } from "@core/scene";
import { getHandleAt, getHandles } from "./selection";
import type { Viewport } from "./transform";

// World box from (10, 20) to (40, 60).
const box: Bounds = { x: 10, y: 20, width: 30, height: 40 };

const identity: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
const zoomedAndPanned: Viewport = { offsetX: 100, offsetY: -50, scale: 2 };

describe("getHandles", () => {
  it("puts the four corners on the selection box at 1x", () => {
    // The selection box sits 4 screen px outside the shape.
    expect(getHandles(box, identity)).toEqual([
      { name: "nw", x: 6, y: 16 },
      { name: "ne", x: 44, y: 16 },
      { name: "se", x: 44, y: 64 },
      { name: "sw", x: 6, y: 64 },
    ]);
  });

  it("follows zoom and pan, keeping the margin in screen px", () => {
    // The box's top-left lands at (10*2 + 100, 20*2 - 50) = (120, -10) on
    // screen, and it is 60 x 80 screen px. The margin stays 4px.
    expect(getHandles(box, zoomedAndPanned)).toEqual([
      { name: "nw", x: 116, y: -14 },
      { name: "ne", x: 184, y: -14 },
      { name: "se", x: 184, y: 74 },
      { name: "sw", x: 116, y: 74 },
    ]);
  });
});

describe("getHandleAt", () => {
  it("finds the handle under a screen point", () => {
    expect(getHandleAt(box, identity, { x: 6, y: 16 })).toBe("nw");
    expect(getHandleAt(box, identity, { x: 44, y: 64 })).toBe("se");
  });

  it("finds a handle a few screen px off its centre", () => {
    expect(getHandleAt(box, identity, { x: 48, y: 13 })).toBe("ne");
  });

  it("finds handles at their screen position under zoom and pan", () => {
    expect(getHandleAt(box, zoomedAndPanned, { x: 116, y: 74 })).toBe("sw");
  });

  it("returns null away from every handle", () => {
    expect(getHandleAt(box, identity, { x: 25, y: 40 })).toBeNull();
    expect(getHandleAt(box, identity, { x: 25, y: 16 })).toBeNull();
  });
});
