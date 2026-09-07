# M8 — Move Selected Element (drag)

**Category: A.** You write the core logic; I give signatures, review, and the
scaffolding around it. See `working-style` in project memory.

**Goal.** In select mode, press an element and drag it to a new world position.
The scene is the truth throughout — no preview layer.

---

## Decisions

Settled in the M8 grilling session. Each one below is a decision, not a
suggestion; the reasoning is kept because the reasoning is the learning.

### Interaction

1. **One gesture.** `pointerdown` on any hittable element selects it *and* arms
   a drag. You never have to click-then-drag. `pick(e)` already runs on
   pointerdown in the select path, so this costs nothing extra.
2. **3px screen-space arming threshold.** The drag is not armed until the
   pointer has travelled ≥ 3 **screen** px from the press point. Below that the
   gesture is a plain click/select and the element does not move. The threshold
   is in screen px — like the existing `HIT_SLOP_PX` — because a world-unit
   threshold changes meaning with zoom. `scale` is screen px per world unit, so
   a 3-world-unit threshold needs `3 × scale` screen px of travel: zoomed out
   to 0.02× that is 0.06 screen px (no protection against hand jitter at all),
   zoomed in to 4× it is 12 screen px (sluggish). Only a screen-px threshold
   means the same thing to the user's hand at every zoom level.
3. **Cursors.** `move` when hovering a hittable element in select mode (replaces
   today's `pointer`), `grabbing` while a drag is armed, `default` otherwise.
   Hover-picking is suppressed while dragging.
4. **Empty-space press still deselects.** No rubber-band — out of scope for the
   whole project.
5. **`pointercancel` leaves the element where it is.** It does *not* snap back.
   Every move is already committed; a cancel that rewound committed state would
   be the only place in the app where that happens, and would read as a bug.
   (Drawing's `pointercancel` discards a draft — but a draft was never
   committed. Different situation, not a precedent.)

### State & data flow

6. **Live commit.** Every `pointermove` writes the new position through the
   scene store. The selection box, hit-testing and `renderScene` all read the
   store, so they follow for free. The rejected alternative — a preview ref like
   `draftRef` — would force `renderScene` to learn about an "excluded id".
   Recorded as [ADR-0002](../../docs/adr/0002-drag-commits-live-to-the-scene-store.md).
7. **Absolute delta, not incremental.** `pointerdown` captures the press
   world-point **and the original element object**. Every move computes
   `d = current − press` and writes `translateElement(original, d)`. Incremental
   deltas accumulate float error and desync if the user zooms mid-drag (the
   wheel stays live during a pointer drag).
8. **`replaceElement(next)` on the scene store**, not `moveElement(id, dx, dy)`.
   The store stays free of geometry; the caller already holds the original
   element, so `replaceElement(translateElement(original, d))` reads as what it
   does. M12 (resize) reuses it unchanged.
9. **Shallow spread is fine.** `{ ...el, x, y }` shares `style` and `points` by
   reference with the old element. Accepted, because **a committed element is
   frozen** — see `CONTEXT.md`. Deep-copying would allocate a full stroke array
   every drag frame to defend against a rule we enforce anyway.

### Layout

10. **New `src/core/scene/translate.ts`.** Matches the one-concern-per-file
    rhythm of `scene/`. Not `factory.ts` (that module is explicitly about
    *creation*); not `scene/transform.ts` (`core/canvas/transform.ts` already
    means viewport math — two "transform" modules would be exactly the
    ambiguity the glossary exists to prevent). M12 adds `resize.ts` beside it.
11. **New `src/react/useSelectTool.ts`.** `useDrawTool`'s `tool === 'select'`
    branch is already a separate program behind an early return; M8 is where
    pretending otherwise costs more than the split. `useDrawTool` keeps shape
    creation only.

---

## Non-goals

- **Arrow-key nudge.** Deferred deliberately, not forgotten: it reuses
  `translateElement` + `replaceElement` verbatim (± 1 world unit, ± 10 with
  Shift) and is ~10 lines, but it would be the only key-repeat code in the
  project. Pick it up any time after M8.
- Multi-element move, snapping/alignment guides, drag-to-reorder z-order,
  constrained (axis-locked) drag, move via a dedicated handle.

---

## Build order — A-first, bottom-up

Each step ends with **stop and wait**.

| # | What | Who | Notes |
|---|---|---|---|
| 1 | `translateElement` + `replaceElement`, with tests | **A — you** | Both pure, testable with zero wiring. `pnpm test:watch` red→green before any pointer event exists. |
| 2 | Review | me | |
| 3 | Extract `useSelectTool.ts` (move existing select/hover/Escape over, add cursors, leave the drag state machine as a marked hole) | **B — me** | Mechanical. |
| 4 | Drag state machine inside the hook | **A — you** | Press-point capture, 3px arming, pointer capture, hover suppression. |
| 5 | Review, then `ARCHITECTURE.md` + roadmap status | me | Docs that describe code land after the code. |

Rationale for A-first: steps 1's two functions are provable in isolation, so
when the drag misbehaves in step 4 the layers underneath are already known-good
and the bug can only be in the state machine.

---

## Tests (colocated, node env — see ADR-0001)

`src/core/scene/translate.test.ts`

- rectangle / ellipse / freehand each translate by the delta
- freehand `points` array is untouched (offsets are relative) and its bounding
  box shifts by exactly the delta — cross-check with `getBoundingBox`
- zero delta
- the original element object is not mutated

`src/core/scene/store.test.ts`

- **z-order index preserved** — replace the middle of three, assert the order.
  This is the test that earns its keep: `filter` + `push` is the obvious wrong
  implementation and its symptom (a moved shape silently jumping to the front)
  wouldn't surface for weeks.
- the previous scene array is not mutated
- unknown id → returns the **same array reference** (the `getSnapshot`
  stability contract in `store.ts`)
- subscribers are notified

---

## Docs

- `CONTEXT.md` — created with this milestone (backfilled glossary). ✅
- `docs/adr/0002-drag-commits-live-to-the-scene-store.md` ✅
- `ARCHITECTURE.md` + roadmap row — at the end of M8.
