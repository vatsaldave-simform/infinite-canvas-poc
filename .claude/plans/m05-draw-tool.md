# Milestone 5 — Draw Tool (create shapes)

## Context
First tool that mutates the scene. The user picks a shape tool and **click-drags on the canvas to create an element**. This is where scene *state* logic is born, so it must honor the core boundary: **scene state lives in `core/` (plain TS), React only subscribes and wires pointer events.**

**Category split (restate at start):**
- **[B] Claude writes:** pointer-event wiring (Pointer Events API), element factories + id generation, the toolbar UI, and the React subscription hook. Mechanical / boilerplate once the design is set.
- **[A] User writes:** the **immutable scene-state update** — how `addElement` produces a new scene and notifies subscribers *without unnecessary full-scene re-renders*. Claude gives the interface + concepts + review, **not** the body. This is the learning core of M5.

Prereqs in place: `SceneElement` types (M1), transforms + `screenToWorld` (M2), pan/zoom (M3), `renderScene` (M4). Today `CanvasBoard` passes `EMPTY_SCENE`; M5 replaces that with the live store's scene.

## Design (to confirm when we start — a few open questions below)

### 1. Scene store — `src/core/scene/store.ts` (framework-agnostic)
The state container is a **core** module, not React state (constraint: React must not own scene state). Shape it as a tiny observable store so React can bind via `useSyncExternalStore`:
- **[A] user implements** the body of the mutation + snapshot logic. Claude provides the **interface** only, e.g.:
  ```ts
  interface SceneStore {
    getScene(): Scene                       // stable snapshot reference
    addElement(el: SceneElement): void      // immutable append + notify
    subscribe(listener: () => void): () => void
  }
  export function createSceneStore(initial?: Scene): SceneStore
  ```
- **Concept nudges (research):** immutable update (return a *new* array, keep unchanged elements by reference — structural sharing), the `getSnapshot` stability contract of `useSyncExternalStore` (same reference until a real change, or React loops), pub/sub listener set.

### 2. Element factories — `src/core/scene/factory.ts` [B]
`createRectangle`, `createEllipse`, `createFreehand` returning well-formed `SceneElement`s: `crypto.randomUUID()` id, default `ElementStyle`, and **normalize signed width/height** at creation (a bottom-right→top-left drag yields negatives mid-gesture — normalize to non-negative origin+size here, per the M1 type note that this is enforced at creation).

### 3. Active-tool + drag state
- **[B] React** owns the active tool (`'select' | 'rectangle' | 'ellipse' | 'freehand'`) as UI state (toolbar). `'select'` is a no-op placeholder until M7.
- **[B] Pointer wiring** in a new `src/react/useDrawTool.ts` (or fold into `CanvasBoard`): `pointerdown` → begin a **draft** element at `screenToWorld(pointer)`; `pointermove` → update draft size (rect/ellipse) or push a point (freehand); `pointerup` → finalize via factory + `store.addElement(...)`. Use `setPointerCapture` so the drag survives leaving the canvas. Wheel pan/zoom (M3) is untouched — drawing uses pointer drag, panning uses the wheel, so they don't collide.

### 4. Live preview during drag
The in-progress draft must render each frame before it's committed. Likely: keep the draft in a ref and have the render loop draw `[...scene, draft]` (draft on top). Confirm approach at start (draft-as-extra-element vs a transient overlay).

### 5. Wire into the render loop
- `useSceneStore` hook [B] (`useSyncExternalStore(store.subscribe, store.getScene)`) feeds the live scene into `usePanZoom(canvasRef, scene)` in place of `EMPTY_SCENE`.
- Repaint on store change (the existing `scene`-effect in `usePanZoom` already calls `scheduleRender` when the scene reference changes) and during drag (schedule a render on each `pointermove`).

## Files (anticipated)
- `src/core/scene/store.ts` (new) — **[A]** store body; **[B]** interface/scaffold.
- `src/core/scene/factory.ts` (new) — **[B]** factories + id gen + normalize.
- `src/core/scene/index.ts` (modify) — export store + factories.
- `src/react/useDrawTool.ts` (new) — **[B]** pointer wiring + draft state.
- `src/react/useSceneStore.ts` (new) — **[B]** `useSyncExternalStore` binding.
- `src/react/Toolbar.tsx` (new) — **[B]** tool picker (UI chrome).
- `src/react/CanvasBoard.tsx` (modify) — use the live scene; mount draw-tool wiring.

## Open questions to resolve at kickoff
1. **Which shapes in M5?** All three (rect + ellipse drag-to-size, freehand point capture), or start with rectangle only and add the others once the create-flow is proven?
2. **Store binding:** `useSyncExternalStore` over a core observable store (recommended, keeps state in core) — confirm vs any alternative.
3. **Preview rendering:** draft-as-extra-element vs transient overlay layer.

## Scope guardrails
- No hit-testing / selection (M6/M7) — `'select'` tool is a placeholder.
- No move/resize/delete (M8/M12), no persistence (M9+), no undo (M13).
- Scene state stays in `core/`; React only subscribes + wires events.
- Follow the A/B split: **do not** write the immutable-update body — hand the user the interface + concept, then wait for their attempt.

## Verification
1. `pnpm build` + `pnpm lint` clean; `core/` stays React-free.
2. `pnpm dev`: select a shape tool, click-drag on the canvas → a shape is created and stays put in world space (pan/zoom moves/scales it with the grid). Draw several; z-order = creation order. Drag bottom-right→top-left → still a correct, normalized shape.
3. Pixel-probe (as in M3/M4) a created shape's known world coords to confirm geometry/style.
