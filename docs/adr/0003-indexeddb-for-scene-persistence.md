# IndexedDB for scene persistence

The scene moves from `localStorage` to IndexedDB, and gains a version envelope
and validation on load at the same time. The decision rests on measurements
taken against the localStorage implementation, not on reputation: the raw
numbers are in `.claude/plans/m10-findings.md`, the reasoning in
`.claude/plans/m10-break-localstorage.md`.

Four failures were provoked and measured (Chrome 143, headless).

**The ceiling is small, shared, and reached by ordinary use.** The quota is
5 MiB per *origin*, charged in UTF-16 characters of key plus value — confirmed
by binary search, which accepted 5,242,851 characters under a 29-character key.
Splitting across keys buys nothing. A 250-point freehand stroke costs 12,147
characters at the precision pointer events actually produce, so the budget holds
**431 strokes**: an afternoon of sketching, not an attack.

**Exceeding it loses data silently, with a delayed and misattributed symptom.**
Past the ceiling, `setItem` throws, the in-memory document keeps growing, the
canvas keeps working, and the stored copy freezes — permanently, because every
later write fails too. Drawing continues into a document that stopped saving,
and the loss only becomes visible on the next reload. Nothing in the app
notices, and the throw escapes `store.addElement`, which is what a `pointermove`
handler calls.

**A single whole-scene write outgrows the frame budget.** Persisting on every
store notification (ADR-0002 commits drags live) means one complete
`JSON.stringify` + `setItem` per `pointermove`: 7–8 ms at 100 strokes, 15–17 ms
at 200, 31–34 ms at 400 — synchronously, on the thread that paints. At 200
strokes the write alone consumes a whole 60 Hz frame before any drawing
happens.

**The load path trusts whatever it finds.** A value that is not JSON throws
during render and takes the whole app down with no route to recovery. A value
that *is* JSON is cast to `Scene` unchecked, and the two ways that goes wrong
are both silent: an unrecognised element type renders as nothing while
hit-testing true at every point on the canvas (the `never` exhaustiveness guards
are compile-time constructs — at runtime they return the element, which is
truthy), and an envelope-shaped value breaks the render loop every frame while
the app still looks alive. With no version field, that last case is
indistinguishable from corruption — yet it is exactly what a future version of
this app would legitimately write.

## Considered Options

- **Keep localStorage, add quota handling, debouncing and validation** —
  rejected, and it is the option worth taking seriously, because it answers
  three of the four failures. It does not answer the ceiling. Debouncing makes
  a 34 ms synchronous main-thread write *rarer*, not cheaper and not
  asynchronous, and no amount of error handling creates room that a 5 MiB
  per-origin budget does not have. Coordinate rounding roughly doubles the
  capacity (24.2 characters per point instead of 47.9) and is worth doing
  regardless — but doubling the distance to a wall an afternoon's drawing
  reaches is not a solution, it is a delay. Choosing this would mean writing the
  quota-handling code, the recovery UI and the validation, and then still
  migrating.
- **The Cache API or the Origin Private File System** — rejected. Both clear the
  ceiling and both are asynchronous, so neither is obviously wrong. They are
  wrong *here*: the document is structured data that will want per-element
  access, keys and eventually multiple documents, and both of these store opaque
  blobs, so the whole scene would still be read and rewritten as one unit. That
  is the shape this milestone is trying to leave behind, and OPFS in particular
  brings worker and sync-access-handle machinery that a POC has no use for.
- **A server** — out of scope for the project by decision; there is no backend.
- **Fix only the ceiling, defer validation to a later milestone** — rejected.
  Three of the four failures are the same missing seam, and the migration
  touches exactly that seam. Doing the mechanism now and the trust boundary
  later means opening the same code twice and shipping a version that has an
  async load path with nothing checking what it loads — which is the current bug
  with more moving parts.

IndexedDB is chosen for what it does *not* impose: no practical size ceiling at
this scale, structured-clone storage rather than strings (so no
`JSON.stringify` on the main thread per write), asynchronous writes that do not
block painting, and keyed records that leave room for per-element writes and
multiple documents later without another migration. The cost is a genuinely
unpleasant API — `onupgradeneeded`, request events, transaction lifetimes — for
a POC holding a handful of shapes. That cost is accepted knowingly, and it is
why this ADR exists rather than a line in a plan file.

## Consequences

**The synchronous load assumption has to be torn out.** The store is currently
seeded during render — `useState(() => createSceneStore(loadScene()))` — which
hard-codes that loading is synchronous. IndexedDB makes it a promise, so the
app gains an empty-then-populate path and, for the first time, a state in which
the document has not arrived yet. M9 chose the synchronous seed knowing this
bill would come due; this is it.

**Validation on load is no longer optional, and gets its own decision.** Every
value crossing back into the app is untrusted, and findings L2 and L3 show the
cast is not merely unsafe but *silently* unsafe. What validation to perform, how
strictly to reject, and what the user sees when a document will not load are
open questions — deliberately not settled here, because the answer wants the
envelope's shape in front of it.

**A version envelope replaces the bare array.** M9 stored the scene as a bare
JSON array on the grounds that an envelope is only worth its ceremony as a home
for a `version` field. That reasoning is unchanged; the conclusion flips,
because there is now a second format and no way to tell it from corruption.

**Write coalescing is still needed, and is now a separate concern.** Moving off
the main thread removes the frame-budget cost of a write; it does not make one
write per `pointermove` sensible. rAF-coalescing or a debounce is still wanted —
but as an efficiency measure, not as the fix for a correctness problem, which is
the distinction W3 in the findings exists to draw.

**The diagnostics harness outlives this decision.** `core/persistence/diagnostics.ts`
was built to break localStorage, but the scene generator and the cost
measurements are mechanism-agnostic and become the instrument that shows whether
the replacement is actually better. The corruption helpers stay useful for
exercising validation. `findStorageCeiling` is the one part that is specific to
the thing being replaced.

**No error boundary is added.** Tempting after L1, and a one-line change — but
what the user sees when the document will not load is a persistence decision,
and it belongs with the validation decision above rather than ahead of it.

## Amendment — 2026-10-01

The decision stands. Two claims in the reasoning above are corrected here
rather than rewritten, so the original argument stays readable as it was made.

**Serialisation does not leave the main thread.** The case for IndexedDB above
promises "no `JSON.stringify` on the main thread per write" and "asynchronous
writes that do not block painting". Both overstate it. `put()` structured-clones
its value **synchronously, on the calling thread**, before it returns. Only the
commit is asynchronous. So a whole-scene write still costs O(scene) work on the
thread that paints: the serialisation changes from `JSON.stringify` to
structured clone, but it does not move off the thread. The same correction
applies to "moving off the main thread removes the frame-budget cost of a
write", under the coalescing consequence. Coalescing is still needed for the
reason it was needed before: it bounds that synchronous cost. Whether
structured clone is cheaper than `JSON.stringify` + `setItem` is measured
against M10's W2 in `.claude/plans/m11-findings.md`, not assumed.

**"Coordinate rounding is worth doing regardless" is struck.** The argument
for it was capacity under localStorage's 5 MiB per-origin ceiling, and that
ceiling no longer applies. Rounding is lossy, so without a capacity argument
it has none left. It is deferred. See decision 16 of
`.claude/plans/m11-indexeddb-persistence.md`.
