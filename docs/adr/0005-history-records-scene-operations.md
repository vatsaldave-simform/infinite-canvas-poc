# History records scene operations; the store stays the source of truth

Undo/redo is a linear stack of **history entries**, each a plain-data record of
one scene operation: `add`, `replace` (before and after) or `remove` (the
element and its index). Undo applies the inverse through the scene store, and
redo applies the entry again. The scene store remains the one source of truth;
history is a log *about* it, not the thing it is derived from. Entries are
recorded explicitly by whoever owns the action, when that action finishes. The
brief named event sourcing as the concept to learn, so a reader will expect the
scene to be rebuilt from a log. This ADR records why it is not.

## Considered Options

- **Event sourcing** — rejected. The scene would be a projection: a base scene
  plus an append-only log, with undo moving a cursor back and replaying. It is
  the purest form of "history as facts", and it would make the log the
  document. But every layer built so far assumes the store is the truth.
  ADR-0002's live drag writes the store hundreds of times per gesture. The
  persister saves whole-scene snapshots from it. Loading seeds it from one
  stored record (ADR-0003, ADR-0004). Making the log the truth means persisting
  the log, upgrading and validating events instead of a scene, and replaying,
  or checkpointing, on every load and every undo. That is a rebuild of
  persistence to get undo, which needs none of it.
- **Snapshot stack** — rejected. Each entry is a whole `Scene` array. Frozen
  elements make it cheap, since consecutive snapshots share almost every
  element, and it is the simplest correct design. It was turned down because
  it teaches nothing about inverses or recording intent, which is what this
  milestone is for. It also restores *everything*, which would quietly undo a
  change made outside history (such as the dev diagnostics' `fill`).
- **Editor-action entries** (`draw` / `move` / `resize` / `delete`) — rejected.
  The names read better, but move and resize undo identically, and every new
  editor action would need a new entry kind. Scene operations give three
  kinds, and their inverses pair up: add ↔ remove, and replace swaps before
  and after.
- **History diffs the store** — rejected. History would subscribe to the scene
  store and derive entries by comparing snapshots, with gesture hooks marking
  begin and end. It would catch every change without anyone remembering to
  record, but the store cannot know where a gesture ends (ADR-0002). It would
  need whole-scene diffs. And because undo writes through the same store, it
  would hear its own undos as new changes unless guarded against them.

## Consequences

**Every document change must record an entry, by hand.** The owner of each
action does it: the select tool for moves and resizes, the draw tool for adds,
the delete key for removes. A future action that forgets will be skipped by
undo. A test that undoing everything returns the starting scene is the
backstop.

**`remove` needs the index, so the store gives it.** `removeElement` returns
the index it removed from, and a new `insertElement(element, index)` puts an
element back there. Z-order is the scene's ordering, so an undone delete must
come back at the same depth, not on top.

**An entry assumes the scene is as history left it.** Only the dev
diagnostics change the scene without recording, and the effect is bounded: a
restored element may land among elements added since. There is no defensive
"entry no longer applies" path.

**History is not persisted,** so this ADR changes nothing on disk. If history
ever had to survive a reload, that would be the moment to revisit event
sourcing, because the log would then need persisting anyway.
