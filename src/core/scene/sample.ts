/**
 * Sample scene fixture — a hardcoded Scene for eyeballing / pixel-testing the
 * renderer. Not used by the running app.
 */

import type { Scene } from "./types";

export const sampleScene: Scene = [
  {
    id: "sample-rect-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 120,
    style: {
      strokeColor: "#1e88e5",
      fillColor: "#bbdefb",
      strokeWidth: 2,
    },
  },
  {
    id: "sample-ellipse-1",
    type: "ellipse",
    x: 360,
    y: 140,
    width: 160,
    height: 160,
    style: {
      strokeColor: "#e53935",
      fillColor: "transparent",
      strokeWidth: 3,
    },
  },
  {
    id: "sample-freehand-1",
    type: "freehand",
    x: 120,
    y: 320,
    style: {
      strokeColor: "#43a047",
      fillColor: "transparent",
      strokeWidth: 4,
    },
    // Offsets from (x, y) — a small wavy stroke.
    points: [
      { x: 0, y: 0 },
      { x: 40, y: -30 },
      { x: 80, y: 20 },
      { x: 120, y: -20 },
      { x: 160, y: 30 },
      { x: 200, y: 0 },
    ],
  },
];
