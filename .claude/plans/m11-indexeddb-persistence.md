# M11 — Persistence Pass 2: IndexedDB Migration

**Category: A / B on the roadmap, waived for this milestone.** The roadmap
splits it: the read/write path yours [A], the database open and schema
boilerplate mine [B]. For M11 you asked me to write all of it and explain each step as it
lands, so the learning comes from the walkthrough and the review rather than
from writing it. The waiver applies to M11 only. See `working-style` in project
memory.

**Goal.** Answer all four of M10's failures in one pass. The drawing survives a
reload through IndexedDB. A document this build cannot load is set aside
instead of crashing the app or misbehaving silently. Writes stop costing a
whole scene per `pointermove`. The user always knows when the drawing is not
being saved.

---

## Decisions

Settled in the M11 grilling session. As in M9 and M10, each is a decision, not a
suggestion, and the reasoning is kept because the reasoning is the learning.
The mechanism itself was settled in ADR-0003. These decisions cover everything
ADR-0003 left open.

### The premise

1. **One pass, against the whole list.** The new mechanism, the version
   envelope, validation, quarantine, coalescing and save-status signalling all
   land in this milestone.

   This is what M10 decision 1 set up: refuse to fix anything until all four
   failures are on the table, then fix them once at the seam they share.
   ADR-0003 already rejected "fix only the ceiling, defer validation". Doing the
   mechanism now and the trust boundary later means opening the same code twice,
   and in between it ships an async load path with nothing checking what it
   loads.

### What is stored

2. **One whole-scene record: `{ version: 1, elements }`.** One record in the
   documents object store, under one fixed key, holding the format version and the
   element array. Array order is still z-order.

   A snapshot because the scene already *is* a snapshot. `getScene()` returns
   one referentially stable array, and the store notifies with no description
   of what changed. A per-element layout would need a diff on every write to
   find what changed, plus a separate ordering field to carry z-order, which
   array order gives for free today. It would also need cross-record atomicity,
   so that a reload never sees half a move. None of that buys anything at this
   scale. ADR-0003 chose IndexedDB partly because keyed records *leave room*
   for per-element writes later. Leaving room is not the same as using it now.

3. **The format version starts at 1, and there is no upgrade code yet.**

   The envelope exists so that a newer format can be told apart from
   corruption. M10 finding L3 showed that, without it, the two look the same.
   It starts at 1 because nothing earlier will ever be read: decision 4 drops
   the bare-array format instead of upgrading from it. An *upgrade* function
   has nothing to do until a version 2 exists, so writing one now would be
   speculative. The format version is not IndexedDB's database version. The
   database version tracks object-store layout and moves on its own schedule.
   The glossary keeps the two apart.

4. **Start fresh: no localStorage import.** On every boot the old
   `infinite-canvas:scene` key is removed unconditionally. The localStorage
   persistence module and its test are deleted.

   Importing would mean one last read of the bare-array format: either through
   the trusting cast that M10 showed is unsafe, or through a validator written
   for a format that is being retired. That one-off code would then outlive the
   only boot it ever mattered for. This is a POC with no users. The only
   drawings at stake are test scenes, and M10's diagnostics can regenerate
   those. Removing the key *unconditionally* rather than once means no
   "migration done" flag to persist. Removing an absent key costs nothing, and
   the cleanup cannot get stuck half-done.

### The database

5. **Two object stores. `onupgradeneeded` creates them, and `onversionchange`
   closes the connection.** The `documents` object store holds the document,
   and the `quarantine` object store holds what could not be loaded (decision 9).
   Calling them *object stores*, never bare "stores", keeps the glossary's
   *store* free for the in-memory observable.

   This is the boilerplate side of the IndexedDB API. `onversionchange` matters
   even with one schema version. If a later build opens the database at a
   higher version while this tab holds a connection, that schema change is
   *blocked* until this tab lets go. Closing on `versionchange` means a future
   schema change in another tab never hangs. (*Upgrade* in the glossary's sense
   is a format-version matter. IndexedDB's `onupgradeneeded` is just the API's
   name for a schema change.)

### Loading

6. **The load is asynchronous, but the scene store is still born holding the
   document.** A loader above the board starts the load once, outside render.
   It suspends on the result with React 19's `use()` inside a `<Suspense>`
   boundary. `CanvasBoard` mounts only once the scene is in hand. The fallback
   is a blank page in the canvas background colour, with no "Loading…" label.

   M9 decision 7 traded synchrony for one property: the store is born holding
   the document, so there is no empty-then-populate flash and no "is it loaded
   yet" state anywhere. ADR-0003 said IndexedDB would make that bill come due,
   and expected an empty-then-populate path. The Suspense gate keeps the
   property and pays the bill somewhere else. The "not arrived yet" state does
   exist now, but only *above* the board. No store, hook or tool ever sees it.
   That also settles a race the effect-based alternative would have created:
   with a board that mounts empty, a stroke drawn before the load lands either
   gets clobbered by it or has to be merged into it. Here no stroke can be
   drawn before the document arrives.

   Starting the load outside render is what makes it run once. React 19
   StrictMode double-invokes render-phase code and double-mounts effects.
   A load kicked off from either place runs twice in dev. The fallback has no
   label because a local load is fast: a label that flashes for a few frames is
   worse than a blank page that just becomes the canvas.

7. **Validation is all-or-nothing.** One bad element rejects the whole
   document. A load never keeps some elements and drops others. The validator
   is pure, lives in `core/`, and reports the *first* error's path (for example
   `elements[37].type`).

   - **Envelope:** `version === 1`, and `elements` is an array. A *newer*
     format version means "not understood" rather than "corrupt". It ends up in
     the same place, but its reason is recorded separately.
   - **Every element:** `id` is a non-empty string, **unique across the
     scene**. `type` is one of the three known types. `x`/`y` are finite.
   - **Rectangle/ellipse:** finite `width`/`height` ≥ 0.
   - **Freehand:** a `points` array of ≥ 1 finite `{x, y}`.
   - **Style:** string colours and a finite `strokeWidth` ≥ 0.
   - Unknown extra fields are ignored. Colours are not parsed as CSS.

   Every check traces back to a failure that is either measured or reasoned
   out. An unknown `type` is M10 finding L2: the `never` guards are
   compile-time only, so at runtime the element is invisible and hit-tests true
   everywhere. Non-finite geometry breaks bounds, hit-testing and drawing the
   same quiet way. Uniqueness is there because selection is held by identity
   and `replaceElement` finds its target by id. Two elements sharing an id make
   both of them wrong.

   The two leniencies are deliberate. Rejecting unknown fields would make the
   validator brittle against harmless additions. A change that actually alters
   meaning bumps the format version, which is the envelope's job. CSS colour
   parsing needs the DOM, which `core/` does without and the Node test
   environment does not have (ADR-0001). A bad colour also fails soft: the
   canvas ignores an invalid colour string and keeps drawing.

   All-or-nothing is decided in ADR-0004, alongside quarantine: per-element
   salvage is one of its rejected options.

8. **The load never rejects.** Every way a load can go wrong resolves to a known
   outcome: loaded, quarantined, or storage unavailable. None of them throws.
   So `use()` never throws into render, and the load path still needs no error
   boundary.

   ADR-0003 deferred the error boundary to "what the user sees when the
   document will not load". Decisions 9 and 10 answer that question, and the
   answer never involves an error reaching React.

9. **A document that cannot be loaded is quarantined, never overwritten.**
   The app starts with an empty scene, keeps persisting normally, and shows a
   dismissible notice. ADR-0004 holds the decision, its rejected options and
   the shape of a quarantine record. It is not repeated here, so it changes in
   one place.

10. **If IndexedDB will not open at all, saving is off for the session.** This
    covers IndexedDB being unavailable, the open being blocked, or a security
    error. The app still mounts, with an empty and drawable scene, and a notice
    says the drawing is not being saved.

    There is no database to quarantine into, so the one move ADR-0004 rejects
    for the load-failure case, a session that does not write, is the only
    honest one left here. The canvas still works. What the user must not get is
    M10 finding Q3 again: a canvas that looks like it is saving and is not.

### Writing

11. **Uncoalesced first, then coalesced.** The tracer bullet persists on every
    store notification, exactly as M9 did, and coalescing follows as its own
    step.

    That ordering keeps each step's change visible. The mechanism swap is
    verified end to end against the write pattern M10 measured, and *then* the
    write pattern changes. It also gives the persister a working write function
    to wrap, instead of designing both at once.

12. **A core persister with a trailing debounce of about 300 ms, flushed on
    hide, and no max-wait.** `createPersister(store, write, { delay })`
    subscribes to the scene store and writes the latest scene `delay` after the
    *last* notification. It flushes immediately on `visibilitychange → hidden`
    and on `pagehide`. It can be disposed (unsubscribe and clear the timer).
    The board mounts it in place of the raw subscriber. The timing logic is
    pure and unit-tested in Node with fake timers.

    Coalescing is still needed after the move, and the reason changed:
    `put()` structured-clones its value synchronously (see the ADR-0003
    amendment). So an uncoalesced write still costs O(scene) main-thread work
    per notification, and a drag notifies on every `pointermove` (ADR-0002).
    Trailing debounce rather than rAF-coalescing, because writing once per
    frame during a drag still writes about sixty whole scenes a second.

    The flush exists because closing or backgrounding the tab inside the
    debounce window would otherwise drop the last change. It is best-effort: a
    transaction started during unload is not guaranteed to commit.

    No max-wait, because the only notification bursts are move-drags. Drawing a
    stroke never notifies: the draft is not committed until release. A
    max-wait would bound the loss from a crash *mid-drag*, and losing an
    in-progress drag to a crash is acceptable.

13. **No `Persistence` interface.** `write` is a plain function parameter of the
    persister, and that is the only seam.

    M9 decision 1 refused to invent an interface before a second implementation
    existed. M11 is the second implementation, but it *replaces* the first
    instead of sitting beside it (decision 4), so there is still exactly one at
    any time. An interface with one implementation is the speculative
    generality M9 set out to teach against. A function type is already a seam:
    the persister's tests pass a fake `write`, and the board passes the real
    one. Nothing else needs to vary.

14. **No retry logic. A write failure shows a persistent indicator instead.**
    When a write fails (quota, transaction abort, eviction), a persistent
    "Changes aren't being saved" indicator appears and the error goes to the
    console. The indicator clears on the next successful write. It hangs off
    the persister's write outcome.

    Every write is a full snapshot, so the next coalesced write *is* the retry,
    and a retry loop would only write the same scene again sooner. The
    indicator answers M10's worst finding, Q3. Once storage started failing,
    every later write failed too, and nothing in the app noticed. Neither this
    indicator nor the decision 10 notice may block drawing or the toolbar.

### Scope

15. **Multiple tabs are out of scope, and documented as a known limitation.**
    With two tabs open on the same document, the last writer wins and each tab
    silently clobbers the other.

    Getting it right means cross-tab coordination (a `BroadcastChannel`, Web
    Locks, or a merge strategy). That is a collaboration problem in miniature,
    and realtime collab is out of scope for the project. `onversionchange`
    (decision 5) is not multi-tab support: it only stops a schema change from
    hanging. The limitation is written down in `ARCHITECTURE.md`, so that it is
    a known property instead of a surprise.

16. **Coordinate rounding is deferred.** M10 finding S2 showed it roughly
    halves the stored size, and ADR-0003 called it "worth doing regardless".
    That argument was capacity under localStorage's 5 MiB ceiling, which no
    longer applies. ADR-0003's amendment strikes the claim. Rounding is lossy,
    so it would need a new argument. It comes back only if the measurement
    (decision 18) turns one up.

17. **Diagnostics follow the mechanism.** The instruments that only made sense
    against localStorage (`ceiling`, `flood`) are removed. `probe` and
    `corrupt` are removed with the localStorage module and come back as
    IndexedDB versions. `clear` is retargeted to IndexedDB. The
    mechanism-agnostic instruments (the stress scene, `measure`, `fill`) are
    kept. ADR-0003's last consequence called the generator and the cost
    measurements mechanism-agnostic and only `findStorageCeiling` specific to
    localStorage. `flood`, `probe` and `corrupt` go further than it predicted,
    because each one drives `setItem` directly.

    `corrupt(kind)` comes back with four kinds, one per thing the validator and
    quarantine must catch: `unknown-type` (L2), `wrong-shape` (a bare array
    where the envelope belongs, which is the old format), `future-version` (a
    valid envelope at `version: 2`), and `duplicate-id`. Note that `wrong-shape`
    swaps meaning from M10. There it was an envelope where the bare array
    belonged. Here it is the reverse, because the expected shape flipped. The
    lesson is the same: the container is wrong. M10's `malformed` does
    not come back. Structured clone has no parse step, so finding L1's failure
    has no IndexedDB equivalent. A stored string is just another wrong shape.

18. **ADR-0003's central claim is measured, not assumed.**
    `probe(elements, pointsPerElement?)` re-runs M10's W2 measurement against
    IndexedDB and times two parts separately: the synchronous part of `put()`
    (the structured clone, which is the main-thread time a frame pays) and the
    time to transaction `complete`. It runs in Chrome at 10 / 50 / 100 / 200 /
    400 strokes of 250 points, median of five, over two independent sessions,
    as M10 did. It restores the live document afterwards (M10 decision 11).

    The results go in `m11-findings.md`, compared side by side with W2. The
    method section records the browser version and the exact commands, so the
    run can be reproduced from the repo alone. The findings state plainly
    whether the synchronous cost is lower than W2's, and by how much. If they
    contradict ADR-0003 beyond the amendment already made, the findings say so
    and flag it. The ADR is not quietly edited to match.

### Vocabulary

19. **Five terms in the glossary.** *Persist* and *store* keep M9's
    meanings: *persist* is the write verb, and *store* always means the
    in-memory observable, never the persisted copy. That is why IndexedDB's
    containers are always *object stores* (decision 5). M11 adds three terms
    to `CONTEXT.md`:

    - *format version*: the version of the stored shape. It is not the
      database version.
    - *upgrade*: turning an older format version into the current one.
    - *quarantine*: where a document that cannot be loaded is set aside, whole.

    *Migration* is reserved for moving from one storage mechanism to another.
    That is what this milestone's title means by it. It is a one-off project
    event, not something the code does, so no identifier should be named after
    it.

---

## Non-goals

- Importing existing localStorage drawings (decision 4).
- An *upgrade* function, or any format version other than 1 (decision 3).
- Per-element records, incremental writes, or multiple documents (decision 2).
- A `Persistence` interface or pluggable storage (decision 13).
- Multi-tab coordination: `BroadcastChannel`, Web Locks, merging (decision 15).
- Coordinate rounding (decision 16).
- A UI to inspect, restore or delete quarantined documents (decision 9).
- Retry or backoff on failed writes (decision 14).
- A max-wait on the debounce (decision 12).
- Persisting the viewport, the tool or the selection. M9 decision 2 stands.

---

## Build order

One GitHub issue per step. Each step ends with **stop and explain**.

| # | Issue | What | Blocked by |
|---|---|---|---|
| 1 | #1 | This plan, ADR-0004, the ADR-0003 amendment | — |
| 2 | #2 | Tracer bullet: the drawing survives a reload through IndexedDB (decisions 2–6, 11, 17) | — |
| 3 | #3 | Validation and quarantine, with the notice (decisions 7–9, 17) | #2 |
| 4 | #4 | The coalescing persister and flush-on-hide (decision 12) | #2 |
| 5 | #5 | Signalling write failures, and persisting off when IndexedDB will not open (decisions 10, 14) | #4 |
| 6 | #6 | Measure IndexedDB write cost against M10's W2 (decision 18) | #2 |
| 7 | #7 | Close out in `ARCHITECTURE.md` and the roadmap | #1, #3, #5, #6 |

---

## Tests (colocated, node env — see ADR-0001)

The Node environment has no IndexedDB, and the project uses the raw API with no
wrapper or shim (`library-constraints` in project memory). So the tests cover
the pure parts, and everything that touches IndexedDB is verified in the
browser, step by step, against each issue's acceptance criteria.

- **The validator.** Every check in decision 7, including uniqueness and the
  newer-version case, which must report `unknown-format-version` and not
  `invalid`. Plus one valid document of each element type. The first error's
  path is asserted exactly.
- **The persister**, with fake timers and a fake `write`:
  - a burst of notifications produces one write of the latest scene
  - the write fires `delay` after the *last* notification
  - a flush writes immediately and cancels the pending timer
  - a flush with nothing pending writes nothing
  - dispose stops further writes

---

## Docs

- `.claude/plans/m11-indexeddb-persistence.md`: this file.
- `docs/adr/0004-quarantine-unloadable-documents.md`: new (decision 9).
- `docs/adr/0003-indexeddb-for-scene-persistence.md`: a dated amendment at the
  end. The decision stands and the original text is not rewritten.
- `CONTEXT.md`: *format version*, *upgrade* and *quarantine* (decision 19).
- `.claude/plans/m11-findings.md`: the measurements (decision 18).
- `ARCHITECTURE.md`: rewritten Persistence section, the multi-tab limitation,
  and the diagnostics and file map, at close-out (#7).
- `.claude/plans/README.md`: M11 in progress now, done at close-out.
