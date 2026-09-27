# M10 — Deliberately Break localStorage

**Category: discuss / A**, run solo this time at your request ("m10 by yourself"),
so I wrote the harness and ran the experiments rather than handing you the
interfaces. The reasoning below is the deliverable you would otherwise have
produced at the whiteboard; read it as the transcript of that discussion.

**Goal.** Make M9's four latent failures *reproducible on demand*, measure what
they actually cost, and let the evidence pick M11's mechanism. **Fix nothing.**

---

## Decisions

### The premise

1. **Break it, measure it, fix nothing.** No `try`/`catch`, no validation, no
   schema version, no quota handling, no coalescing lands in this milestone.
   `local-storage.ts` is not edited at all.

   A fix applied at the moment of discovery is a fix chosen while you still only
   know about one failure. There are four here, and three of them (quota,
   unparseable value, unrecognised shape) want the *same* remedy applied at the
   same seam — which you can only see once all four are on the table. So M10's
   product is a reproducible failure plus a number, and one ADR. The repairs are
   M11's, chosen once, against the whole list.

   This is also the direct payoff of M9 decision 1. Every omission that plan
   recorded as "load-bearing" gets to bear its load here.

2. **The findings are evidence, not anecdote.** Every claim in the write-up is
   either a measured number (recorded below, with how it was produced) or an
   observed failure. Nothing is asserted from memory about what browsers do —
   the quota ceiling in particular is *probed at runtime*, and it earned that
   treatment: the units this plan was drafted with turned out to be wrong by a
   factor of two, and the probe is what caught it (see finding Q1).

### How the failures get provoked

3. **A diagnostics module, because you cannot hand-draw five megabytes.**
   `src/core/persistence/diagnostics.ts` generates synthetic scenes, measures
   what a scene costs in storage, drives the real write path until it throws,
   and corrupts the stored value in three specific ways.

   Rejected: doing it by hand in the devtools console. Pasting a `for` loop into
   the console each time makes the experiment unrepeatable, un-reviewable and
   invisible to the next reader — and half of it (the synthetic-scene generator)
   is the same instrument M11 needs to *prove* IndexedDB is better. An
   experiment you cannot re-run is not evidence.

4. **It ships in `src/core/persistence/`, beside the code it attacks — not in a
   test file and not in `scripts/`.**

   The headline failure only exists in a browser: Node has no storage quota, so
   a vitest-only harness can measure sizes but can never make `setItem` throw
   for real. The code that provokes it therefore has to be reachable from the
   running app. Putting it in core also keeps it honest — it is subject to the
   same boundary rule, the same typecheck and the same lint as everything else,
   which a `scripts/` one-off would not be.

   It is still *diagnostics*, not engine: nothing in the render, draw, select or
   persist paths imports it. The only import is the dev-only hook in decision 5.

5. **Reached through a console handle, not a UI.**
   `src/react/useDiagnostics.ts` attaches the harness to
   `window.canvasDiagnostics` behind `import.meta.env.DEV`, so it does not exist
   in a production build.

   M9 decision 6 refused a user-facing Clear button on the grounds that document
   mutation is M12's territory. That still holds: a devtools handle is not a
   product affordance. It also never has to be removed later, which a toolbar
   button would — and "temporary" UI is never temporary.

   React owns the *when*, consistent with M9 decision 9: core exposes the
   functions, the React layer decides that they exist only in dev and only on
   `window`.

6. **Four named experiments, one call each.**

   | Call | Provokes |
   |---|---|
   | `canvasDiagnostics.ceiling()` | how much room this origin actually has |
   | `canvasDiagnostics.flood()` | the real write path throwing `QuotaExceededError` |
   | `canvasDiagnostics.corrupt(kind)` | the three load-time failures, on next reload |
   | `canvasDiagnostics.fill(n, pts)` | the uncoalesced-write cliff, felt live |
   | `canvasDiagnostics.probe(n, pts)` | what one whole-scene write costs at that size |

   Plus two non-experiments the experiments need: `measure()` reports what the
   live scene costs, and `clear()` empties the key so the next run starts from a
   known state. `clear()` is not a repair — it is M9 decision 6's "one console
   line" given a name, and finding L1 shows the case where even it is
   unavailable, because the handle does not survive that failure.

   `fill` deliberately goes through `store.addElement` in a loop rather than
   seeding the store, because *that* is what reproduces the cliff: every append
   notifies, every notification re-stringifies the entire scene, so filling n
   elements writes O(n²) characters. Seeding would hide the cost being measured.

7. **Three corruptions, chosen to separate three lessons** that M9 decision 5
   said were the whole point:

   - `"malformed"` → `}{`. Not JSON. Throws out of `loadScene()` *during render*.
   - `"unknown-type"` → a well-formed element whose `type` is `"triangle"`.
     Valid JSON, valid-looking element, sails through the cast and dies much
     later, inside the renderer's `switch`, far from the cause.
   - `"wrong-shape"` → `{"elements":[...]}`, the envelope M9 decision 3
     rejected. Valid JSON, wrong container. This one is not vandalism: it is
     exactly what a *future version of this app* would write, and the reason it
     cannot be detected is that M9 has no version field to detect it with. It is
     the migration lesson wearing a costume.

8. **Generated scenes are deterministic** (a seeded LCG, not `Math.random`), so
   two runs of the same options produce byte-identical JSON and the measurements
   below are reproducible rather than approximately reproducible.

9. **Coordinate precision is a parameter of the generator**, not a fixed choice.
   Pointer events give fractional world coordinates, and after a zoom they are
   long ones — `312.4000015258789`, not `312.4`. Whether that matters is a
   measurement, not an opinion, so the generator can emit both and finding S2
   reports the difference. Rounding is a real M11 candidate; applying it here
   would be fixing something, which decision 1 forbids.

10. **`probePersist` catches; `persistScene` does not.** The diagnostic wraps the
    write in `try`/`catch` so it can *report* the error instead of dying. That
    is not the error handling decision 1 rules out — the production call site in
    `CanvasBoard` is untouched and still lets `QuotaExceededError` escape into
    the React event handler. A probe that cannot survive the thing it is probing
    cannot report on it.

11. **Every probe cleans up after itself.** `ceiling()` writes to a scratch key
    and removes it; `probePersist` borrows the scene key and puts back what it
    found, which is what makes `flood()` clean too, since every round goes
    through it. An experiment that leaves a 4 MB blob under the scene key makes
    the *next* reload the experiment, which is how a diagnostic turns into a bug
    report.

    This one was got wrong first time and caught in review: `probePersist`
    originally left its synthetic scene as the live document, so a single
    `probe(400, 250)` replaced the drawing with 4.86 million characters of noise.
    The restore is verified in the browser, and the ceiling and flood figures are
    unchanged by it.

### What the evidence is for

12. **One ADR, and it is about the mechanism: `0003-indexeddb-for-scene-persistence`.**

    M9 decision 13 declined an ADR for the naive pass and predicted this one
    ("why IndexedDB"). It passes the three-part test where M9's did not:
    surprising without context (IndexedDB is a famously unpleasant API to reach
    for at five shapes), a real trade-off, and — the load-bearing criterion —
    **hard to reverse**, because it drags the whole load path from synchronous
    to asynchronous and M9 decision 7 wired the store seed to synchrony.

13. **M10 does not decide what the seam looks like, or what validation to do.**
    It decides *that* localStorage is the wrong mechanism and records the four
    failures any replacement has to answer for. The shape of the read/write
    interface, the version envelope and the validation strategy are M11's, and
    M11 gets to choose them with two implementations in front of it instead of
    one — which is the speculative-generality lesson M9 decision 1 set up.

---

## Findings

All figures below were measured, not estimated. Browser figures come from
**Chrome 143.0.7499.192** (headless, Linux) driven over CDP against the Vite dev
server; sizing and amplification figures come from the vitest suite on Node
24.15. The raw tables and the method are in
[`m10-findings.md`](m10-findings.md).

Sizes are in **characters** (UTF-16 code units of the stored JSON) — see Q1 for
why that, and not bytes, turned out to be the unit that matters.

### Q — the quota

- **Q1. The unit is characters, and the first assumption of this plan was
  wrong.** `ceiling()` accepted **5,242,851** characters under a 29-character
  key. 5,242,851 + 29 = **5,242,880 = exactly 5 MiB**, so Chrome bills
  `key.length + value.length` in UTF-16 *code units* against a 5 MiB budget —
  not bytes. The `chars × 2` model this plan was drafted with overstates the
  cost by exactly 2×, and the folklore "5 MB of localStorage" is right only if
  you read it as five million *characters*. `measureScene` therefore reports
  `chars` as the headline and keeps `utf16Bytes` beside it, clearly labelled as
  the memory footprint rather than the charge. This is finding #1 because it is
  the one that had to be measured to be believed.
- **Q2. The budget is per *origin*, and shared.** With a 485,918-character scene
  in the scene key, `ceiling()` fell from 5,242,851 to **4,756,912** — the
  difference, to within the key lengths. A second key buys nothing, so "put the
  overflow somewhere else" is not an available move.
- **Q3. Past the ceiling, the app keeps working and silently stops saving.**
  Driving the real write path (`fill(30, 250)` in a loop) through the ceiling:

  | round | write | in memory | stored |
  |---|---|---|---|
  | 14 | ok | 5,102,203 | 5,102,203 |
  | 15 | `QuotaExceededError` | 5,247,998 | 5,235,835 |
  | 16 | `QuotaExceededError` | 5,260,144 | 5,235,835 |
  | 17 | `QuotaExceededError` | 5,272,290 | 5,235,835 |

  The stored copy freezes at round 15 and never moves again, while the in-memory
  document keeps growing — drawing one more element after the failure took
  memory to 5,272,939 with storage still at 5,235,835. **The canvas stays
  mounted and drawing keeps working the entire time.** Reloading returns 431
  elements: everything drawn after the ceiling is gone, with no warning at any
  point. Silent, unbounded, delayed data loss is the worst shape a persistence
  bug can take, and it is what M9's "no error handling" buys.

  The throw escapes `store.addElement`, which is exactly what a `pointermove`
  handler calls — so in a real drag it lands in DOM event dispatch, where
  nothing in this app catches it.

### S — what a scene costs

- **S1. Freehand is the entire budget.** A rectangle is 178 characters, an
  ellipse 176, a freehand frame 150 — all fixed. Everything else is points.
- **S2. Unrounded coordinates cost about 2× rounded ones.** Per point:
  **47.9** characters raw, **24.2** at two decimals, 22.0 at one, 18.4 at zero.
  Pointer events after a zoom produce `312.4000015258789`, not `312.4`, so raw
  is what the app actually stores today. Rounding to two decimals is the single
  cheapest mitigation available — and it is deliberately not applied here
  (decision 9).
- **S3. An afternoon of sketching fills it.** A 250-point stroke is 12,147
  characters raw, so the 5 MiB budget holds **431 strokes** — and `flood()`
  agrees exactly: the last successful write was 430 elements (5,224,119 chars),
  the first failure 435 (5,284,808). At two decimals it would be ~847. Four
  hundred strokes is a user, not an attacker.

### W — the write path

- **W1. Filling n elements writes O(n²) characters.** Every `addElement`
  notifies, every notification re-serialises the whole scene, so the amplitude
  is the amplification factor: **5.5× at 10 elements, 25.5× at 50, 100.5× at
  200**. Storing a 2.4-million-character document costs ~244 million characters
  written.
- **W2. One whole-scene write outgrows the frame budget at ~200 strokes.**
  Median of five, per `probe(n, 250)`, across two runs (wall-clock on a shared
  machine varies about 10%, so both are given):

  | elements | characters | ms per write |
  |---|---|---|
  | 10 | 121,485 | 0.5 |
  | 50 | 607,446 | 3.5 |
  | 100 | 1,215,090 | 7.1 – 8.0 |
  | 200 | 2,429,683 | 14.7 – 16.8 |
  | 400 | 4,859,549 | 30.9 – 34.0 |

  Linear in size, as expected — but the numbers are the point. ADR-0002 commits
  a drag live, so **this is the cost of a single `pointermove`.** At 100 strokes
  it eats half a 60 Hz frame; at 200 it is the whole frame, before any drawing
  happens; at 400 it is roughly two frames per move. ADR-0002 predicted
  debouncing would be needed — it did not predict that the cliff arrives at a
  scene a user reaches in one sitting.
- **W3. `setItem` is synchronous on the main thread, and no amount of
  debouncing changes that.** Coalescing makes the 34 ms write rarer; it does not
  make it cheaper or move it off the thread that paints. That is the difference
  between a fix and a mitigation, and it is the hinge of ADR-0003.

### L — the load path

- **L1. `"malformed"` → nothing mounts, and the escape hatch goes with it.**
  Reload after `corrupt("malformed")`: no canvas, no toolbar, and no
  `window.canvasDiagnostics`. `loadScene()` runs inside the `useState`
  initializer, so `SyntaxError: Unexpected token '}'` is thrown during render
  with no error boundary above it. **The diagnostics harness is itself a
  casualty of the failure it exists to diagnose** — recovery needs raw
  `localStorage.clear()` typed into the console. A user has no route at all.
- **L2. `"unknown-type"` → no crash. Something considerably worse.** The app
  mounts, paints, throws nothing, and reports nothing. The unknown element is
  invisible, because `drawElement`'s `switch` simply has no case for it. And the
  exhaustiveness guard is **compile-time only**: `const exhaustive: never = el;
  return exhaustive` returns *the element object* at runtime, which is truthy —
  so `hitTestElement` reports a hit at **every** point on the canvas (verified:
  a `"triangle"` element hit-tests true at `{ x: 9999, y: -4321 }`), and
  `getBoundingBox` returns the element itself, giving the selection overlay an
  `undefined` width and height.

  Net effect: an invisible element that swallows every click anywhere on the
  canvas, cannot be seen, selected meaningfully or removed, and is faithfully
  written back on every save. TypeScript's exhaustiveness checking is a
  guarantee about *code*, not about *data* — and `loadScene()`'s cast is exactly
  where untrusted data enters holding a forged passport.
- **L3. `"wrong-shape"` → mounts, looks alive, never paints.** Canvas and
  toolbar are present and the harness attaches, but `TypeError: scene is not
  iterable` is thrown out of the render loop on every frame. The app appears
  functional and is not.

  This one has no attacker. `{"elements":[…]}` is what a later version of this
  app would legitimately write, and **with no version field nothing in the
  system can tell a newer format from a corrupt one**. L2 and L3 are the same
  bug; L3 just arrives through normal evolution.

### The conclusion the evidence forces

Q3, L1, L2 and L3 are one missing thing wearing four costumes: **the
persistence boundary trusts what it finds and has no way to report that it
failed.** Three of the four are *silent* — the app keeps running and lies about
the document. Only L1 is loud, and it is loud in the most useless way possible.

The fourth failure (W1–W3) is a property of the mechanism. Debouncing is the
obvious answer and it is only a mitigation: it cannot make a synchronous
main-thread write cheap, and it cannot raise a 5 MiB ceiling that S3 says an
afternoon of drawing reaches.

So the remedy splits cleanly. *Validation and a version envelope* answer the
trust failures and could in principle be bolted onto localStorage. *The
synchronous, 5 MiB, string-only, main-thread mechanism* cannot be fixed without
replacing it. Hence ADR-0003, and hence M11 does both — new mechanism, plus the
envelope M9 deliberately left out.

## Non-goals

Everything M9 deferred stays deferred. M10 adds nothing to the list and removes
nothing from it.

- `try`/`catch` on load, structural validation, a schema version field,
  migration logic, `QuotaExceededError` handling, coordinate rounding,
  rAF-coalescing or debouncing the write — **all M11**, now with evidence
  attached.
- A `Persistence` interface or storage injection. Still M11, and still for the
  same reason: two implementations before one interface.
- An error boundary in `main.tsx`. Tempting after L1, and genuinely a one-line
  fix — but it converts a total, obvious, immediately-diagnosed failure into a
  polite fallback UI, and it would do so *before* M11 has decided what the
  recovery path is. Deciding "what the user sees when the document will not
  load" is a persistence decision, not a React one.
- A production-facing diagnostics UI, a storage-usage indicator, or telemetry.
- Anything about IndexedDB beyond the decision to use it.

---

## Build order

| # | What | Notes |
|---|---|---|
| 1 | `core/persistence/diagnostics.ts` + `diagnostics.test.ts` | Test-first for the pure parts (generation, sizing) and for the failure paths a fake `Storage` can reproduce. |
| 2 | Barrel export | `@core/persistence` re-exports the harness. |
| 3 | `react/useDiagnostics.ts`, wired in `CanvasBoard` | Dev-only `window` handle. |
| 4 | Run the experiments in the browser, record the findings | Section above. |
| 5 | `docs/adr/0003-indexeddb-for-scene-persistence.md` | The decision the evidence forces. |
| 6 | `ARCHITECTURE.md`, `CONTEXT.md`, roadmap status | Docs describing code land after the code. |

---

## Tests (colocated, node env — see ADR-0001)

`src/core/persistence/diagnostics.test.ts`. The node environment has no
`localStorage` and no quota, so the suite installs the same in-memory `Storage`
the M9 tests use — extended with an optional **byte cap that throws
`QuotaExceededError`**, which is what makes the quota paths testable at all
without a browser.

- **generation is deterministic** — identical options produce byte-identical
  JSON (decision 8).
- **generation honours its options** — element count, points per element, and
  `precision` actually bounds the decimals emitted.
- **precision shrinks the payload** — rounded coordinates measure strictly
  smaller than raw ones (finding S2).
- **the fake `Storage` charges characters of key + value**, matching what Q1
  found Chrome doing, so the capped-storage tests fail the same way the browser
  does rather than a plausible-looking way of their own.
- **`measureScene` reports both units** — `chars` equals
  `JSON.stringify(scene).length` and is what the quota charges;
  `utf16Bytes === chars × 2` is the footprint beside it (finding Q1).
- **`probePersist` reports instead of throwing** — returns the
  `QuotaExceededError` on a capped storage, and `null` on success (decision 10).
- **`probePersist` puts the document back** — an existing scene survives a
  probe, and a key that was absent stays absent (decision 11). This is the
  regression test for the bug that decision 11 records.
- **`findStorageCeiling` finds the cap** and leaves storage exactly as it found
  it: scratch key gone, scene key untouched (decision 11).
- **`floodPersist` stops at the first failure**, returns the last successful
  probe alongside the failing one, and restores the pre-existing stored value
  (decision 11).
- **each corruption writes the exact documented string** — these are load-bearing
  literals: the point of `"wrong-shape"` is that it is *plausible*, so a typo
  that made it implausible would quietly weaken the experiment.

Explicitly **not** tested: how `loadScene()` reacts to any of the three
corrupted values. The corruption tests assert only what was *written*. Asserting
what loading then does — that it throws, or that it does not — would cement the
trusting-cast behaviour M11 exists to change, which is the same reasoning as
M9's test plan. Those reactions are findings L1–L3, and findings belong in prose.

---

## Docs

- `.claude/plans/m10-findings.md` — the raw measurement table backing the
  Findings section, kept separate so the plan stays readable.
- `docs/adr/0003-indexeddb-for-scene-persistence.md` — new (decision 12).
- `ARCHITECTURE.md` — the diagnostics module in the Persistence section and the
  file map; the "load-bearing for M10" paragraph updated now that M10 has
  happened and points at ADR-0003.
- `CONTEXT.md` — no new vocabulary. *Persist* and *store* already cover this
  milestone, and "diagnostics" is not a domain term.
- `.claude/plans/README.md` — status row.
