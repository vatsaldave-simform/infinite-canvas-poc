# Milestone 6 — Hit Testing

## Context

M6 adds the geometric primitive that every selection/manipulation milestone (M7 select, M8 move, M12 resize/delete) is built on: **given a world-space point, which element — if any — is under it?** Nothing selects or moves yet; M6 produces a pure, framework-agnostic answer to "what did I click?" and returns the **topmost** element (z-order aware).

This is **Category A** — the learning core is the geometry. I give you the interfaces, the concepts, and what to research; **you write the bodies.** I review your attempt (missed edge cases, math) before showing any implementation. The only Category-B piece is the throwaway verification probe.

**Prereqs already in place:** `SceneElement` union with normalized non-negative `{x,y,width,height}` for rect/ellipse (top-left origin) and freehand `points` as offsets from `(el.x, el.y)` (`src/core/scene/types.ts`, `factory.ts`); `screenToWorld` (`src/core/canvas/transform.ts`); `Scene` array where **later index = drawn on top**. There is **no existing hit-test or geometry helper** in core — this is all new.

## Decisions (settled at kickoff)

1. **Hit region = whole filled area.** A hit on a rectangle is anywhere inside its bounding box; on an ellipse, anywhere inside the inscribed ellipse — even when `fillColor` is `'transparent'`. (Freehand has no interior, so it's always near-the-path.)
2. **Tolerance is caller-supplied, in world units.** `hitTest` takes a `tolerance` argument. The React layer computes it as `slopPx / viewport.scale` so the clickable band is a constant number of *screen* pixels at any zoom. Core stays pure and zoom-agnostic.
3. **Verify with a throwaway click probe** (Category B, clearly marked, removed in M7).

## The concepts to research (this is the milestone)

You'll implement five things; here's the geometry behind each and what to look up.

1. **Point in an axis-aligned rectangle (AABB).** Since factory output is normalized (non-negative w/h, `(x,y)` = top-left), it's four comparisons: `x ≤ px ≤ x+width && y ≤ py ≤ y+height`. Research term: *"point in axis-aligned bounding box"*.

2. **Point in an ellipse.** Center `(cx,cy) = (x+width/2, y+height/2)`, radii `rx = width/2`, `ry = height/2`. Inside when the **normalized ellipse equation** `((px-cx)/rx)² + ((py-cy)/ry)² ≤ 1`. Watch the **degenerate case**: a zero-width or zero-height ellipse (guard divide-by-zero). Research: *"implicit equation of an ellipse", "point inside ellipse test"*.

3. **Distance from a point to a line segment.** This is the heart of freehand hit-testing and the one genuinely new algorithm. For segment `A→B` and point `P`: project `P` onto the line via the dot product, get parameter `t = ((P−A)·(B−A)) / (B−A)·(B−A)`, **clamp `t` to `[0,1]`** so you stay on the segment (not the infinite line), then the distance is `|P − (A + t·(B−A))|`. Handle the **degenerate A==B** segment (a single point). Research: *"distance from point to line segment", "vector projection dot product", "clamp t 0 1"*. This is worth doing slowly — it's the reusable core.

4. **Point near a freehand path.** Reconstruct absolute points (`el.x + p.x`, `el.y + p.y`) — or, equivalently, translate the query point into element-local space by subtracting `(el.x, el.y)` and compare against the raw offsets. Walk each consecutive segment, take the **minimum** distance-to-segment, hit when `min ≤ tolerance`. Edge case: a freehand with a **single point** (no segments) — fall back to point-to-point distance.

5. **Z-order resolution (topmost wins).** Walk the `Scene` **from the last index down to 0** and return the first element that tests positive. Later index = on top, so back-to-front traversal returns what the user visually sees on top. Return `null` if nothing hits.

**Cross-cutting concept — world vs screen tolerance:** internalize *why* tolerance is passed in world units and divided by `scale`. A fixed world constant would make the freehand click-band feel thin when zoomed out and fat when zoomed in; `slopPx / scale` keeps it a constant screen feel. (This is the same world/screen split that has bitten every prior milestone — see `ARCHITECTURE.md` "Coordinate spaces".)

## Interfaces (yours to implement — signatures only, no bodies)

New file: **`src/core/scene/hit-test.ts`**. Suggested shape — adjust names if you prefer, but keep the `Point`/`Scene` types from `@core/scene`:

```ts
import type {
  Point, Scene, SceneElement,
  RectangleElement, EllipseElement, FreehandElement,
} from './types'

/** Min distance from P to segment A–B (clamped to the segment). Private helper. */
function distanceToSegment(p: Point, a: Point, b: Point): number

/** World point inside the rectangle's bounding box. */
export function hitTestRectangle(el: RectangleElement, point: Point): boolean

/** World point inside the inscribed ellipse. */
export function hitTestEllipse(el: EllipseElement, point: Point): boolean

/** World point within `tolerance` (world units) of the polyline. */
export function hitTestFreehand(el: FreehandElement, point: Point, tolerance: number): boolean

/** Dispatch by element type — exhaustive switch (noFallthroughCasesInSwitch is on). */
export function hitTestElement(el: SceneElement, point: Point, tolerance: number): boolean

/** Topmost element under `point`, or null. Walks back-to-front (z-order). */
export function hitTest(scene: Scene, point: Point, tolerance: number): SceneElement | null
```

Notes:
- `hitTestElement` must `switch (el.type)` and stay exhaustive (TS will flag a missing case; keep the `default` narrowing or a `never` check as elsewhere).
- Tolerance only matters for freehand today; it's threaded through `hitTestElement`/`hitTest` uniformly so rect/ellipse ignore it (or you can add a small edge-tolerance later — not required now).
- Keep it pure: no DOM, no React, no `Viewport` inside core hit-test. The caller does `screenToWorld` first.

## Files

- **`src/core/scene/hit-test.ts`** (new) — **[A]** the five functions above + the private segment-distance helper. The learning deliverable.
- **`src/core/scene/index.ts`** (modify) — **[B]** barrel-export `hitTest` (and optionally the per-type functions for testing). One line, I can do it.
- **Throwaway probe** (`src/react/useDrawTool.ts` or `CanvasBoard.tsx`) — **[B]**, clearly commented as temporary, removed in M7: on `pointerdown` while the active tool is `select`, do `screenToWorld(pointer, viewport)` → `hitTest(scene, worldPt, SLOP_PX / viewport.scale)` → `console.log` the hit element's `id`/`type` (or `"miss"`). Uses the existing inert `'select'` tool; adds no real selection state.

## Scope guardrails

- **No selection state, no highlight rendering, no move/resize** — those are M7/M8/M12. M6 is a pure query function plus a console probe.
- Don't add selection fields to the store or `SceneElement` yet.
- Core stays React/DOM-free; the ESLint boundary rule must stay green.
- Keep the A/B split: I hand you interfaces + concepts and **stop**. You write `hit-test.ts`, paste it, I review. I only show my version if you ask or are stuck after hints.

## Verification

1. `pnpm build` (typecheck gate) + `pnpm lint` clean; `core/` stays framework-free.
2. `pnpm dev`, draw a few of each shape, switch to the **select** tool, and click:
   - **Inside** a rectangle / ellipse → logs that element; **just outside** → `miss` (ellipse corners inside the bbox but outside the curve should miss — good ellipse-vs-rect check).
   - **On/near** a freehand stroke → hit; a few px away → miss. **Zoom way in and way out** and re-click the same stroke: the clickable band should feel the same on screen (confirms the `slop/scale` tolerance).
   - **Overlapping** shapes → the click logs the **topmost** (most-recently-drawn) one, confirming back-to-front z-order.
3. Optional: temporarily probe known world coords (as in M3/M4) — e.g. a shape at a known `(x,y,w,h)`, assert `hitTestRectangle` true just inside and false just outside each edge, and that an ellipse test rejects a bounding-box corner.

## Research pointers (quick list)

- Point-in-AABB test.
- Implicit / normalized ellipse equation; guarding zero radii.
- **Distance from point to line segment** (vector projection, dot product, clamp `t` to `[0,1]`, degenerate `A==B`). ← the key one.
- Why hit tolerance is expressed in world units and scaled by zoom (screen-constant feel).
- Back-to-front array traversal for topmost pick.
