# M11 — Raw Measurements

Backing data for decision 18 of
[`m11-indexeddb-persistence.md`](m11-indexeddb-persistence.md): ADR-0003's
central claim, checked against data. It re-runs M10's W2 (the cost of one
whole-scene write, [`m10-findings.md`](m10-findings.md)) against IndexedDB.

## Method

**Browser.** Chrome 143.0.7499.192 (`google-chrome --version`; the headless
user agent reports `HeadlessChrome/143.0.0.0`), headless, Linux, the same build
M10 measured with. Driven over the DevTools Protocol against the Vite dev server
at `http://localhost:5173/`. A fresh `--user-data-dir` and a fresh browser
process per session, so the two sessions share no state, warm-up included.

**Instrument.** Every figure comes from `canvasDiagnostics.probe(n, 250)`, i.e.
`probeWrite` in `src/core/persistence/diagnostics.ts`. It writes the scene
through `writeDocumentTimed` in `src/core/persistence/indexed-db.ts`: the same
`readwrite` transaction, the same `{ version, elements }` envelope and the same
explicit `commit()` as the real `writeDocument`. It times two things that do not
overlap:

- **clone**: from just before `put()` to its return. `put()` structured-clones
  its value synchronously, so this is the main-thread time a frame pays. It is
  the figure comparable with W2, which timed `JSON.stringify` + `setItem`, the
  whole of a localStorage write and all of it synchronous.
- **commit**: from `put()` returning to the transaction's `complete` event. This
  is wall-clock waiting, not work done by the calling code: the page's own code
  has returned by then. Whether any of it costs the main thread something
  internally was not measured.

The scene is generated before the clock starts. It is the same seeded scene M10
used: the character counts below match W2's exactly. `probe` reads the stored
document first and writes it back afterwards, or deletes it again if there was
none. That was verified before measuring, in both directions. With no document,
a reload after `probe(10)` loaded an empty scene. With a 3-stroke document
(`fill(3, 10)`, then the debounce), a reload after `probe(50, 250)` loaded the
same 3 strokes, ids `stress-0`…`stress-2`.

**Reproducing.** `pnpm dev`, then launch each session as a fresh headless
browser, as measured:

```sh
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir="$(mktemp -d)" --no-first-run http://localhost:5173/
```

Evaluate the snippet below once per session with `Runtime.evaluate`
(`awaitPromise: true`, `returnByValue: true`), after `window.canvasDiagnostics`
exists. Pasting it into the DevTools console of a headed browser, started the
same way without `--headless`, runs the same code. That is the easier route,
but it is not the condition measured here. Either way, leave the canvas idle: a
real write landing mid-probe would be overwritten by the restore.

```js
(async () => {
  const median = (xs) => [...xs].sort((a, b) => a - b)[2];
  const rows = [];
  for (const n of [10, 50, 100, 200, 400]) {
    const runs = [];
    for (let i = 0; i < 5; i += 1) runs.push(await canvasDiagnostics.probe(n, 250));
    rows.push({
      elements: n,
      chars: runs[0].chars,
      cloneMs: median(runs.map((r) => r.cloneMs)),
      commitMs: median(runs.map((r) => r.commitMs)),
      cloneRuns: runs.map((r) => r.cloneMs),
      commitRuns: runs.map((r) => r.commitMs),
    });
  }
  console.table(rows);
  return rows;
})()
```

**Precision.** `performance.now()` is coarsened to 0.1 ms in a page that is not
cross-origin isolated, so figures under about 1 ms are close to the timer's
resolution. Values below are rounded to 0.1 ms.

---

## W2′ — cost of one whole-scene write, IndexedDB (Chrome)

Median of five, 250 points per stroke.

| elements | characters | clone A (ms) | clone B (ms) | commit A (ms) | commit B (ms) | clone + commit A / B (ms) |
|---|---|---|---|---|---|---|
| 10 | 121,485 | 0.4 | 0.7 | 0.2 | 0.7 | 0.6 / 1.4 |
| 50 | 607,446 | 2.9 | 3.1 | 1.2 | 1.2 | 4.0 / 4.3 |
| 100 | 1,215,090 | 4.7 | 4.7 | 1.4 | 1.5 | 6.0 / 6.1 |
| 200 | 2,429,683 | 8.9 | 8.8 | 1.7 | 1.9 | 10.8 / 10.7 |
| 400 | 4,859,549 | 18.1 | 17.8 | 2.7 | 2.7 | 21.2 / 20.5 |

The last column is the median of the five per-run sums, not the sum of the two
medians. The snippet does not compute it; it was derived afterwards from the
unrounded `cloneRuns` and `commitRuns` the snippet returns.

### Every run

In the order taken. The first run at each size in a fresh session is often the
slow one (warm-up), which is why the median is reported.

| elements | session | clone (ms) | commit (ms) |
|---|---|---|---|
| 10 | A | 1.2, 0.4, 0.4, 0.3, 0.3 | 1.6, 0.3, 0.2, 0.2, 0.2 |
| 10 | B | 1.6, 0.6, 0.7, 0.7, 0.8 | 5.0, 0.8, 0.6, 0.7, 0.6 |
| 50 | A | 3.3, 2.9, 2.8, 2.8, 2.9 | 7.8, 1.1, 1.2, 1.2, 1.1 |
| 50 | B | 5.5, 5.8, 3.1, 2.8, 2.8 | 8.1, 2.3, 1.2, 1.1, 1.0 |
| 100 | A | 4.7, 4.5, 4.7, 4.8, 4.7 | 1.3, 1.4, 1.3, 1.4, 1.4 |
| 100 | B | 4.8, 5.0, 4.5, 4.7, 4.5 | 1.5, 1.7, 1.6, 1.2, 1.2 |
| 200 | A | 9.2, 8.9, 9.5, 8.6, 8.7 | 1.6, 1.9, 4.1, 1.6, 1.7 |
| 200 | B | 8.6, 8.8, 8.8, 8.9, 9.4 | 1.6, 2.1, 1.9, 1.8, 1.9 |
| 400 | A | 19.4, 18.4, 17.9, 18.1, 17.7 | 2.6, 2.9, 2.6, 3.1, 2.7 |
| 400 | B | 18.2, 18.0, 17.4, 17.0, 17.8 | 2.7, 2.7, 2.4, 2.8, 2.7 |

---

## Against M10's W2

Synchronous main-thread cost of one whole-scene write: W2's
`JSON.stringify` + `setItem` against W2′'s clone. Each range spans the two
sessions on that side. A frame at 60 Hz is 16.7 ms.

| elements | W2, localStorage (ms) | W2′ clone, IndexedDB (ms) | lower by | frames at 60 Hz, W2 → W2′ |
|---|---|---|---|---|
| 10 | 0.5 | 0.4–0.7 | — (within timer resolution) | 0.03 → 0.02–0.04 |
| 50 | 3.5 | 2.9–3.1 | 11–17% | 0.21 → 0.17–0.19 |
| 100 | 7.1–8.0 | 4.7 | 34–41% | 0.43–0.48 → 0.28 |
| 200 | 14.7–16.8 | 8.8–8.9 | 39–48% | 0.88–1.01 → 0.53 |
| 400 | 30.9–34.0 | 17.8–18.1 | 41–48% | 1.85–2.04 → 1.07–1.09 |

W2 had only one session at 10 and 50 elements, so those rows compare against a
single figure.

**Yes, the synchronous cost is lower: by 34–48% from 100 strokes up, and 39–48%
from 200 up, which is a little under half.** Both are linear in the scene. W2
cost about 80 µs per stroke; the clone costs about 45 µs (17.8–18.1 ms at 400).
At small scenes the difference shrinks to the timer's resolution.

**It is lower, not gone.** At 400 strokes one write still costs more than a
whole 60 Hz frame (about 1.1 frames), on the thread that paints. At 200 strokes
it is about half a frame. The commit adds 1.4–2.7 ms of waiting at 100–400
strokes, but the page's code has already returned by then.

The two sides were taken six days apart (M10 was committed 2026-09-27), with
the same Chrome build, and machine load was not controlled. W2's two sessions
differed by 11–14%. The smallest gap here is 34%, about three times that. Both
W2′ sessions' clone medians agree within 0.3 ms at every size from 50 up. So
the direction and rough size of the difference are not an artefact of noise.

---

## Against ADR-0003

**No contradiction beyond the amendment already made.** The amendment
(2026-10-01) already corrected the two claims these numbers bear on:
serialisation does not leave the main thread, and only the commit is
asynchronous. The data agrees with it. The clone is synchronous, O(scene), and
the larger part of every write: 72–87% of clone + commit from 50 strokes up.

What the numbers add, and the ADR does not state:

- **The synchronous cost is about halved, not removed.** The original ADR text
  implied removal ("asynchronous writes that do not block painting"), and the
  amendment struck that without putting a number in its place. Here is the
  number. Nothing in the ADR needs to change for it: the amendment already
  says the comparison lives in this file.
- **Coalescing is load-bearing, not an optimisation.** At 400 strokes an
  uncoalesced write per `pointermove` would still blow the frame budget on
  every move. This supports decision 12 and the amendment's reading of the
  coalescing consequence: coalescing bounds a synchronous cost that IndexedDB
  only made smaller.

**Decision 16 (rounding deferred) is unaffected.** Nothing here makes a new
case for rounding. Its effect on clone cost was not measured: `probe` takes no
precision, by the shape decision 18 set.
