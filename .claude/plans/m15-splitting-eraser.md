# M15 — Splitting eraser

**Category: none.** As in M14, Claude writes everything. The M12 standing
instruction carries over: code very simply, so the code itself is
understandable and readable. See `working-style` in project memory.

**Goal.** An eraser that cuts freehand strokes where it crosses them, leaving
the pieces either side, instead of deleting whole strokes. It is the first
editor action that changes several elements at once, so history has to hold
one change made of several scene operations.

---

## Decisions

Settled in the M15 grilling session. Each one below is a decision, not a
suggestion, with its reasoning. New vocabulary (erase, split, piece, compound)
is in `CONTEXT.md`.

### What the eraser does

1. **Rectangles and ellipses are removed whole** when the eraser touches them.
   Ignoring them would make the tool do nothing to two of the three element
   types. Cutting them into freehand pieces would change their type and
   overlap with M16, which goes the other way.
2. **Only the outline counts for rectangles and ellipses.** Fills are always
   transparent, so passing through the empty inside does nothing: you erase
   what you can see. The ellipse outline is approximated as a many-sided
   polygon, so the existing point-to-segment distance covers it. `hitTest`
   is not reused, because it counts the inside as a hit.
3. **The cut: resample, then drop.** A touched stroke is first subdivided so
   no segment is longer than about half the eraser radius. Then every point
   within the eraser's swept path is dropped, and the stroke splits wherever
   points are missing. The swept path is the polyline through the eraser's
   samples, so a fast erase never skips. Dropping points without resampling
   was rejected: an eraser crossing the middle of a long segment would miss
   it. Exact segment-against-capsule intersection was rejected as much harder
   to read for little visible gain.
4. **Pieces are new elements.** Every piece gets a new id; none of them is the
   original. They keep its style and take its place in z-order, next to each
   other in stroke order. A stroke erased end to end leaves no pieces, so it
   is a plain removal. Keeping the original's id on the first piece was
   rejected: "which piece is the original" has no answer for a cut through
   the middle.
5. **Tiny pieces are dropped:** fewer than 2 points, or a bounding box under
   `MIN_ELEMENT_SIZE` on both axes, the same test the freehand tool uses
   before committing. Like resize, erasing never leaves something too small
   to select.
6. **It reaches every depth and has a fixed size.** It erases everything under
   its path, not just the topmost element. The radius is 8 screen px,
   converted at the current zoom like slop, plus half the stroke's width so
   touching a stroke's visible edge counts. No size control. A circle of that
   radius follows the pointer while the eraser is the tool.

### The gesture

7. **On release, with a ghost preview.** While the eraser is pressed the store
   is untouched. The canvas draws a **preview scene** instead: a plain `Scene`
   array with each touched element swapped for its pieces. Beneath it, the
   parts being erased are drawn faded (about 25% opacity). Pointerup commits
   once and records one entry. Erasing live was rejected: it cannot show what
   is about to go, and it cannot be cancelled. Fading the *whole* touched
   element (Excalidraw) was rejected: it hides where the cut will land.
8. **Cancelling erases nothing.** Pointercancel or Escape while pressed throws
   the preview away. Nothing was committed, so there is nothing to undo, as
   with a cancelled draw. Escape does not cancel draws, moves or resizes;
   that would be scope this milestone does not need.
9. **Pan and zoom keep working mid-gesture.** The preview and the swept path
   are in world space.
10. **An erase that touched nothing records nothing.**

### Tool

11. **A toolbar button, no `E` key.** Tool shortcuts for every tool would be
    their own small feature. The tool stays on the eraser after a gesture, as
    freehand stays put, since erasing takes several passes. Switching to the
    eraser clears the selection.
12. A press already pauses a replay in any tool, and the editor keys and the
    timeline already ignore input while the canvas is pressed. The eraser
    gets both for free.

### History

13. **A compound entry.** One erase records one entry: an ordered list of the
    existing scene operations. A split is "remove the stroke at index *i*,
    then insert its pieces at *i*, *i+1*, …"; a removed rectangle is a remove.
    Undo reverts them in reverse order and redo applies them in order. It is
    one mark on the timeline. A `split` entry kind was rejected: ADR-0005
    turned down editor-action entries because every new action would need a
    new kind. A whole-scene snapshot entry was rejected for the reasons
    ADR-0005 gives against a snapshot stack.
14. **The selection rule generalises.** After an undo, a redo or a scrub, if
    exactly one of the elements the entry touched is in the scene, select it;
    otherwise clear the selection. M13's rule is the one-element case. Undoing
    an erase that only removed one rectangle selects it, like undoing a
    delete.
15. **ADRs: two dated amendments, no new ADR.** ADR-0005 gains a note that a
    compound composes the three operations rather than adding an
    editor-action kind. ADR-0002 gains a scope note: its rejection of a
    preview was about elements already in the scene being moved; the eraser
    swaps whole elements, so its preview scene needs no "exclude this id"
    parameter.

---

## Consequences

- **The freehand tool must stay out of the eraser's way.** The draw tool
  handles every tool except select today, so it must skip the eraser too.
- **The render loop draws a preview scene when there is one,** and the store's
  scene otherwise. `renderScene` itself does not change.
- **The undo-everything test grows an erase,** so the backstop from ADR-0005
  covers compound entries.

---

## Non-goals

- Erasing part of a rectangle or ellipse. An eraser size control.
- Escape cancelling other gestures. Tool keyboard shortcuts.
- Restoring erased parts by moving back over them (Excalidraw's Alt).

---

## Build order

Vertical slices: each runs from core to UI, is checked in the browser, and is
one GitHub issue.

| # | Slice | Notes |
|---|---|---|
| 1 | Erase rectangles and ellipses | Eraser tool and cursor, outline test, preview scene with the touched shapes faded, commit on release, Escape and pointercancel, compound entry with tests, the selection rule generalised. Freehand strokes are untouched. |
| 2 | Erasing splits freehand strokes | Resample and drop along the swept path, pieces at the original's depth, tiny pieces dropped, crossed parts faded in the preview, the undo-everything test extended. |
| 3 | Close-out | `ARCHITECTURE.md`, the roadmap row, close-out notes here. |
