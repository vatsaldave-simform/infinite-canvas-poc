# Context — Domain Glossary

The vocabulary this project speaks. Terms only — no implementation detail, no
spec. For how the pieces fit together at runtime see `ARCHITECTURE.md`; for
decisions and their reasoning see `docs/adr/`.

When your output names one of these concepts, use the term as defined here.

---

## Space & navigation

**World space** — the coordinate system of the infinite sheet the drawing lives
on. An element's world position never changes when you navigate. Units are
"world units"; at 1× zoom one world unit is one CSS pixel.

**Screen space** — the coordinate system of the canvas element, origin at its
top-left, measured in CSS pixels. Pointer and wheel events report screen space.
It shifts under pan and zoom.

**Viewport** — the camera looking at the world. Holds where world origin sits on
screen and how many screen pixels there are per world unit. *The camera moves;
shapes never do.* Distinguish carefully from **canvas** (the DOM node) and from
the **backing store** (its physical-pixel buffer, sized by device pixel ratio).

**Pan** / **Zoom** — moving the viewport, and changing its scale. Both are
viewport operations. Neither ever alters an element. Contrast **move**, below,
which alters an element and not the viewport.

---

## The document

**Element** — one drawable thing in the scene: a rectangle, an ellipse, or a
freehand stroke. Always has an identity and a world-space origin. Prefer
"element" over "shape" or "object"; *shape* leaks in from the toolbar, where it
means the drawable types only, and *object* means nothing here.

**Scene** — the ordered collection of every element. The **document** state: the
thing that gets persisted.

**Z-order** — front-to-back stacking. It is the scene's ordering, nothing else:
later in the order draws on top. Hit-testing walks it back-to-front to find the
topmost element under a point. A **move** must never change an element's
z-order.

**Committed element** — an element that is part of the scene. **A committed
element is frozen: it is never mutated in place.** Changing one means producing
a new element and putting it in the scene's place. This invariant is what makes
change-detection cheap, makes it safe for two elements to share a points array
or a style object, and is a precondition for undo.

**Draft** — the provisional element that exists only while a shape is being
drawn. Not part of the scene, never persisted, discarded if the gesture is
cancelled. Because a draft is not committed, the frozen rule does not apply to
it — a draft may be mutated in place. A draft becomes an element on release.

---

## Editor state

**Editor state** — state about the act of editing rather than about the
document: what is selected, which tool is active. Deliberately kept out of the
scene and **not persisted**. (Excalidraw's `elements` vs `appState` split.)

**Selection** — the currently selected element, or nothing. Single-select only.
Selection is held **by identity, not by reference**: an element is replaced by a
new one whenever it changes, so a captured reference would go stale where an
identity stays valid.

**Tool** — the active input mode chosen in the toolbar: select, or one of the
drawable types.

---

## Interaction

**Hit test** — deciding which element, if any, lies under a world point.
Answers with the topmost one.

**Slop** — the tolerance that makes hit-testing forgiving of imprecise pointing.
Measured in **screen** pixels and converted to world units at the current zoom,
so it feels the same at every scale. The same reasoning applies to any
interaction threshold: state it in screen pixels.

**Drag** — the input gesture: press, move, release. A gesture, nothing more.
Belongs to the UI layer's vocabulary.

**Move** — the editor action of repositioning a selected element, performed by
a drag. Contrast with **pan**, which repositions the viewport.

**Translate** — the geometric operation underneath a move: offsetting an
element's world origin by a delta, producing a new element. Pure geometry, no
gesture and no editor involved.

> These three name three different layers and that is the point — the word tells
> you where the code belongs. *Translate* is engine geometry, *move* is an
> editor action, *drag* is UI input.
