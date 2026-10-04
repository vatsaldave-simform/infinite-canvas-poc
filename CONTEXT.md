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
drawable types. Editor state in meaning, but held by the UI layer, because only
input handling and the toolbar depend on it.

---

## Persistence

**Persist** — to write the scene out to browser storage so that it survives a
reload. One direction, and reserved for that crossing: the scene is *persisted*,
and the stored copy is *loaded* back. Prefer it to "save", which is fine in
speech but should not name code.

**Store** — always the **in-memory** observable holding live state
(`SceneStore`, `EditorStore`). Never the persisted copy: browser storage is
*storage*, and letting one word mean both is the ambiguity this entry exists to
prevent. For the same reason, the containers inside browser storage are always
**object stores**, never bare "stores".

Only the scene is persisted. **Editor state** and the **viewport** are not, so a
reload restores the *document*, not the session: the drawing comes back, the
camera returns to the world origin at 1× and nothing is selected.

**Format version** — the version of the persisted document's shape, recorded
alongside the scene in storage. It changes only when the shape of what is
stored changes. Not to be confused with the storage mechanism's own internal
versioning, which is an implementation detail and moves independently.

**Upgrade** — turning a persisted document written at an older format version
into the current one. Reserved for that meaning: *migration* names the move from
one storage mechanism to another, which is a one-off project event, not
something the code does.

**Quarantine** — where a persisted document goes when it cannot be loaded:
set aside intact rather than overwritten, so that a document this build does not
understand — corrupt, or written by a newer build — is never destroyed by the
next persist. A quarantined document is not part of the scene and is not loaded
again automatically. A document is accepted or quarantined **whole**; a load
never keeps some elements and drops others.

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

**Handle** — one of the small squares on the selection box that a drag grabs to
resize: one at each corner and one at each edge's midpoint. Editor chrome, not
part of any element. Sized in **screen** pixels, like slop, and found before any
element is: a handle answers even where another element is drawn over it.

**Resize** — the editor action of changing a selected element's size by
dragging a handle. A corner handle changes both axes; an edge handle changes
one and leaves the other alone. Dragging a handle past the anchor **flips** the
element rather than stopping it. A resize never makes an element smaller than
drawing would have accepted, so it cannot leave behind something too small to
select again. Resizing never changes stroke width, and never changes z-order.

**Anchor** — the corner or edge opposite the grabbed handle: the part of the
element that stays fixed in the world while it is resized.

**Fit** — the geometric operation underneath a resize: placing an element into
a target box so that its bounding box becomes that box, producing a new element.
A freehand stroke is stretched to fit, every point with it; a stroke that is
perfectly flat along one axis cannot be stretched along it. The inverse of
taking an element's bounding box. Not "scale" — *scale* already belongs to the
viewport, where it means zoom.

**Delete** — the editor action of taking the selected element out of the
document. It also clears the selection, since there is nothing left to select.

**Remove** — the scene operation underneath a delete: taking an element out of
the scene by identity. Knows nothing about selection.

**Insert** — the scene operation that puts an element into the scene at a
given place in z-order. It is how undo brings a deleted element back exactly
where it was, and how redo brings a drawn one back. *Adding* an element is the
special case that places it on top.

> The same layering again: *fit* and *remove* are engine operations on elements
> and the scene; *resize* and *delete* are editor actions; dragging a handle and
> pressing a key are UI input.

---

## History

**History** — the record of changes made to the document during this session.
Undo walks back through it and redo walks forward. It is **linear**: making a
new change after undoing throws away whatever could have been redone. Only
changes to the **document** are recorded, never editor state, so selecting an
element or switching tool is not something you can undo. History lives only as
long as the page does. It is never persisted, so a reload starts with empty
history.

**Undo** / **Redo** — the editor actions of reverting the most recent change in
history, and re-applying the most recently undone one. The unit is one whole
editor action: one drawn element, one move, one resize, one delete. It is never
the individual store writes a drag is made of. A gesture interrupted partway
still counts as a change if it changed the document.

**History entry** — one change recorded in history, described in terms of the
scene operation it was: an **add**, a **replace** (before and after), or a
**remove** (the element and where it stood in z-order). A move and a resize are
both replaces; history does not know which gesture produced one. An entry is
plain data, not a *command*: it holds no behaviour of its own, and history
decides how to undo and redo it. Undoing or redoing an entry also selects the
element it touched, when that element is in the scene afterwards, and clears
the selection otherwise.

**Timeline** — the editor's view of history: one mark per history entry, laid
out in order, with the document's current place among them. It is not a second
record and not a preview. It shows history, and moving along it *is* undo and
redo, so the document really changes as it moves. Shown only while it is open.

**Scrub** — moving along the timeline to any point in history at once.
Scrubbing back is undoing that many entries, and scrubbing forward is redoing
them. A scrub is usually performed with a **drag**, the input gesture, but
pressing once on the timeline, or using the arrow keys on it, scrubs too.

**Replay** — stepping forward through history on its own, one entry at a time
at a steady rate, so the document rebuilds itself in front of you. A replay is
redo on a timer, and it stops when there is nothing left to redo. It can be
**paused** and played again from wherever the present is. Anything that
changes the document, a scrub included, pauses a replay first; moving the
viewport does not.

**Past** / **Present** / **Future** — where the document stands in history.
The *past* is the entries that can be undone, the *future* is the ones that can
be redone, and the *present* is the point between them: the document as it is
now. Undo, redo, scrubbing and replay all move the present; making a new change
throws the future away. The earliest point is **the document as loaded**, not
an empty scene, because history starts empty on every page load. Prefer these
words to "position" (an element's place in the world), "origin" (the world's)
or "cursor" (the pointer's).
