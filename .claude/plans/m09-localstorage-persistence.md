# M9 — Persistence Pass 1: localStorage

**Category: B.** I write it, you review. Unusually for this project there is no
category-A slot: after decision 1 below, the whole milestone is `JSON.stringify`,
`JSON.parse`, one `setItem`, one `getItem`, a store seed and a four-line
subscribe effect. There is no geometry, no state machine and no invariant to
discover — nothing shaped like M2's transform math or M8's drag machine. The
hands-on learning is deliberately back-loaded into M10 (diagnosis) and M11 (the
migration). See `working-style` in project memory.

**Goal.** The drawing survives a page reload. Nothing else.

---

## Decisions

Settled in the M9 grilling session. Each is a decision, not a suggestion; the
reasoning is kept because the reasoning is the learning.

### The premise

1. **Naive on purpose.** One key, one JSON blob, synchronous, no abstraction
   seam, no schema version, no validation, no error handling. Every weakness is
   left standing.

   This is the root decision and most of what follows is downstream of it.
   Persistence gets three milestones: build it (M9), **break** it (M10),
   migrate it (M11). Shipping a `Persistence` interface, a version envelope,
   quota handling and debounced writes in M9 would leave M10 with nothing to
   break and reduce M11 to an adapter swap — paying for the lessons without
   learning them. A future reader should read the omissions below as
   load-bearing, not as oversight.

   Rejected variants: *engineered now* (define the seam and the schema envelope
   up front, break it from within in M10); *naive core, one seam* (naive
   internals behind two functions). The second is tempting and nearly what we
   have anyway — two functions in a module **is** the seam. The point is not to
   avoid the seam, it is to avoid inventing an *interface* before a second
   implementation exists, which is exactly the speculative generality M11 is
   designed to teach.

### What is persisted

2. **The scene, and nothing else.** Not the viewport, not editor state.

   `CONTEXT.md` already pre-decided half of this: the **Scene** is "the document
   state: the thing that gets persisted", and editor state is explicitly not
   persisted. The viewport is the open question, and it is a third category —
   neither document nor editor state — so persisting it would need a new term
   and a new home. Two further reasons to leave it: reloading at world origin
   with `scale: 1` is *useful* while debugging persistence, because elements
   reappearing at the right world coordinates is then directly visible rather
   than flattered by a restored camera; and the viewport lives in a `useRef`
   inside `usePanZoom` with no observable or subscribe path, so persisting it
   means inventing a save trigger for it too. If we want it later it is a
   separate key and a separate concern, never a bigger blob.

3. **A bare JSON array under one key, `infinite-canvas:scene`.**
   `JSON.stringify(scene)` → `[{…},{…}]`. No envelope object.

   Bare array because the scene *is* an array and z-order *is* its ordering —
   the JSON should say that and nothing more. An envelope (`{ elements: […] }`)
   is only worth its ceremony as a home for a `version` field, which decision 1
   ruled out. Colon-namespaced key so devtools stays legible and M11 can add its
   own keys without collision.

4. **An empty scene writes `"[]"`,** it does not `removeItem`.
   "Deleted everything" and "never drawn" produce identical behaviour today, and
   with no version field there is no way to tell them apart anyway — so a branch
   distinguishing them buys nothing. A key that always exists is also easier to
   inspect, and easier to corrupt on purpose in M10.

### Reading it back

5. **Trust and cast: `JSON.parse(raw) as Scene`, no `try`/`catch`.**

   Because of decision 7, load runs inside the `useState` initializer — during
   render. Malformed JSON therefore throws during render, and with no error
   boundary in `main.tsx` that is a white screen on *every* reload until the key
   is cleared by hand. Accepted knowingly: the failure is total, immediate, and
   one console line from recovery (`localStorage.clear()`), which is the ideal
   shape for a deliberate trap. It also makes M10's opening experiments cheap
   and sharp:

   - paste `}{` into the key, reload → throws during render. A `try`/`catch`
     fallback to an empty scene would make this experiment produce **nothing
     observable**.
   - paste `[{"type":"triangle"}]` → valid JSON, invalid scene. Sails through
     the cast without a murmur and dies later inside the render loop's `switch`,
     far from the cause.

   That gap between "invalid JSON" and "valid JSON, invalid scene" is the whole
   lesson, and structural validation in M9 would pre-empt it.

6. **No user-facing Clear.** One console line clears the key. A Clear button is
   a *document mutation* affordance, which is M12 (Resize + Delete) territory
   where it belongs beside Delete — not smuggled in as a persistence
   side-effect.

### Wiring

7. **The store is seeded at construction:**
   `useState(() => createSceneStore(loadScene()))`.

   `createSceneStore(initial?: Scene)` already accepts a seed, so this needs no
   new store API. The store is born holding the document: no empty-then-populate
   flash, no "is it loaded yet" state anywhere. Rejected: load in an effect after
   mount.

   **This choice cannot survive M11, and that is the point.** It hard-codes the
   assumption that loading is *synchronous* — true of localStorage, false of
   IndexedDB. M11 will have to tear it out and introduce the async
   empty-then-populate path. That is the milestone where the assumption gets its
   bill.

   Note: React 19 StrictMode double-invokes `useState` initializers, so
   `loadScene()` runs twice on mount. Harmless for a pure read, but expect to
   see it if you log.

8. **Persist on every store notification, uncoalesced.**
   `store.subscribe(() => persistScene(store.getScene()))`.

   Per ADR-0002 a single drag commits live to the store, so this is ~200
   synchronous `JSON.stringify` + `setItem` pairs per drag gesture. Genuinely
   bad at scale and completely fine at five shapes — which is exactly the shape
   of M10's lesson: *the naive thing works until it doesn't*, and you get to
   feel the cliff with a few thousand freehand points stringified on every
   `pointermove`. rAF-coalescing or a 300 ms debounce would defuse that.

   Persisting on `pointerup` instead was rejected as a different thing
   altogether: it is not a perf optimisation but a different model of when the
   document is stable, and it pre-empts an M13 (undo) decision that ADR-0002
   already flagged.

   StrictMode also double-mounts the effect, so two subscribers write per
   notification. Idempotent, so harmless; it does double the cost in dev.

9. **React owns the "when"; core owns the two functions.**
   `core/persistence` exports `loadScene()` and `persistScene(scene)`, depending
   on the `Scene` *type* only — it never learns that a `SceneStore` exists.
   `CanvasBoard` calls load in the store initializer and subscribes in an
   effect.

   `core/` is allowed standard browser APIs, so `localStorage` in core is legal;
   the question was only how much core knows. React already owns every other
   *when* in this app — pointer events, rAF scheduling, resize — so persistence
   being the exception would be the surprising thing. Rejected alternatives:
   *core self-wires* (`persistScene(store)` subscribing internally, react
   calling it once for the cleanup) — tidy, but it hides the trigger, and the
   trigger is what M10 interrogates; *decorator store*
   (`createPersistentSceneStore()` wrapping `createSceneStore`) — rejected
   firmly: every future store feature would have to choose between the plain and
   the persistent variant, and it buries a synchronous `setItem` inside
   `addElement`, which is precisely the cost M10 needs to be able to see.

### Layout & naming

10. **`src/core/persistence/local-storage.ts`** plus an `index.ts` barrel,
    matching `scene/`'s one-concern-per-file rhythm. (The directory already
    exists, holding only a `.gitkeep`.)

    Named after the *mechanism*, not the action, because M11's whole premise is
    that the mechanism changes while the action does not: `local-storage.ts` and
    `indexed-db.ts` side by side tell that story at a glance, where a
    `persist-scene.ts` would have to be either edited in place — losing the
    comparison — or renamed.

11. **`persistScene(scene)` / `loadScene()`.** Not `saveScene`: decision 14
    reserves *persist* as the write verb, and `saveScene` would be the one
    identifier in the codebase violating a rule we are writing down in the same
    milestone. *Load* is unaffected — "persist" describes only the write
    direction.

12. **A short header comment in `local-storage.ts` marking the naivety as
    intentional.** This is what a code reader actually encounters, and decision
    1 is invisible from the code. Short, and no milestone number, per the
    project's comment convention.

13. **No ADR.** Against the three-part test: *surprising without context* — yes,
    strongly; *result of a real trade-off* — yes; *hard to reverse* — **no**,
    deliberately the opposite, and that is the load-bearing criterion. An ADR
    whose content is "we did the obvious thing first, on purpose" is noise in a
    directory that should hold hard-won decisions, and its surprising parts get
    reversed within two milestones — stale before it is interesting. M10 and M11
    will produce the ADRs that matter (why IndexedDB; what validation on load
    should be), and the naivety gets explained there as the starting position.

### Vocabulary

14. **"Store" means the in-memory observable, always.** M9 introduces a
    collision: this codebase says *store* for the observable (`SceneStore`,
    `EditorStore`) while the web platform says *storage* for the persisted copy,
    and "save it to the store" is ambiguous between them. The persisted copy is
    never called a store. The write verb standardises on **persist**; *save*
    stays informal speech and does not name code.

15. **No new noun for the serialized form.** `snapshot` is already taken by
    `getScene()`'s referentially-stable array and must not be reused for the
    JSON. And with decision 3's bare array there is no distinct object to name —
    it is "the scene, as JSON". A term with no referent is glossary clutter.
    Instead `CONTEXT.md` gains a **Persistence** section naming the one-way
    relationship and what is excluded from it.

---

## Non-goals

Everything below is either a later milestone or out of scope for the project.
None of it is forgotten; several are omitted *so that* M10 has something to find.

- Schema version field, migration logic, structural validation on load,
  `try`/`catch` recovery, quota (`QuotaExceededError`) handling, coordinate
  rounding to shrink freehand payloads — all M10/M11.
- A `Persistence` interface or storage injection. M11 decides what the seam
  looks like, once there are two implementations to compare.
- Persisting the viewport, the active tool, or the selection.
- Multi-document / named files, export, autosave indicators, "unsaved changes"
  UI, cross-tab sync (`storage` events).

---

## Build order

Small milestone; two steps and a review. Each step ends with **stop and wait**.

| # | What | Who | Notes |
|---|---|---|---|
| 1 | `CONTEXT.md` — **Persistence** section (decisions 14, 15) | me | Vocabulary first: it is used by everything below, and it is the one artefact that outlives the code. |
| 2 | `core/persistence/local-storage.ts` + `index.ts` + `local-storage.test.ts` | me | Pure module, testable with a faked global before any wiring exists. |
| 3 | Review | you | |
| 4 | Wire `CanvasBoard`: seed the store, subscribe to persist | me | Four lines plus an effect. Verify by drawing and reloading. |
| 5 | Review, then `ARCHITECTURE.md` + roadmap status | you / me | Docs that describe code land after the code. |

---

## Tests (colocated, node env — see ADR-0001)

`src/core/persistence/local-storage.test.ts`

The node environment has **no `localStorage` global** — Node exposes one only
behind `--experimental-webstorage` — so the test installs a ~10-line in-memory
`Storage` on `globalThis` in a `beforeEach`. Chosen over injecting the storage as
a parameter (`persistScene(scene, storage = localStorage)`): a default parameter
is a seam, and pre-building M11's abstraction cuts against decision 1. The
production call site stays naive.

- **round trip** — all three element types survive persist → load, freehand's
  relative `points` especially.
- **array order survives** — z-order is the document's only implicit structure.
  JSON preserves it, so this is nearly free to assert; if it ever stopped being
  true the symptom (shapes silently restacking on reload) would be catastrophic
  and slow to notice.
- **absent key → empty scene.**
- **empty scene persists as `"[]"`** (decision 4), asserted on the stored string.

Explicitly **not** tested: malformed JSON. Decision 5 chose to let it throw, and
a test asserting that throw would cement a behaviour M10 exists to change.

---

## Docs

- `CONTEXT.md` — **Persistence** section (step 1). ✅
- `ARCHITECTURE.md` — new persistence section, and **fix the existing drift in
  the same commit**: it cites `src/react/useSceneStore.ts` as the
  `useSyncExternalStore` binding, but no such file exists (`usePanZoom`
  subscribes directly, and M8's split left `useSelectTool`/`useDrawTool` doing
  their own). One line, in a file being edited anyway — adding a truthful
  section directly beneath a false one is worse than either fixing or leaving
  it. A broader file-map audit is deliberately out of scope. ✅
- `.claude/plans/README.md` — status row. ✅
- No ADR (decision 13).
