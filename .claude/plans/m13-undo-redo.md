# M13 — Undo/redo

**Category: A → waived.** Claude writes all of it, in explained steps with a
pause after each. The M12 standing instruction carries over: code very simply,
so the code itself is understandable and readable. See `working-style` in
project memory.

**Goal.** Ctrl/Cmd+Z undoes the last change to the document, and
Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes it. The changes are drawing an element, a
move, a resize and a delete. Each counts as one step, however many store writes
it took.

---

## Decisions

Settled in the M13 grilling session. Each one below is a decision, not a
suggestion. The reasoning is kept because the reasoning is the learning. New
vocabulary (history, undo, redo, history entry, insert) is in `CONTEXT.md`.

### What history is

1. **A command stack of plain-data entries, not event sourcing.** The brief
   said "command stack, with event sourcing as the concept being learned".
   Those are two different designs, and three were weighed. A snapshot stack
   (each entry a whole `Scene`) is cheap, because frozen elements are shared
   between snapshots, but it has nothing to teach. True event sourcing (the
   scene derived by replaying a log) moves the source of truth out of the
   scene store, which ADR-0002 and the persister both depend on. The chosen
   design is in between. Each entry records a fact about what happened to the
   scene. Undo applies its inverse through the store, and the store stays the
   truth. **ADR-0005.**
2. **Entries record scene operations, not editor actions.** There are three
   kinds: `add`, `replace` (before and after) and `remove` (the element and
   its index). A move and a resize are both a `replace`. History never knows
   which gesture produced one. The inverses pair up: add ↔ remove, and replace
   is its own inverse with before and after swapped. Editor-action entries
   (`draw` / `move` / `resize` / `delete`) read better, but move and resize
   would undo identically, and every new action would need a new kind.
3. **An entry is data, not a *command*.** It holds no behaviour; history
   interprets it. "Command" would set a reader up for `do()` and `undo()`
   methods. "Event" would be both the road not taken (decision 1) and a
   collision with DOM events. So the term is **history entry**.
4. **Document changes only.** Selection and the tool are editor state and are
   not undoable, as in Excalidraw.
5. **Linear.** Recording a new entry clears the redo stack. No history tree.
6. **Not persisted.** History lives only as long as the page does, like
   selection and the viewport. A reload restores the document, not the
   session. Persisting history would mean a format change, validation and
   quarantine all over again.
7. **No size limit.** An entry is a few references to frozen elements, which
   already share their points arrays. The only real cost is that deleted
   elements stay alive for redo. A POC session will not notice. This is a
   choice, not an oversight.

### Recording

8. **The owner of an action records it when it finishes.** Nothing
   subscribes to the store and diffs scenes. ADR-0002 already put the
   gesture boundary in the interaction layer, because the store cannot know
   where a gesture ends. Explicit recording also means an undo, which writes
   through the same store, can never be recorded as a new change. A
   diff-based history would need a guard against hearing itself. **ADR-0005.**
   - `useSelectTool` records `replace(pressed, current)` when a move or resize
     ends.
   - `useDrawTool` records `add` after it commits a shape.
   - The delete key records `remove` with the index it removed from.
9. **Only a drag that started.** A click below the 3px arming threshold wrote
   nothing, so it records nothing. A drag that started records an entry even
   if it ends where it began. That entry is harmless, and deep-comparing
   elements to skip it isn't worth the code.
10. **A cancelled gesture still records.** ADR-0002 leaves the element where
    the last move put it on `pointercancel`, and that change is real and
    persisted. Without an entry it could never be undone, and undo would jump
    past it to a state that no longer matches. A cancelled *draw* has no
    entry, because the draft was never committed.
11. **Diagnostics stay outside history.** `canvasDiagnostics.fill` appends
    through `addElement` and records nothing. Every app path records, so in
    the app an entry always applies. There is no "entry no longer applies"
    handling; a test that undoing everything returns the starting scene
    stands in for it. After a `fill`, an undone delete puts the element back
    at its old index among the filled strokes. That is accepted for a dev
    tool.

### Store

12. **`removeElement(id)` returns the index it removed from,** or `-1` for an
    unknown id, still without allocating or notifying in that case. Returning
    it from the removal itself is safer than a `findIndex` beforehand: there
    is no gap between finding and removing. M12 left this for M13.
13. **New `insertElement(element, index)`** puts an element in at a given
    index, immutably, and notifies. Undoing a remove uses it to restore
    z-order. Redoing an add uses it too, so add and remove stay mirror
    images. **Insert** is the scene operation; *add* is the special case on
    top.

### Undo, redo and selection

14. **`createHistory(store)` in `src/core/history/`.** It binds to the scene
    store once, like `createPersister(store, …)`. `record(entry)`, then
    `undo()` and `redo()`, which apply an entry through the store and return
    the entry they applied, or `null` when there is nothing to apply. History
    is plain: no `subscribe`. Without undo and redo buttons nothing needs to
    redraw when "can undo" changes. Pure, no DOM, tested in node.
15. **Selection follows the entry.** After an undo or redo, the entry's
    element is selected if it is in the scene now, otherwise the selection is
    cleared. Undoing a move selects the moved element, undoing a delete
    selects the restored one, and undoing a draw clears the selection. You see
    what changed, and the selection never points at a missing id. This rule
    lives in the key hook, not in history, which never sees the editor store.
    It matches M12, where "delete = remove + deselect" sits in the key hook.
    Undo with empty history does nothing and leaves the selection alone.

### Keys

16. **Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo.** No buttons; the
    toolbar holds tools only (M12 decision 15).
17. **Ignored mid-press,** like Delete (M12 decision 17). Otherwise undo would
    revert the *previous* entry while a live drag kept writing over it.
18. **Held keys repeat.** Each repeat undoes or redoes one more entry, as in
    every editor. Handled shortcuts call `preventDefault`, so the browser's
    own Ctrl+Z / Ctrl+Y never runs underneath ours.
19. **`useDeleteKey` becomes `useEditorKeys`.** One `pressing` flag and one
    keydown listener for every editor shortcut: Delete, Backspace, undo and
    redo. Escape stays in `useSelectTool`, because it only means something
    there.

---

## Consequences

- **Persistence needs nothing new.** Undo and redo write through the store,
  which notifies, and the debounced persister saves the result. A burst of
  held-key undos coalesces into one write.
- **Every future document change must record an entry**, or undo will skip
  it. The rule lives with whoever owns the action, so it is easy to forget.
  The undo-everything test is the backstop.
- **History survives multiple tabs only as well as the document does.** Each
  tab's history describes its own scene. The multi-tab known limitation
  (`ARCHITECTURE.md`, "Persistence") is unchanged.

---

## Non-goals

- Undoing selection or tool changes. A history tree. Persisted history.
- Undo/redo buttons.
- Event-sourced storage of the document (ADR-0005 records what it would
  cost).
- Shift/Alt resize modifiers and arrow-key nudge are still open from earlier
  milestones, and still not this one.

---

## Build order

Vertical slices, as in M12: each runs from core to keys, is checked in the
browser, and is one GitHub issue.

| # | Slice | Notes |
|---|---|---|
| 1 | Undo/redo a move or resize | `src/core/history/` with `replace` entries and tests. `useDeleteKey` → `useEditorKeys` with the undo and redo keys, ignored mid-press. The selection rule. `useSelectTool` records on `pointerup` and `pointercancel`, only for a drag that started. |
| 2 | Undo/redo drawing | `insertElement` + store tests. `add` entries. `useDrawTool` records after `addElement`. |
| 3 | Undo/redo delete | `removeElement` returns the index, with store tests. `remove` entries. The delete key records. The undo-everything test across all three kinds. |
| 4 | Close-out | `ARCHITECTURE.md` "History" section and file map, the roadmap row, close-out notes here. Docs that describe code land after the code. |

---

## Close-out

M13 is done. No decision above was reversed; what differs below is detail the
decisions left open, or a small departure from their wording. The work went
out as GitHub issues #14–#17, one per build-order slice, and in that order.
The three code slices (#14–#16) each ran from core to the keys and were
checked in the browser; #17 is this close-out. The Chrome
extension was not connected for slices 2 and 3, so they were checked in a
headless Chrome driven over the DevTools protocol, with real pointer and key
events. Z-order cannot be seen with unfilled shapes, so the order was read back
from the persisted IndexedDB record.

**What differs from the plan, and why:**

- **`getEntryElementId` sits in `useEditorKeys`.** Decision 15 puts the
  selection rule in the key hook. Once there were three kinds, the hook needed
  the entry's element id for each, so a small `switch` lives beside the rule.
  It is not a method on history, which stays unaware of selection.
- **The delete key records nothing if the selected id is not in the scene.**
  It still clears the selection, as before. That way it never records a
  `remove` holding index `-1`. Nothing in the app leads there; it is a guard,
  not a feature.
- **`addElement` is still its own append.** Decision 13 calls add the special
  case of insert, and the glossary says so, but the code does not route
  `addElement` through `insertElement`. The draw tool takes the index of the
  element it just added as the last one, `getScene().length - 1`.
- **`insertElement` does not check its index.** That follows decision 11:
  there is no "entry no longer applies" path, and every caller passes an index
  history recorded.
- **The backstop drives the store, not the hooks.** The undo-everything test
  in `history.test.ts` copies each owner's recording in small helpers, because
  the React hooks have no tests (core tests run in node, ADR-0001). It was
  checked by breaking the code on purpose. Dropping a record call from one of
  its helpers fails it, and so does restoring a delete on top. A hook that
  forgot to record would not. Its first version missed the second case:
  every element above the deleted one was later undone away, so the element
  came back on top and still looked right. The starting scene now keeps an
  element above it for the whole run.
- **Only one `switch` is compiler-checked.** The `switch (entry.kind)` in
  history's private `revert` and `apply` returns nothing, so `tsc` would not
  flag a missing case for a new kind. `getEntryElementId` returns a string, so
  it would. The undo-everything test would catch a missing case in the other
  two only once it is extended to use the new kind.
- **The glossary needed one correction.** "History entry" said only *undoing*
  selects the entry's element. The rule applies after redo too, and "Insert"
  now says it serves redoing a draw as well as undoing a delete.

**Still open (non-goals, can be picked up any time):** undo and redo buttons,
which would need history to grow a `subscribe` so they can redraw when "can
undo" changes. Shift/Alt resize modifiers and arrow-key nudge are still open
from earlier milestones.
