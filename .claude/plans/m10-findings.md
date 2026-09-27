# M10 — Raw Measurements

Backing data for the Findings section of
[`m10-break-localstorage.md`](m10-break-localstorage.md). Kept separate so the
plan stays readable and the numbers stay checkable.

## Method

**Browser.** Chrome 143.0.7499.192, headless, Linux, driven over the DevTools
Protocol against the Vite dev server at `http://localhost:5173/`. A fresh
`--user-data-dir` per run, so the origin starts with an empty quota. Every
figure comes from `window.canvasDiagnostics`, i.e. from the same code that
ships in `src/core/persistence/diagnostics.ts` — nothing was measured with a
one-off snippet that is not in the repo.

**Node.** vitest on Node 24.15, `src/core/persistence/diagnostics.ts` called
directly. Used for sizing and write-amplification, which need no quota.

**Units.** Characters = UTF-16 code units of the stored JSON string. Finding Q1
established that this, not bytes, is what Chrome charges.

**Reproducing.** Generated scenes are deterministic (seeded LCG), so
`makeStressScene` with the same options produces byte-identical JSON on every
run. In the browser:

```js
canvasDiagnostics.ceiling()            // room left, right now
canvasDiagnostics.probe(100, 250)      // one whole-scene write at that size
canvasDiagnostics.flood()              // grow until the write throws
canvasDiagnostics.fill(30, 250)        // append to the live scene
canvasDiagnostics.corrupt('malformed') // then reload
canvasDiagnostics.clear()              // then reload
```

---

## Q1 — the ceiling, and its unit

| probe | characters | key length | total |
|---|---|---|---|
| `ceiling()`, empty origin | 5,242,851 | 29 | **5,242,880** |

5,242,880 is exactly 5 MiB. The quota is charged as
`key.length + value.length` in UTF-16 code units, against a 5 MiB budget of
*characters*. It is not charged in bytes: a byte-based budget would have stopped
the probe at half this length.

## Q2 — per origin, not per key

| state of the scene key | `ceiling()` |
|---|---|
| empty | 5,242,851 |
| holding a 485,918-char scene | 4,756,912 |

Difference 485,939 ≈ the scene plus key-length bookkeeping.

## Q3 — through the ceiling via the app's own write path

`fill(30, 250)` repeatedly, from an empty origin. Rounds 2–13 omitted.

| round | write | in memory (chars) | stored (chars) |
|---|---|---|---|
| 1 | ok | 364,444 | 364,444 |
| 14 | ok | 5,102,203 | 5,102,203 |
| 15 | `QuotaExceededError` | 5,247,998 | 5,235,835 |
| 16 | `QuotaExceededError` | 5,260,144 | 5,235,835 |
| 17 | `QuotaExceededError` | 5,272,290 | 5,235,835 |

After the failures, one further element:

| | in memory | stored |
|---|---|---|
| before | 5,272,290 | 5,235,835 |
| after `fill(1, 10)` | 5,272,939 | 5,235,835 |

- `document.querySelector('canvas')` → present throughout; the app never stops
  working.
- Reload → 431 elements, 107,750 points, 5,235,835 chars. Everything drawn after
  round 15 is gone.
- The error escapes `store.addElement`, the call a `pointermove` handler makes.

## S — what a scene costs

Fixed per-element cost (via the real factories, so ids are UUIDs):

| element | characters |
|---|---|
| rectangle | 178 |
| ellipse | 176 |
| freehand, 2 points | 190 |

Per-point cost and what the 5 MiB budget holds, for a 250-point stroke:

| precision | stroke (chars) | per point | strokes in 5 MiB |
|---|---|---|---|
| raw (unrounded) | 12,147 | 47.9 | 431 |
| 2 decimals | 6,185 | 24.2 | 847 |
| 1 decimal | 5,641 | 22.0 | 929 |
| 0 decimals | 4,731 | 18.4 | 1,108 |

`flood({ pointsPerElement: 250, step: 5 })` in Chrome, independently:

| | elements | points | characters |
|---|---|---|---|
| last successful write | 430 | 107,500 | 5,224,119 |
| first failure | 435 | 108,750 | 5,284,808 |

Which brackets the 431 the sizing table predicts. Reproduced identically on a
second run.

## W1 — write amplification (Node)

`fillStore` on an empty store, 250 points per element. `charsWritten` is what a
persist-on-every-notification subscriber writes across the whole fill.

| elements | final scene (chars) | characters written | amplification |
|---|---|---|---|
| 10 | 121,485 | 666,000 | 5.5× |
| 50 | 607,446 | 15.5 M | 25.5× |
| 200 | 2,429,683 | 244 M | 100.5× |

## W2 — cost of one whole-scene write (Chrome)

`probe(n, 250)`, median of five. This is the cost of a single `pointermove`
during a drag, per ADR-0002. Two independent sessions, because wall-clock on a
shared machine varies ~10% between runs — the spread is reported rather than
one run's figure dressed up as precision.

| elements | characters | run A (ms) | run B (ms) | frames at 60 Hz |
|---|---|---|---|---|
| 10 | 121,485 | 0.5 | — | 0.03 |
| 50 | 607,446 | 3.5 | — | 0.21 |
| 100 | 1,215,090 | 8.0 | 7.1 | 0.43–0.48 |
| 200 | 2,429,683 | 16.8 | 14.7 | 0.88–1.01 |
| 400 | 4,859,549 | 34.0 | 30.9 | 1.85–2.04 |

Run B was taken after `probePersist` was changed to restore the scene key
(see Q3 note below); the ceiling and flood figures were identical across both
runs, confirming the restore does not move the failure point.

## L — the three load-time failures

Each run starts from a healthy app, corrupts the key, then reloads.

| corruption | canvas mounts | toolbar mounts | harness attaches | thrown |
|---|---|---|---|---|
| `malformed` | no | no | no | `SyntaxError: Unexpected token '}', "}{" is not valid JSON` |
| `unknown-type` | yes | yes | yes | *nothing* |
| `wrong-shape` | yes | yes | yes | `TypeError: scene is not iterable` (every frame) |

### Why `unknown-type` throws nothing

`drawElement`'s `switch` has no case for `"triangle"`, so the element paints
nothing. The exhaustiveness guards are compile-time constructs; at runtime they
return the element:

```
hitTestElement({ id: 'corrupt-1', type: 'triangle', x: 0, y: 0, style: {} },
               { x: 9999, y: -4321 }, 6)
  → { id: 'corrupt-1', type: 'triangle', … }   // truthy: a hit, everywhere

getBoundingBox(same)
  → { id: 'corrupt-1', type: 'triangle', … }   // width/height undefined
```

So the element is invisible, hit-tests true at every point on the canvas, gives
the selection overlay `undefined` dimensions, and is written back on every save.
