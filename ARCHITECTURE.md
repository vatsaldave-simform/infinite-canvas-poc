# Architecture

An infinite-canvas drawing engine (Excalidraw-style), rendered to a single HTML `<canvas>`. This document explains how the pieces fit together so the code comments can stay short.

## The two-layer boundary

The codebase is split into two layers with a strict, one-directional dependency:

```
src/core/   — the engine: plain data + pure logic. No React, no DOM assumptions
              beyond standard browser APIs (Canvas 2D, storage).
src/react/  — the UI: owns the <canvas> DOM node, wires pointer/wheel events,
              and renders UI chrome (toolbar). Calls into core/.
```

**Dependencies flow `react/ → core/`, never the reverse.** This is enforced at build time — `eslint.config.js` makes any React import from within `src/core/**` an error. The point: the engine is framework-agnostic and could be driven by any UI.

Path aliases: `@core/*` → `src/core/*`, `@react/*` → `src/react/*` (defined in `vite.config.ts` and `tsconfig.json`).

Entry flow: `index.html` → `src/main.tsx` (React root, StrictMode) → `src/App.tsx` → `src/react/CanvasBoard.tsx`.

## Coordinate spaces: world vs screen

Every rendering/interaction bug tends to come from confusing two coordinate systems:

| Space | Origin | Units | Changes on pan/zoom? |
|---|---|---|---|
| **World** | scene origin (0,0) | world units | Never — a shape's world position is fixed. |
| **Screen** | canvas top-left | CSS pixels | Yes — this is what pointer/wheel events report. |

Mental model: the world is an infinite sheet; the **`Viewport` is a camera** looking at part of it. Shapes never move when you navigate — the camera does.

```ts
interface Viewport { offsetX, offsetY, scale }
// offset = where world (0,0) sits on screen (px); scale = screen px per world unit
```

The mapping (`src/core/canvas/transform.ts`):

- `worldToScreen(p, vp)` → `p * scale + offset`
- `screenToWorld(p, vp)` → `(p - offset) / scale`
- `zoomAtPoint(vp, anchor, newScale)` → changes `scale` while adjusting `offset` so the world point under `anchor` stays put (zoom-toward-cursor).

`src/core/canvas/viewport.ts` holds the zoom *policy*: `MIN/MAX_SCALE`, `clampScale`, and `scaleFromWheel` (a **multiplicative** wheel-delta → scale, so a gesture zooms by the same proportion at any level).

Device-pixel-ratio (HiDPI) is applied **only at the draw boundary** — see the render loop. All geometry math works in CSS pixels / world units.

## The render loop

`src/react/usePanZoom.ts` owns viewport state and the paint cycle. Repaints are batched through `requestAnimationFrame` and driven imperatively — viewport and scene live in refs, so bursts of wheel/pointer events don't trigger React re-renders; only the canvas repaints.

Each frame (`render`):

1. `ctx.setTransform(dpr, …)` — the one place DPR is applied.
2. `clearRect`
3. `drawReferenceGrid(...)` — world-space grid (`src/core/canvas/grid.ts`), a visual aid.
4. `renderScene(ctx, scene, viewport)` — the committed elements (`src/core/canvas/render.ts`).
5. the in-progress **draft** element, if any, painted on top.

`scheduleRender()` coalesces calls: if a frame is already pending, it no-ops.

### Input

A non-passive `wheel` listener (so `preventDefault` works) routes gestures Excalidraw-style:

- plain wheel / two-finger scroll → **pan** (adjust `offset`)
- Ctrl/Cmd + wheel, trackpad pinch → **zoom at cursor** (`clampScale(scaleFromWheel(...))` → `zoomAtPoint`)

Drawing uses **pointer** events (`src/react/useDrawTool.ts`), so it never collides with wheel-based navigation.

## Scene model & state

`src/core/scene/types.ts` is the shared vocabulary:

- `SceneElement` is a discriminated union (`rectangle | ellipse | freehand`) — narrow with `switch (el.type)`.
- A `Scene` is an ordered `SceneElement[]`; **array order is z-order** (later index = on top; hit-testing walks back-to-front).
- Coordinates are world-space; freehand `points` are offsets from the element's `(x, y)`.

**State lives in core, not React.** `src/core/scene/store.ts` (`createSceneStore`) is a tiny observable:

- `getScene()` returns a referentially-stable snapshot (same array until a real mutation).
- `addElement(el)` appends **immutably** (new array) and notifies subscribers.
- `subscribe(fn)` registers a listener, returns an unsubscribe.

React binds to it through `useSyncExternalStore` (`src/react/useSceneStore.ts`). Immutable updates + stable snapshots are what make change-detection cheap and keep the door open for undo later.

## Creating elements

`src/core/scene/factory.ts` turns raw input into well-formed elements: assigns an `id` (`crypto.randomUUID()`), applies `DEFAULT_STYLE`, and **normalizes geometry**. `createRectangle` / `createEllipse` convert two drag corners to a non-negative origin + size (`normalizeRect`); `createFreehand` converts a run of absolute world points into an origin + relative offsets (`freehandGeometry`). The types permit signed width/height mid-drag; normalization happens here at creation time.

Draw flow (`useDrawTool`): the toolbar picks a tool (`rectangle` / `ellipse` / `freehand`, plus an inert `select`). Rectangle and ellipse are two-corner drags (`pointerdown` start → `pointermove` resize); freehand captures a point per `pointermove`. Either way a *draft* element is kept in a ref and painted on top; `pointerup` finalizes via the factory and commits with `store.addElement`. Tiny drags / too-few points are ignored (no zero-size shapes).

## File map

```
src/
├── main.tsx / App.tsx           React root → CanvasBoard
├── core/
│   ├── scene/
│   │   ├── types.ts             SceneElement union, Scene (z-order = array order)
│   │   ├── store.ts             createSceneStore — observable scene state
│   │   ├── factory.ts           createRectangle/Ellipse/Freehand, normalizeRect, DEFAULT_STYLE
│   │   ├── sample.ts            sampleScene fixture (verification only)
│   │   └── index.ts             barrel → @core/scene
│   └── canvas/
│       ├── transform.ts         screenToWorld / worldToScreen / zoomAtPoint
│       ├── viewport.ts          MIN/MAX_SCALE, clampScale, scaleFromWheel
│       ├── grid.ts              drawReferenceGrid
│       ├── render.ts            renderScene
│       └── index.ts             barrel → @core/canvas
└── react/
    ├── CanvasBoard.tsx          owns <canvas> + sizing; wires store, toolbar, tools
    ├── usePanZoom.ts            viewport state, wheel input, render loop
    ├── useDrawTool.ts           pointer-drag shape creation
    ├── useSceneStore.ts         binds core store to React
    └── Toolbar.tsx              tool picker (UI chrome)
```

> This is a learning-project POC built with minimal libraries: raw Canvas 2D (no Fabric/Konva), hand-written transform math (no gl-matrix), and raw storage APIs. See `CLAUDE.md` for build commands and conventions.
