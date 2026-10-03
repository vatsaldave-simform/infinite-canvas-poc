# M12 — Resize + Delete

**Category: mix → waived.** Claude writes all of it, in explained steps with a
pause after each. Standing instruction for this milestone: *code very simply, so
the code itself is understandable and readable.* See `working-style` in project
memory.

**Goal.** In the select tool, drag one of eight handles on the selection box to
resize the selected element. In any tool, press Delete or Backspace to delete
the selected element.

---

## Decisions

Settled in the M12 grilling session. Each one below is a decision, not a
suggestion. The reasoning is kept because the reasoning is the learning. New
vocabulary (handle, resize, anchor, fit, delete, remove) is in `CONTEXT.md`.

### Scope

1. **Out:** rotation (there is no `angle` field), multi-element resize or
   delete (out of scope for the whole project), and modifier keys: Shift to
   keep the aspect ratio, Alt to resize from the center. See Non-goals.

### Resize — interaction

2. **Eight handles.** Four corners and four edge midpoints. A corner changes
   both axes; an edge changes one and keeps the other from the original
   bounding box. Each handle's **anchor** (the opposite corner or edge) stays
   fixed in the world.
3. **Handles only in the select tool.** A press near a handle in a draw tool
   would be ambiguous with starting a shape, and a handle you can't use would
   be misleading. So handles are neither drawn nor hit-tested outside the
   select tool, even though the selection box still shows there after
   auto-select.
4. **Handles before elements.** On `pointerdown`, the selected element's
   handles are hit-tested first, and a hit wins even if another element is
   drawn over that spot or the handle is outside the element. Otherwise a visible
   handle would sometimes not respond.
5. **Screen-px handles.** Handle size and hit area are in screen px, the same
   reasoning as `HIT_SLOP_PX`. They sit on the dashed selection box (the
   existing 4px margin), not on the element.
6. **Corners win overlaps.** On a small box the edge midpoints fall on the
   corners. Corners are listed and checked first, and a corner can always do
   what an edge can.
7. **Cursors.** Hovering a handle shows its resize cursor (`nwse-resize`,
   `nesw-resize`, `ns-resize`, `ew-resize`). During a resize the grabbed
   handle's cursor stays for the whole gesture, even after a flip.

### Resize — geometry

8. **Flip, don't stop.** Dragging a handle past its anchor turns the box inside
   out. Rectangles and ellipses re-normalise to a non-negative origin and size;
   a freehand stroke mirrors. This matches drawing, where dragging up-left is
   fine.
9. **Freehand stretches.** Every point offset is stretched, so the stroke's
   bounding box fills the target box.
10. **Stroke width never stretches,** for any type. `style` stays shared by
    reference, as with translate. A freehand resize does build a new points
    array every frame. That is necessary, and fine.
11. **`fitElement(original, target)`.** `target` is a `Bounds` whose width and
    height **may be negative, meaning flipped**. Fit does one job: make the
    element's bounding box equal `target`. The sign carries the flip, so fit
    never has to work it out. Document this on the parameter, because
    `getBoundingBox` never returns a negative size.
12. **A flat axis keeps factor 1.** A freehand stroke with zero extent on an
    axis (a perfectly straight horizontal or vertical line, which drawing
    allows) can't be stretched along it, since `n / 0` has no meaning. On that axis
    the offsets are kept and the stroke only moves to the target. It's one `if`
    inside fit, with no special case in the handle code.
13. **Minimum size, clamped every frame.** Drawing refuses elements under 2 world
    units, so resize must not be a back door around that. `MIN_DRAG_SIZE`
    moves out of `useDrawTool` into `core/scene` as `MIN_ELEMENT_SIZE = 2`
    (world units: it's a rule about the document, not about pointing
    precision). The gesture clamps the target's size to at least
    ±`MIN_ELEMENT_SIZE`, keeping the sign, **before** calling fit, but only
    on the axes the handle changes: both for a corner, one for an edge. The
    axis an edge handle leaves alone keeps its original size, as decision 2
    says, even when that size is under the minimum. (Drawing keeps a freehand
    stroke when only *one* axis is under 2, so a 50×1 stroke is valid, and an
    `e` drag must not stretch its height.) The rule is the same for every
    type. On a changed axis it is stricter than creation for freehand, which
    is harmless, since a flat axis ignores the target anyway.

### Resize — state & data flow

14. **ADR-0002 applies unchanged.** A live commit through `replaceElement` on
    every `pointermove`, recomputed **absolutely** from the original element
    and press point captured on `pointerdown`, and `pointercancel` leaves the
    element where it is. It also reuses the move gesture's 3px screen-space
    arming threshold, which lives in the code rather than the ADR. Absolute recompute matters even more here than for move: fitting the
    element again on each frame would build up drift, and once a stroke had
    been squashed flat it could never be recovered within the gesture. No new
    ADR.

### Delete

15. **Delete and Backspace.** Backspace is the delete key on a Mac keyboard. No
    toolbar button: the toolbar holds tools only.
16. **Works in any tool.** "Draw, oops, delete" should just work, including
    straight after auto-select in a draw tool.
17. **Ignored mid-gesture.** While any pointer press is in progress (move,
    resize, or drawing a shape) the key does nothing. Otherwise the outcome
    would depend on how `replaceElement` happens to treat unknown ids, and
    Delete during drawing would delete the *previous* element.
18. **Delete = remove + deselect.** The editor action removes the element from
    the scene and clears the selection. The scene store's `removeElement(id)`
    knows nothing about selection, and follows `replaceElement`'s contract:
    unknown id → same array reference, no notification.

### Layout

19. **`src/core/scene/resize.ts`**, beside `translate.ts`, as M8 planned.
    It holds `fitElement` and `MIN_ELEMENT_SIZE`.
20. **`getHandles(bounds, viewport)` in `src/core/canvas/selection.ts`**
    returns the 8 handles (name `nw`/`n`/`ne`/`e`/`se`/`s`/`sw`/`w` +
    screen position), corners first. It's the one source for both drawing and
    hit-testing, so they can't disagree. `drawSelectionBox` draws them when
    asked.
21. **Tool stays React state.** The render loop learns whether to draw
    handles from a `showHandles` boolean passed into `usePanZoom` and held in a
    ref, like the selected id. Moving `tool` into `EditorStore` was rejected
    for this milestone, because it would turn M12 into a refactor.
    `CONTEXT.md`'s **Tool** entry now says the tool is editor state in meaning
    but held by the UI layer.
22. **`src/react/useDeleteKey.ts`**, a separate small hook, because Delete
    works in every tool and `useSelectTool` only runs in one. It keeps its own
    `pressing` flag from the canvas's `pointerdown`/`pointerup`/`pointercancel`,
    with no "is gesturing" state shared between hooks.

---

## Consequences

- **Undo (M13) will need the removed element's index** to put a deleted
  element back at the same place in z-order. `removeElement` returns `void`
  here on purpose; adding that is M13's job.
- As with move (ADR-0002), a resize is hundreds of store writes, so undo must
  capture the **gesture**, not each mutation.
- Persistence needs nothing new: `removeElement` notifies like every other
  mutation, and the debounced persister picks it up.

---

## Non-goals

- Shift to keep the aspect ratio, Alt to resize from the center. Both are
  small once the anchor model works; pick them up any time.
- Rotation, multi-element resize or delete, snapping, a delete button.

---

## Build order

Each step ends with **stop and wait**, and gets one commit.

| # | What | Notes |
|---|---|---|
| 1 | `removeElement` + tests | `store.test.ts`: removes by id, z-order of the rest preserved, previous array not mutated, unknown id → same reference and no notify, subscribers notified. |
| 2 | `useDeleteKey` | Delete/Backspace, any tool, ignored mid-press. |
| 3 | `fitElement` + `MIN_ELEMENT_SIZE` + tests | `resize.test.ts`: each type fits into a target; negative target flips (rect/ellipse normalise, freehand mirrors); flat freehand axis keeps its offsets; stroke width and `style` reference untouched; original not mutated; `getBoundingBox(fitElement(el, t))` equals normalised `t`. `useDrawTool` switches to the shared constant. |
| 4 | `getHandles` + handle drawing + tests | `selection.test.ts`: 8 positions at 1× and at another zoom/pan; corners first. Handles drawn only when `showHandles`. |
| 5 | Resize gesture in `useSelectTool` | Handles before elements; anchor from the original box; per-frame clamp → fit → `replaceElement`; cursors. |
| 6 | Check in the running app (Chrome), then `ARCHITECTURE.md`, roadmap row, close-out notes here | Docs that describe code land after the code. |
