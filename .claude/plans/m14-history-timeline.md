# M14 — History timeline

**Category: none.** From M14 on, the Category A/B split is dropped: Claude
writes everything. The M12 standing instruction carries over: code very simply,
so the code itself is understandable and readable. See `working-style` in
project memory.

**Goal.** A timeline of the session's history that you can scrub to rewind and
replay the document, and a replay that rebuilds it step by step. As far as we
know, neither Excalidraw nor tldraw offers one: both have only undo and redo.

---

## Decisions

Settled in the M14 grilling session. Each one below is a decision, not a
suggestion, with its reasoning. New vocabulary (timeline, scrub, replay, past,
present, future) is in `CONTEXT.md`.

### What the timeline is

1. **Scrubbing is live: the timeline is a visual undo/redo.** Moving the
   present back three steps runs three real undos through the store. The
   document really changes, the persister saves it, and Ctrl+Z moves the
   timeline's thumb, because it is the same thing. The alternative was a
   *preview* that draws a past scene without touching the store, with a
   Restore that records a new entry. It would have needed a second rendering
   path, a whole-scene entry kind one milestone early, and a "previewing"
   mode in which the canvas refuses edits. Live is honest: the timeline *is*
   history. It also tests ADR-0005, since scrubbing is only undo and redo
   repeated.
2. **History stays linear,** and the timeline makes the risk visible. Marks
   in the future are dimmed, so you can see what a new change would throw
   away. An undo tree was weighed and deferred: it replaces history's two
   stacks with a tree, needs a branch picker, and changes "linear" in the
   glossary, which makes it a milestone of its own. Emacs-style history (the
   undos themselves becoming entries) was rejected, because it fills the
   timeline with undo-steps and makes Ctrl+Z confusing.
3. **History stays session-only.** Persisting it would let a replay span
   reloads, but it means format version 2, an upgrade from v1, and a bigger
   synchronous clone on every write (18 ms at 400 strokes already, per
   `m11-findings.md`). So the earliest point on the timeline is **the
   document as loaded**, not an empty scene.

### Behaviour

4. **Hidden by default; `H` opens and closes it.** A bar at the bottom of the
   viewport with one mark per entry and a thumb at the present. Notices move
   up while it is open. Hundreds of entries merge into a continuous track,
   and the thumb snaps to the nearest entry. Marks are not labelled with
   gestures ("Moved rectangle"): history does not know the gesture, and
   ADR-0005 chose that on purpose.
5. **Empty history still opens,** showing one mark for the document as
   loaded, with replay disabled.
6. **Replay steps forward about 4 entries per second** and stops when the
   future is empty. A play/pause control on the bar, and Space while the bar
   is open. Pan is on the wheel, so Space is free.
7. **Selection follows M13's rule per step.** After each entry applied, the
   element it touched is selected if it is in the scene, otherwise the
   selection is cleared. During a replay that works as a "this just happened"
   highlight. After a scrub, it is the last entry applied that counts.
8. **The timeline ignores input while the canvas is pressed,** like undo and
   Delete.
9. **Anything that changes the document pauses a replay first:** pressing on
   the canvas with a tool, Delete, Backspace, and the undo and redo keys.
   Otherwise a draw mid-replay would silently throw away the rest of the
   future. Pan and zoom only move the viewport, so they keep working.

### Build

10. **History grows three things,** all core and tested in node: read access
    to the present and the number of entries, a `subscribe` (the timeline is
    the first thing that must redraw when history changes), and `goTo(n)`,
    which undoes or redoes until the present is at `n` and returns the last
    entry it applied, which the selection rule needs.
11. **The timeline is DOM chrome in `src/react/`,** like the toolbar, not
    drawn on the canvas. The core/react boundary is unchanged.
12. **No ADR.** Nothing here is hard to reverse or surprising: the timeline
    applies ADR-0005 rather than changing it.

---

## Consequences

- **A scrub across many entries is many store writes.** Each notifies, the
  render loop coalesces them into one frame, and the debounced persister into
  one write.
- **Every document change must still record an entry,** or the timeline will
  not show it and scrubbing will skip it. M13's rule is unchanged.
- **M15's compound entries must work with the timeline unchanged.** The
  timeline only moves the present through undo and redo, so a new kind of
  entry should need nothing from it.

---

## Non-goals

- Persisted history. An undo tree. A preview-and-restore mode.
- Labelling marks with the gesture that made them.
- Exporting a replay (export is out of scope for the roadmap).

---

## Build order

Vertical slices, as in M12 and M13: each runs from core to UI, is checked in
the browser, and is one GitHub issue.

| # | Slice | Notes |
|---|---|---|
| 1 | Open the timeline and scrub through history | History: present, count, `subscribe`, `goTo`, with tests. The bar, `H`, dimmed future, dense track, the "as loaded" mark, the selection rule after a scrub, ignored mid-press, notices moved up. |
| 2 | Replay history | Play/pause and Space, about 4 steps per second, selection per step, paused by any document change, pan and zoom unaffected. |
| 3 | Close-out | `ARCHITECTURE.md` "Timeline" section, the History section's "no `subscribe`" corrected, the file map, the roadmap row, close-out notes here. |
