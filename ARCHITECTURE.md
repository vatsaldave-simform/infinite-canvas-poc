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
5. the **selection highlight**, if an element is selected — a dashed box around its bounding box (`drawSelectionBox`), editor chrome drawn over the scene.
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
- `replaceElement(next)` swaps the element with `next.id` for `next`, keeping
  its **array index** — a move must never change z-order. An unknown id is a
  no-op that returns the *same* array, so the snapshot stays stable.
- `subscribe(fn)` registers a listener, returns an unsubscribe.

Nothing binds the store through `useSyncExternalStore`: `usePanZoom` subscribes directly and copies each snapshot into a ref, repainting through rAF, so committing a shape never re-renders `CanvasBoard` or the toolbar. The stability contract documented in `store.ts` is what *would* make `useSyncExternalStore` safe if a component ever needs to read the scene during render. Immutable updates + stable snapshots are what make change-detection cheap and keep the door open for undo later.

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
drag arms, `default` otherwise; hover hit-testing is skipped while dragging.

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
See `docs/adr/0002-drag-commits-live-to-the-scene-store.md`; note its
consequence for M13 (history is captured per *gesture*, not per mutation).

`src/core/scene/translate.ts` holds the geometry: `translateElement(el, delta)`
returns a new element offset by `delta`. It needs no per-type `switch` — every
element carries `x`/`y` on `BaseElement`, and freehand `points` are relative to
that origin, so moving the origin moves the whole stroke.

## Creating elements

`src/core/scene/factory.ts` turns raw input into well-formed elements: assigns an `id` (`crypto.randomUUID()`), applies `DEFAULT_STYLE`, and **normalizes geometry**. `createRectangle` / `createEllipse` convert two drag corners to a non-negative origin + size (`normalizeRect`); `createFreehand` converts a run of absolute world points into an origin + relative offsets (`freehandGeometry`). The types permit signed width/height mid-drag; normalization happens here at creation time.

Draw flow (`useDrawTool`): the toolbar picks a tool (`rectangle` / `ellipse` / `freehand`, plus `select` — see *Selection & editor state*). Rectangle and ellipse are two-corner drags (`pointerdown` start → `pointermove` resize); freehand captures a point per `pointermove`. Either way a *draft* element is kept in a ref and painted on top; `pointerup` finalizes via the factory and commits with `store.addElement`. Tiny drags / too-few points are ignored (no zero-size shapes).

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
│   │   ├── store.ts             createSceneStore — observable scene state
│   │   ├── factory.ts           createRectangle/Ellipse/Freehand, normalizeRect, DEFAULT_STYLE
│   │   ├── hit-test.ts          hitTest (back-to-front) + per-type point tests
│   │   ├── bounds.ts            getBoundingBox — world-space bbox per element
│   │   ├── translate.ts         translateElement — offset an element's origin
│   │   └── index.ts             barrel → @core/scene
│   ├── editor/
│   │   ├── store.ts             createEditorStore — observable selection state
│   │   └── index.ts             barrel → @core/editor
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
│       ├── selection.ts         drawSelectionBox — selection highlight chrome
│       └── index.ts             barrel → @core/canvas
└── react/
    ├── DocumentLoader.tsx       Suspense gate on the load; picks the board's notices
    ├── CanvasBoard.tsx          owns <canvas> + sizing; wires store, toolbar, tools, persistence
    ├── usePanZoom.ts            viewport state, wheel input, render loop
    ├── useDrawTool.ts           pointer-drag shape creation
    ├── useSelectTool.ts         click-to-select + drag-to-move
    ├── usePersistence.ts        mounts the persister, flushes on hide, returns persist status
    ├── useDiagnostics.ts        dev-only window.canvasDiagnostics handle
    ├── pointer.ts               pointerToWorld — shared event → world point
    ├── Notice.tsx               Notice + NoticeStack — pinned messages that cover only their own box
    └── Toolbar.tsx              tool picker (UI chrome)
```

> This is a learning-project POC built with minimal libraries: raw Canvas 2D (no Fabric/Konva), hand-written transform math (no gl-matrix), and raw storage APIs. See `CLAUDE.md` for build commands and conventions.
