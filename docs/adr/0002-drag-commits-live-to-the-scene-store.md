# Drag commits live to the scene store

Dragging an element writes its new position through the scene store on **every**
`pointermove`, rather than previewing the motion in a ref and committing once on
release. The scene is therefore always the truth: the selection highlight,
hit-testing and `renderScene` all read the store and follow a drag for free,
with no second source of position to keep in sync.

## Considered Options

- **Draft-style preview** — rejected. Drawing already keeps its in-progress
  element in a ref that the render loop paints on top, and reusing that shape
  for move looks symmetric at first glance. It isn't: a draft is a *new* element
  that the scene does not yet contain, whereas a moving element is *already in*
  the scene. Painting a preview on top of it would double-draw, so `renderScene`
  would have to grow an "exclude this id" parameter — a permanent wound in a
  core function, in exchange for allocations that do not matter at this scale.
  The selection highlight would need the same exclusion.
- **Commit-per-move with incremental deltas** — rejected as a variant. Each move
  applying a delta to whatever is currently in the store accumulates float error
  over a long drag, and desyncs outright if the viewport zooms mid-gesture
  (wheel navigation stays live during a pointer drag). We instead capture the
  original element and the press point on `pointerdown` and recompute the
  position absolutely each frame, which is self-correcting and indifferent to
  dropped or coalesced move events.

## Consequences

**Undo (M13) must capture history on `pointerup`, not on every store mutation.**
A single drag produces hundreds of store writes; a command stack that snapshots
per mutation would need hundreds of presses of undo to walk back one gesture.
The gesture, not the mutation, is the unit of history — the store cannot know
that, so the boundary belongs in the interaction layer.

A cancelled drag (`pointercancel`) leaves the element wherever the last move put
it. It does not snap back: every intermediate position was genuinely committed,
and rewinding committed state would be unique to this one path and would read as
a bug. Restoring the original position would also be, in effect, an undo — which
is M13's job, not `pointercancel`'s.

Persistence (M9+) sees a drag as a rapid burst of scene changes, so whatever
writes the scene to storage will need debouncing. It would have needed that for
freehand drawing regardless.
