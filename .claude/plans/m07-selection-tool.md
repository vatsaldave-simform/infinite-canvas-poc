# M7 — Selection Tool (single-select)

## Context

M0–M6 are done: we can draw rectangles/ellipses/freehand, pan/zoom, and hit-test a
point against the scene (`src/core/scene/hit-test.ts`, back-to-front `hitTest`). M6
left a **throwaway console probe** in `useDrawTool.ts` (the `tool === 'select'`
branch, marked `TODO(M7)`) that just logs the topmost element under a click.

M7 turns that probe into a real feature: in **select** mode, clicking picks the
topmost element under the cursor and holds it as the single selection; clicking empty
space deselects; the selected element gets a highlight box painted over it. This is
the foundation M8 (move) and M12 (resize/delete) build on — they act on "the selected
element."

**Category (per roadmap):** wiring **[B]** (Claude) / selection state **[A]** (you).
Decisions made for this milestone:
- Selection lives in a **separate editor store**, not the scene document (keeps
  ephemeral UI state out of the scene we'll persist in M9, and lets selection survive
  the element-object replacement that M8's move will cause). **[A]**
- `getBoundingBox` geometry is **[A]** (you write it).
- Extras included: **Escape deselects**, **hover cursor feedback**, **auto-select
  after draw**.

---

## Concepts to learn before implementing

1. **Document state vs. app/session state.** The scene (elements) is the *document* —
   it's what gets persisted. *What's selected* and *which tool is active* are ephemeral
   *editor* state — they should never end up in the saved JSON. Excalidraw calls this
   split `elements` vs `appState`. That's why selection gets its own store, not a field
   on `SceneStore`.
2. **Reference selection by id, not by object.** Store the selected element's **id**
   (a string), never the element object. Our mutations are immutable — M8's move will
   replace the element with a *new* object. An id stays valid across that; a captured
   object reference would go stale. (This is the immutability lesson that pays off in M8.)
3. **The observable-store pattern, reused.** The editor store is the same shape as
   `SceneStore` (`src/core/scene/store.ts`): private state + a `Set` of listeners +
   `subscribe` returning an unsubscribe. You've seen this pattern; now you build another
   instance of it for a different concern.
4. **Overlay / decoration layering.** The selection box is *chrome*, not content. Like
   the in-progress draft, it's drawn **after** the scene, in a separate render step —
   never inside `drawElement`. Content and decoration stay separate.
5. **Bounding box in world space.** rect/ellipse already carry `x,y,width,height`.
   Freehand stores *offset* points from `(x,y)`, so its box is a min/max scan over the
   offsets, then shifted back by the origin. This box is reused by move-bounds (M8) and
   resize handles (M12).

---

## Part A — you write these (interface + concept, then I review)

### A1. `getBoundingBox` — `src/core/scene/bounds.ts` (new file)

The axis-aligned world-space box enclosing an element.

```ts
export interface Bounds { x: number; y: number; width: number; height: number }

export function getBoundingBox(el: SceneElement): Bounds
```

Concept / hints:
- `switch (el.type)` — keep it exhaustive (`noFallthroughCasesInSwitch` is on).
- rectangle / ellipse → return `{ x, y, width, height }` straight from the element.
- freehand → scan `el.points` (they're offsets) for min/max X and Y, then convert to
  world by adding `el.x` / `el.y`. Handle the single-point stroke (zero-size box).
  You already wrote a min/max scan in `isTinyStroke` (`useDrawTool.ts`) — same idea.
- Then export it from `src/core/scene/index.ts` alongside the hit-test exports.

### A2. `createEditorStore` — `src/core/editor/store.ts` (new file)

A tiny observable holding just the selection. Model it on `src/core/scene/store.ts`.

```ts
export interface EditorStore {
  getSelectedId(): string | null
  select(id: string | null): void          // pass null to clear
  subscribe(listener: () => void): () => void   // returns unsubscribe
}

export function createEditorStore(): EditorStore
```

Concept / hints:
- Private `let selectedId: string | null = null` + a `Set<() => void>` of listeners.
- `select` sets the id and notifies every listener; `select(null)` clears.
- `getSelectedId` returns the primitive (referential stability is automatic for a
  string/null — no array to keep stable, unlike the scene).
- Add a barrel `src/core/editor/index.ts` exporting `createEditorStore` + `EditorStore`.
  No path-alias change needed — `@core/*` already covers `@core/editor`.

**Stop points:** I hand you A1's signature/concept → you implement → I review before we
move to A2 → same for A2 → then I write Part B.

---

## Part B — I write these (wiring + rendering)

### B1. Selection highlight — `src/core/canvas` ([B])
Add `drawSelectionBox(ctx, bounds, viewport)` (new `selection.ts` or into `render.ts`;
export via `canvas/index.ts`). Takes a world-space `Bounds`, maps the corner with
`worldToScreen` and size by `viewport.scale`, then insets/outsets a small **constant
screen-px** margin so the box sits just outside the shape at any zoom. Distinct accent
stroke (e.g. dashed `#1e88e5`). DPR is already handled at the render boundary.

### B2. Render-loop integration — `src/react/usePanZoom.ts` ([B])
- Accept `editorStore` as a param. Mirror the scene subscription: keep a
  `selectedIdRef`, `subscribe` to the editor store, and `scheduleRender` on change.
- In `render`, after `renderScene` (and independent of the active tool): if
  `selectedIdRef.current` is set, `find` that element in the scene by id, and if present
  `drawSelectionBox(ctx, getBoundingBox(el), viewport)`. Draft still paints last.

### B3. Select-tool wiring — `src/react/useDrawTool.ts` ([B])
Replace the entire `tool === 'select'` probe branch with real handlers (accept
`editorStore` as a param):
- **pointerdown** → `hitTest(scene, world, HIT_SLOP_PX / scale)`; `editorStore.select(hit?.id ?? null)`.
- **pointermove (hover cursor)** → hit-test under cursor; set `canvas.style.cursor` to
  `'pointer'` when over an element, else `'default'`. Reset to `'default'` on cleanup.
- **Escape** → `window` keydown; `editorStore.select(null)`.
- Return a cleanup that removes all three.
- **Auto-select after draw** (in the rectangle/ellipse/freehand branches, non-select):
  after `store.addElement(el)`, call `editorStore.select(el.id)`. The highlight then
  shows even though the active tool isn't `select`.

### B4. Compose — `src/react/CanvasBoard.tsx` ([B])
`const [editorStore] = useState(() => createEditorStore())`; pass it into both
`usePanZoom` and `useDrawTool`.

### B5. Docs & memory ([B])
- `ARCHITECTURE.md`: add a short "Selection / editor state" note (separate store,
  id-based, overlay render step).
- Update `.claude/plans/README.md` (M7 → done, link this file) and the
  `milestone-roadmap` memory (M7 done, M8 next).

---

## Files

| File | Change | Cat |
|---|---|---|
| `src/core/scene/bounds.ts` | **new** — `getBoundingBox` + `Bounds` | A |
| `src/core/scene/index.ts` | export `getBoundingBox`, `Bounds` | A |
| `src/core/editor/store.ts` | **new** — `createEditorStore` / `EditorStore` | A |
| `src/core/editor/index.ts` | **new** — barrel | A |
| `src/core/canvas/selection.ts` (or `render.ts`) | **new** — `drawSelectionBox` | B |
| `src/core/canvas/index.ts` | export `drawSelectionBox` | B |
| `src/react/usePanZoom.ts` | subscribe editor store; draw highlight in loop | B |
| `src/react/useDrawTool.ts` | real select branch + hover + escape + auto-select | B |
| `src/react/CanvasBoard.tsx` | create + pass `editorStore` | B |
| `ARCHITECTURE.md`, `.claude/plans/README.md`, roadmap memory | docs | B |

Reuse: `hitTest` (`hit-test.ts`), `worldToScreen` (`transform.ts`), the observable
pattern in `store.ts`, `HIT_SLOP_PX` constant already in `useDrawTool.ts`.

## Out of scope (later milestones)
Moving the selection (M8), delete/resize (M12), multi-select / rubber-band (never —
explicitly out of scope). Persisting selection (never — it's ephemeral editor state).

## Verification
1. `pnpm dev` → in the browser:
   - Select tool: click a rectangle/ellipse/freehand → highlight box appears on the
     topmost one; click empty → it clears; **Escape** clears it.
   - Hover over a shape in select mode → cursor becomes a pointer; off → default.
   - Draw a new shape (any tool) → it's auto-selected (highlight shows immediately).
   - Pan/zoom with a selection active → the box tracks the shape and keeps a constant
     screen-px margin at every zoom level.
   - Overlapping shapes → clicking selects the front-most (z-order top).
2. `pnpm build` → typecheck passes (exhaustive switch in `getBoundingBox`, no unused
   symbols).
3. `pnpm lint` → clean; confirm no React import leaked into `src/core/**`.
