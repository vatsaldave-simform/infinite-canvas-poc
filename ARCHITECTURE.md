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

Entry flow: `index.html` → `src/main.tsx` (starts the document load, React root, StrictMode) → `src/App.tsx` → `src/react/DocumentLoader.tsx` (suspends until the document arrives) → `src/react/CanvasBoard.tsx`. See *Persistence → Loading*.

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
5. the **selection highlight**, if an element is selected — a dashed box around its bounding box (`drawSelectionBox`), editor chrome drawn over the scene. In the select tool it also carries the resize handles (see *Resizing*).
6. the in-progress **draft** element, if any, painted on top.

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
- `insertElement(el, index)` puts an element in at a given index, so at that
  depth in z-order, with the others keeping their order. Undoing a delete uses
  it to bring the element back where it stood, and redoing a draw uses it too
  (see *History*). Adding is, conceptually, inserting on top, though
  `addElement` is still its own append.
- `replaceElement(next)` swaps the element with `next.id` for `next`, keeping
  its **array index** — a move must never change z-order. An unknown id is a
  no-op that returns the *same* array, so the snapshot stays stable.
- `removeElement(id)` takes the element out, keeping the rest in order, and
  **returns the index it removed from**, so the removal can be undone at the
  same depth. Taking the index from the removal itself leaves no gap between
  finding and removing. It follows `replaceElement`'s contract: an unknown id
  keeps the same array, notifies no one, and returns `-1`.
- `subscribe(fn)` registers a listener, returns an unsubscribe.

Nothing binds the store through `useSyncExternalStore`: `usePanZoom` subscribes directly and copies each snapshot into a ref, repainting through rAF, so committing a shape never re-renders `CanvasBoard` or the toolbar. The stability contract documented in `store.ts` is what *would* make `useSyncExternalStore` safe if a component ever needs to read the scene during render. Immutable updates + stable snapshots are what make change-detection cheap, and the frozen-element rule is what lets a history entry hold an element by reference (see *History*).

### Selection & editor state

Selection is **editor state, not document state** — it is *not* part of the scene and will *not* be persisted (Excalidraw's `elements` vs `appState` split). It lives in a separate observable, `src/core/editor/store.ts` (`createEditorStore`), built the same way as the scene store:

- `getSelectedId()` / `select(id | null)` / `subscribe(fn)` — holds a single selected **id**, or `null`.
- Selection references an element **by id, not by object**: immutable mutations (e.g. moving in M8) replace the element with a new object, and an id stays valid across that where a captured reference would go stale.

`usePanZoom` subscribes to it alongside the scene store and repaints via the same ref/rAF path; the render loop looks the id up in the current scene and draws the highlight (step 5 above). Drawing any shape auto-selects it.

## Selecting & moving

`src/react/useSelectTool.ts` owns the select gesture; `useDrawTool` handles
creation only. Both convert pointer events through the shared
`pointerToWorld(canvas, e, viewport)` in `src/react/pointer.ts`.

Press → select the topmost hit element (empty press clears) → drag it to move.
It is **one gesture**: pressing an element you had not selected selects it and
arms a drag in the same motion. Cursors are `move` on hover, `grabbing` once a
drag arms, a resize cursor over a handle (see *Resizing*), `default`
otherwise; hover hit-testing is skipped while dragging.

Two rules make the drag behave:

- **A screen-space arming threshold** (`DRAG_THRESHOLD_PX = 3`). Below it the
  gesture is a plain click, so a sloppy select never nudges a shape. Screen px
  for the same reason as `HIT_SLOP_PX` — a world-unit threshold would mean
  something different at every zoom. Once armed the drag stays armed, so
  returning near the press point does not disarm it.
- **An absolute delta.** `pointerdown` captures the press point (in both spaces)
  and the element *as it was*; every move writes
  `translateElement(pressed, currentWorld − pressWorld)`. Re-deriving from the
  original each frame cannot drift, tolerates dropped move events, and stays
  correct if the viewport zooms mid-drag.

The move **commits live** — each `pointermove` goes straight through
`store.replaceElement`, so the scene is always the truth and the highlight,
hit-testing and renderer follow with no second source of position and no
explicit repaint call. `pointercancel` leaves the element where it landed.
See `docs/adr/0002-drag-commits-live-to-the-scene-store.md`. However many
writes a drag makes, history records it once, when it ends (see *History*).

`src/core/scene/translate.ts` holds the geometry: `translateElement(el, delta)`
returns a new element offset by `delta`. It needs no per-type `switch` — every
element carries `x`/`y` on `BaseElement`, and freehand `points` are relative to
that origin, so moving the origin moves the whole stroke.

## Resizing

In the select tool, the selected element shows eight **handles** on its dashed
selection box: four corners, then the four edge midpoints. Dragging one resizes
the element, and the opposite corner or edge, the **anchor**, stays fixed in
the world. The vocabulary (handle, anchor, fit) is in `CONTEXT.md`, and the
decisions are in `.claude/plans/m12-resize-delete.md`.

`getHandles(bounds, viewport)` in `src/core/canvas/selection.ts` is the one
list of handle positions, in screen px. `drawSelectionBox` paints that list
and `getHandleAt` hit-tests a screen point against it, so drawing and
hit-testing can't disagree. Three rules shape it:

- **Screen-px handles.** A handle is drawn 8px square and grabbed within 12px,
  centred on the dashed box (which sits 4px outside the shape). Screen px for
  the same reason as `HIT_SLOP_PX`.
- **Corners win overlaps.** On a small box the edge midpoints land on the
  corners. Corners come first in the list, so `getHandleAt` returns a corner,
  and the list is painted in reverse so the corner is also the square on top.
  A corner can always do what an edge can.
- **Handles only in the select tool.** In a draw tool, a press near a handle
  would be ambiguous with starting a shape. `CanvasBoard` passes
  `showHandles` (`tool === "select"`) into `usePanZoom`, which keeps it in a
  ref like the selected id. The selection box itself still shows in every
  tool, for example straight after auto-select. The tool stays React state
  (`CONTEXT.md`, "Tool").

The gesture lives in `useSelectTool`, beside move. On `pointerdown` the
selected element's handles are tested **before** any element (through
`pointerToScreen`), so a visible handle always answers, even under another
element or outside the shape. From there it follows move's rules exactly: the
3px arming threshold, every frame recomputed from the element and press point
captured on `pointerdown`, a live commit through `replaceElement`, and
`pointercancel` leaving the element where it is (ADR-0002, unchanged). Each
frame:

1. `getResizeTarget` moves the edges the handle grabs by the pointer's world
   delta. A corner grabs two edges, an edge handle one. The other axis keeps
   its original size.
2. Each axis the handle changes is clamped to at least ±`MIN_ELEMENT_SIZE`,
   keeping its sign, and measured out from the anchor so the anchor never
   moves. An axis the handle leaves alone is **not** clamped: drawing accepts a
   50×1 freehand stroke, and an `e` drag must not make it taller.
3. `fitElement(pressed, target)` builds the new element and `replaceElement`
   commits it.

Dragging past the anchor makes the target's width or height negative. That is
the **flip**: the sign carries it into fit, which never has to work it out.
The grabbed handle's cursor (`nwse-resize`, `nesw-resize`, `ns-resize`,
`ew-resize`) is set on press and kept for the whole gesture, even after a flip.

The absolute recompute matters even more here than for move. Fitting the
previous frame's element again would build up drift, and a stroke squashed
flat once could never be recovered within the gesture.

`src/core/scene/resize.ts` holds the geometry. `fitElement(el, target)` makes
the element's bounding box equal `target`, whose width and height **may be
negative, meaning flipped** (`getBoundingBox` never returns a negative size):

- **Rectangle and ellipse** look the same flipped, so fit only re-normalises
  the target to a non-negative origin and size.
- **Freehand** is stretched: the origin and every point offset are scaled per
  axis by `target / box`, so a negative factor mirrors the stroke. A **flat
  axis** (zero extent: a perfectly straight stroke, which drawing allows) keeps
  factor 1, because `n / 0` has no meaning; there the stroke only moves.
- `style` is shared by reference, so stroke width never stretches, for any
  type.

`MIN_ELEMENT_SIZE` (2) lives in the same file and `useDrawTool` uses it too:
resize must not be a back door around what drawing refuses. It is in world
units, because it is a rule about the document, not about pointing precision.

## Deleting

Delete or Backspace (the delete key on a Mac keyboard) deletes the selected
element **in any tool**, so "draw, oops, delete" works straight after
auto-select. That is why it lives in `src/react/useEditorKeys.ts`, the hook
for the shortcuts that work in any tool, rather than in `useSelectTool`, which
only runs in the select tool. There is no toolbar button: the toolbar holds tools only.

- **Delete = remove + record + deselect.** The hook calls
  `store.removeElement(id)`, records a `remove` entry with the element and the
  index it returned, then calls `editorStore.select(null)`. The scene store
  knows nothing about selection or history.
- **Ignored mid-press.** While a left-button press on the canvas is in progress
  (a move, a resize, a shape being drawn), the key does nothing. Otherwise
  Delete mid-draw would delete the *previous* element, and Delete mid-move
  would leave the outcome to how `replaceElement` happens to treat an unknown
  id. The hook keeps its own `pressing` flag, set by the canvas's `pointerdown`
  and cleared by `pointerup` / `pointercancel` on the window, rather than
  sharing "is gesturing" state between hooks. The same flag covers undo and
  redo (see *History*).

`removeElement` notifies like every other mutation, so the render loop
repaints and the persister saves the change.

## Creating elements

`src/core/scene/factory.ts` turns raw input into well-formed elements: assigns an `id` (`crypto.randomUUID()`), applies `DEFAULT_STYLE`, and **normalizes geometry**. `createRectangle` / `createEllipse` convert two drag corners to a non-negative origin + size (`normalizeRect`); `createFreehand` converts a run of absolute world points into an origin + relative offsets (`freehandGeometry`). The types permit signed width/height mid-drag; normalization happens here at creation time.

Draw flow (`useDrawTool`): the toolbar picks a tool (`rectangle` / `ellipse` / `freehand`, plus `select` — see *Selection & editor state*). Rectangle and ellipse are two-corner drags (`pointerdown` start → `pointermove` resize); freehand captures a point per `pointermove`. Either way a *draft* element is kept in a ref and painted on top; `pointerup` finalizes via the factory, commits with `store.addElement` and records an `add` entry (see *History*). Tiny drags / too-few points are ignored (no shape under `MIN_ELEMENT_SIZE`, see *Resizing*), so they commit and record nothing.

## History

Ctrl/Cmd+Z undoes the last change to the document; Ctrl/Cmd+Shift+Z or Ctrl+Y
redoes it. A change is one whole editor action: a drawn element, a move, a
resize or a delete, however many store writes it took. The vocabulary
(history, undo, redo, history entry) is in `CONTEXT.md`, the decisions are in
`.claude/plans/m13-undo-redo.md`, and the design choice is ADR-0005
(`docs/adr/0005-history-records-scene-operations.md`).

**The store stays the source of truth.** History is a log *about* the scene,
not the thing the scene is rebuilt from: this is not event sourcing (ADR-0005
records why). `createHistory(store)` in `src/core/history/history.ts` binds to
the scene store when it is created, like the persister, but only keeps a
reference to it: it never subscribes. It keeps two stacks. `record(entry)`
pushes onto the undo stack and empties the redo stack, so history is
**linear**. `undo()` and `redo()` apply an entry through the store and return
it, or return `null` and touch nothing when there is nothing to apply. History
is plain core code, with no DOM and no React, tested in node. It has no
`subscribe` of its own: with no undo or redo buttons, nothing needs to redraw
when "can undo" changes.

**Entries are scene operations, as plain data.** An entry says what happened to
the scene, not which gesture did it, and holds no behaviour; history
interprets it with a `switch` on `kind`:

| Entry | Holds | Undo | Redo |
|---|---|---|---|
| `add` | element, index | `removeElement(id)` | `insertElement(element, index)` |
| `replace` | before, after | `replaceElement(before)` | `replaceElement(after)` |
| `remove` | element, index | `insertElement(element, index)` | `removeElement(id)` |

The inverses pair up: add and remove are mirror images, and replace swaps
before and after. A move and a resize are both a `replace`. Redoing an `add`
inserts rather than appends, so it keeps that mirror. Entries hold elements
by reference. That is safe because a committed element is never mutated in
place (the frozen rule in `CONTEXT.md`), so the element an entry holds is
exactly the one that was in the scene.

**Whoever owns an action records it, when it finishes.** Nothing subscribes
to the store and diffs scenes. The store cannot know where a gesture ends
(ADR-0002), and an undo writes through the same store, so a diffing history
would hear its own undos as new changes.

- `useSelectTool` records one `replace` when a move or resize ends, from the
  element as pressed to the element as the drag left it. It records on
  `pointercancel` too, because ADR-0002 leaves that change in place and it is
  persisted. A click below the 3px arming threshold wrote nothing, so it
  records nothing.
- `useDrawTool` records one `add` after `addElement`, with the top index. A
  cancelled or too-small draw commits nothing and records nothing.
- `useEditorKeys` records one `remove` on delete, with the index
  `removeElement` returned.

Every future document change must record an entry too, or undo will skip it.
A test in `history.test.ts` backs the pattern up: a run of draws, moves, a
resize and deletes, undone completely, must give back the starting scene, and
redone completely, the final one. It drives the store and history through
small helpers that record the way each owner does, not through the React
hooks, which have no tests. So it catches a wrong inverse or a helper that
skips its record, but not a hook that forgets to record. For a new action,
undoing everything in the browser is the check.

**The keys** live in `useEditorKeys`, beside Delete: one keydown listener on the
window and one `pressing` flag for Delete, Backspace, undo and redo. Escape
stays in `useSelectTool`, because deselecting only means something there.

- **Ignored mid-press,** like Delete. Otherwise undo would revert the
  *previous* entry while a live drag kept writing over it.
- **Handled keys call `preventDefault`,** so the browser's own Ctrl+Z / Ctrl+Y
  does not run as well. A key ignored mid-press is not handled, so it does not
  call it. Held keys repeat, and each repeat applies one more entry.
- **Selection follows the entry.** After an undo or redo, the element the
  entry changed is selected if it is in the scene now, otherwise the selection
  is cleared, so it never points at a missing id. Undoing a move or a delete
  selects that element; undoing a draw, or redoing a delete, clears the
  selection. With nothing to apply, the selection is left alone. The rule
  lives in the hook, because history never sees the editor store.

**What history leaves out.** Selection, the tool and the viewport are editor
state and are not undoable. History is never persisted, so a reload starts
with empty history; it has no size limit, since an entry is a few references
to frozen elements. Persistence needed nothing new: undo and redo write
through the store, which notifies, and the debounced persister saves the
result, so a burst of held-key undos becomes one write. The dev diagnostics'
`fill` adds elements without recording; an entry assumes the scene is as
history left it, and that is accepted for a dev tool.

## Persistence

The scene is persisted to **IndexedDB**, through the raw API with no wrapper. This replaced a deliberately naive localStorage pass, which was broken on purpose and measured. The reasoning is in ADR-0003 (the mechanism) and ADR-0004 (what happens to a document that will not load). The decisions are in `.claude/plans/m11-indexeddb-persistence.md`.

Only the **scene** is persisted. Editor state (selection, tool) and the viewport are not, so a reload restores the *document*, not the session: shapes return at their world coordinates, the camera sits at the world origin at 1×, nothing is selected. See `CONTEXT.md` ("Persistence") for the vocabulary — *store* always means the in-memory observable, never the persisted copy (IndexedDB's containers are always *object stores*), and *persist* is the verb for crossing into storage.

### What is stored

`src/core/persistence/indexed-db.ts` opens one database, `infinite-canvas`, with two object stores:

- `documents` — one record under the fixed key `"scene"`: the **whole scene** as `{ version: 1, elements }` (`StoredDocument`, in `format.ts`). `elements` is the scene array as it is, so array order is still z-order. It is stored by structured clone, not as JSON.
- `quarantine` — auto-increment, holding documents that could not be loaded (see below).

A whole-scene snapshot rather than one record per element, because the scene already *is* a snapshot: the store notifies with no description of what changed. Per-element records would need a diff on every write, an ordering field to carry z-order, and atomicity across records so that a reload never sees half a move.

Two versions move independently. The **format version** (`FORMAT_VERSION`, 1) is the shape of the stored document. The **database version** (`DATABASE_VERSION`, 2) is the object-store layout: `onupgradeneeded` creates whichever object stores the database on disk lacks. There is no *upgrade* code, because nothing older than format version 1 is ever read. The old localStorage key (`infinite-canvas:scene`) is removed, unread, on every boot (`removeLegacyScene`). Removing it unconditionally needs no "already done" flag.

Every readwrite transaction calls `commit()` explicitly once its requests are queued, because a write issued during page unload may never reach the implicit end-of-task commit.

### Loading

`src/main.tsx` calls `loadDocument()` once per page load, **outside any render**, so StrictMode's double render and double-mounted effects cannot start it twice. The promise is handed through `App` to `src/react/DocumentLoader.tsx`, which suspends on it with React 19's `use()` inside `<Suspense fallback={null}>`. `CanvasBoard` mounts only once the scene is in hand, and seeds its store with it: `useState(() => createSceneStore(initialScene))`.

So the store is still **born holding the document**, although loading is now asynchronous. The "not arrived yet" state exists, but only *above* the board: no store, hook or tool ever sees it. No stroke can be drawn before the document arrives, so there is nothing for the load to clobber or merge with. The fallback is blank because the canvas has no background of its own. An empty page is what the canvas looks like before it paints, and a local load is fast enough that a "Loading…" label would only flash.

`loadDocument()` (`src/core/persistence/load.ts`) **never rejects**. Every outcome resolves to a `LoadedDocument`, so nothing throws into render and the load path needs no error boundary:

| status | when | the board gets |
|---|---|---|
| `loaded` | the document validated, or nothing was stored yet | the scene, and the open connection |
| `quarantined` | the document failed validation | an empty scene, the connection, and a dismissible notice |
| `unavailable` | IndexedDB would not open, read or quarantine (missing, blocked by another tab, a security error) | an empty scene, `db: null`, and a persistent notice |

### Validation and quarantine

`validateDocument` (`src/core/persistence/validate.ts`) is pure and never throws, whatever it is given. It is **all-or-nothing**: one bad element rejects the whole document. It checks:

- **the envelope:** `version` is 1 and `elements` is an array
- **every element:** a non-empty `id`, unique across the scene; a known `type`; finite `x`/`y`
- **geometry, per type:** finite, non-negative `width`/`height`; or a non-empty `points` array of finite `{x, y}`
- **the style:** string colours and a finite, non-negative `strokeWidth`

Unknown extra fields are ignored, and colours are not parsed as CSS. Both are deliberate: a change that alters meaning bumps the format version instead, and the canvas already ignores an invalid colour string.

The result carries a reason and the path of the first error (`elements[37].type`). A *newer* format version is reported as `unknown-format-version`, not `invalid`, because it may be a perfectly good document from a newer build. Each check answers a failure that was either measured or reasoned out. An unknown `type` would be invisible yet hit-test true everywhere, because the `never` exhaustiveness guards are compile-time only. A repeated id would break selection and `replaceElement`, which both find elements by id.

A document that fails is **quarantined** (ADR-0004). It is moved intact into the `quarantine` object store as `{ value, reason, path, quarantinedAt }`, in one transaction across both object stores, so it is never in both places and never in neither. The app then starts empty and persists normally, and nothing it writes can reach the quarantined copy. Records are kept forever. Recovery is devtools-only, so the console names where the record went.

### Writing: the coalescing persister

`createPersister(store, write, { delay, onStatusChange })` (`src/core/persistence/persister.ts`) subscribes to the scene store. It writes the latest scene `delay` ms after the **last** notification: a trailing debounce. A move-drag notifies on every `pointermove` (ADR-0002), so debouncing turns the whole gesture into one write. The persister knows neither the DOM nor IndexedDB. `write` is a plain function parameter and the only seam: the tests pass a fake, and the board passes the real one.

`src/react/usePersistence.ts` mounts it with a 300 ms delay and `writeDocument`, and owns the DOM side:

- **Flush on hide.** `visibilitychange → hidden` and `pagehide` write any pending change at once, so backgrounding or closing the tab inside the debounce window does not drop the last change. This is best-effort: a transaction started during unload is not guaranteed to commit.
- **Flush on unmount**, before disposing, so a pending change is written rather than dropped with the subscription.
- **No max-wait.** Drawing a stroke notifies only on release, so only move-drags produce bursts, and losing an in-progress drag to a crash is acceptable.

Coalescing is necessary, not just tidy, because IndexedDB did not take the write off the main thread. `put()` structured-clones its value **synchronously**, before it returns, and only the commit is asynchronous (ADR-0003's amendment). Measured in Chrome 143, the clone costs about 4.7 ms at 100 strokes, 9 ms at 200 and 18 ms at 400. That is 34–48% less than localStorage's `JSON.stringify` + `setItem` from 100 strokes up, but still more than a 60 Hz frame at 400 strokes (`.claude/plans/m11-findings.md`). The debounce keeps that cost out of the drag.

### Persist status

The persister reports a `PersistStatus`, `ok` or `failing`, decided by the outcome of each write. There is **no retry**: every write is a whole snapshot, so the next coalesced write *is* the retry. Only the newest write's outcome counts, so a slow failure cannot override a later success.

A failed write is logged to the console and sets the status to `failing`. Causes include quota, a transaction abort, eviction, or a closed connection. `CanvasBoard` then shows a persistent "Changes aren't being saved" notice, which clears on the next successful write. Healthy operation shows nothing.

When the load is `unavailable`, the board gets `db: null` and `usePersistence` mounts no persister. **Persisting is off for the session.** The canvas is fully drawable, and a non-dismissible notice says the drawing will be lost when the tab closes. Without the notice, the board would look exactly like one that is saving.

Notices (`src/react/Notice.tsx`) stack at the bottom of the viewport. The stack lets pointer events through, so only a notice's own box is off-limits: the canvas around it stays drawable, and the toolbar is never covered.

### Known limitation: multiple tabs

**Two tabs open on the same document clobber each other, silently.** Each tab loads the document once, at boot, and from then on persists *its own* whole scene. Neither sees the other's changes. Whichever tab writes last wins, and the next reload loads its scene: anything drawn only in the other tab is gone, and neither tab says so.

Getting this right needs cross-tab coordination (a `BroadcastChannel`, Web Locks, or a merge strategy). That is realtime collaboration in miniature, which is out of scope for the project.

`onversionchange` is not multi-tab support. It closes this tab's connection when another tab opens the database at a higher version, so that schema change is never blocked by this one. After that, this tab's writes fail and it shows the "not being saved" notice.

### Diagnostics

The persistence diagnostics are the instruments the measurements come from, exposed on `window.canvasDiagnostics` in a dev build. Most live in `src/core/persistence/diagnostics.ts`. They are deliberately not defensive: they provoke failures rather than preventing them. Named here by their console names, they followed the mechanism:

- **Kept**, because they never depended on the mechanism: the deterministic, seeded synthetic scenes (`makeStressScene`) behind `fill` and `probe`; `measure` (`measureScene`), still in JSON characters so sizes stay comparable with the localStorage measurements; and `fill` (`fillStore`), which appends to the live store one `addElement` at a time, so every append notifies.
- **Retargeted to IndexedDB:**
  - `probe` (`probeWrite`) times one whole-scene write through the real transaction, reporting the synchronous clone and the commit separately. It restores the stored document afterwards. It no longer takes a precision, because rounding was deferred.
  - `corrupt` (`corruptDocument`) overwrites the stored document with one of four values, one per thing validation must catch: `unknown-type`; `wrong-shape` (the old bare array where the envelope belongs); `future-version`; and `duplicate-id`.
  - `clear` deletes the IndexedDB document (`deleteDocument`, from `indexed-db.ts`).
- **New:**
  - `failWrites` (`createWriteFaults`) wraps the write so that it rejects with a `QuotaExceededError` on demand, which travels the same path a real failure would.
  - The dev-only `?indexeddb=off` query parameter (handled in `src/main.tsx`) boots as if the browser had no IndexedDB, which exercises the persisting-off path.
- **Removed:**
  - `ceiling` and `flood` (`findStorageCeiling`, `floodPersist`), which measured localStorage's 5 MiB ceiling.
  - The `malformed` corruption: structured clone has no parse step, so it has no IndexedDB equivalent.

From the devtools console, in a dev build:

| `canvasDiagnostics.…` | does |
|---|---|
| `measure()` | what the current scene costs to store |
| `fill(n, pts?, precision?)` | append n synthetic strokes to the live scene |
| `probe(n, pts?)` | time one whole-scene write of n strokes, clone and commit separately |
| `corrupt(kind)` | overwrite the stored document; reload to see it quarantined |
| `clear()` | delete the stored document; reload to start empty |
| `failWrites(failing?)` | make every write fail, or succeed again, until reload |

No engine path calls into the diagnostics. Their only callers are in React. `src/react/useDiagnostics.ts` attaches them to `window.canvasDiagnostics`. `CanvasBoard` creates the write-fault switch, behind `import.meta.env.DEV`, and `usePersistence` wraps the real write with it only when it exists. Because that guard is statically false in a production build, and the modules have no top-level side effects, the whole harness is tree-shaken out. That is verified by grepping the built bundle, not assumed. Core exposes the instruments; React decides when they exist, the same division as persistence itself.

## File map

```
src/
├── main.tsx / App.tsx           starts loadDocument(), React root → DocumentLoader
├── core/
│   ├── scene/
│   │   ├── types.ts             SceneElement union, Scene (z-order = array order)
│   │   ├── store.ts             createSceneStore — observable scene state; add/insert/replace/remove
│   │   ├── factory.ts           createRectangle/Ellipse/Freehand, normalizeRect, DEFAULT_STYLE
│   │   ├── hit-test.ts          hitTest (back-to-front) + per-type point tests
│   │   ├── bounds.ts            getBoundingBox — world-space bbox per element
│   │   ├── translate.ts         translateElement — offset an element's origin
│   │   ├── resize.ts            fitElement — fit into a (maybe flipped) box; MIN_ELEMENT_SIZE
│   │   └── index.ts             barrel → @core/scene
│   ├── editor/
│   │   ├── store.ts             createEditorStore — observable selection state
│   │   └── index.ts             barrel → @core/editor
│   ├── history/
│   │   ├── history.ts           createHistory — undo/redo stacks of add/replace/remove entries
│   │   └── index.ts             barrel → @core/history
│   ├── persistence/
│   │   ├── format.ts            StoredDocument envelope, FORMAT_VERSION, QuarantineRecord
│   │   ├── indexed-db.ts        openDatabase, read/write/delete/quarantine the document
│   │   ├── validate.ts          validateDocument — all-or-nothing, first error's path
│   │   ├── load.ts              loadDocument — never rejects: loaded / quarantined / unavailable
│   │   ├── persister.ts         createPersister — debounced writes, persist status
│   │   ├── diagnostics.ts       stress scenes, write probe, corruptions, write faults
│   │   └── index.ts             barrel → @core/persistence
│   └── canvas/
│       ├── transform.ts         screenToWorld / worldToScreen / zoomAtPoint
│       ├── viewport.ts          MIN/MAX_SCALE, clampScale, scaleFromWheel
│       ├── grid.ts              drawReferenceGrid
│       ├── render.ts            renderScene / drawElement
│       ├── selection.ts         drawSelectionBox + getHandles / getHandleAt — selection chrome
│       └── index.ts             barrel → @core/canvas
└── react/
    ├── DocumentLoader.tsx       Suspense gate on the load; picks the board's notices
    ├── CanvasBoard.tsx          owns <canvas> + sizing; wires store, history, toolbar, tools, persistence
    ├── usePanZoom.ts            viewport state, wheel input, render loop
    ├── useDrawTool.ts           pointer-drag shape creation; records add
    ├── useSelectTool.ts         click-to-select, drag-to-move, drag-a-handle-to-resize; records replace
    ├── useEditorKeys.ts         editor shortcuts, any tool: delete, undo, redo; selection after both
    ├── usePersistence.ts        mounts the persister, flushes on hide, returns persist status
    ├── useDiagnostics.ts        dev-only window.canvasDiagnostics handle
    ├── pointer.ts               pointerToScreen / pointerToWorld — shared event → point
    ├── Notice.tsx               Notice + NoticeStack — pinned messages that cover only their own box
    └── Toolbar.tsx              tool picker (UI chrome)
```

> This is a learning-project POC built with minimal libraries: raw Canvas 2D (no Fabric/Konva), hand-written transform math (no gl-matrix), and raw storage APIs. See `CLAUDE.md` for build commands and conventions.
