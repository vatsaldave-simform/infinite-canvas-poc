# Quarantine a persisted document that cannot be loaded

When the persisted document fails validation, or carries a format version this
build does not understand, it is **quarantined**. It is moved, intact, out of
the `documents` object store into a separate `quarantine` object store, and
is never overwritten.
The app then starts with an empty scene, persists normally from then on, and
tells the user with a dismissible notice that the saved drawing could not be
loaded and was set aside. The move happens in **one readwrite transaction
across both object stores**, so the record is never in both places and never in
neither.

A document is accepted or quarantined **whole**. One bad element rejects all of
it.

If IndexedDB will not open at all (unavailable, blocked, or a security error),
there is nowhere to quarantine into. The app still mounts with an empty,
drawable scene, but **saving is off for the session**, and a notice says so.

The failures this answers are M10's load-path findings
(`.claude/plans/m10-findings.md`, `.claude/plans/m10-break-localstorage.md`).
L1: a value that could not be read took the whole app down. L2: an
unrecognised element became invisible and hit-tested true everywhere. L3: a
newer format broke the render loop while the app still looked alive. ADR-0003
deliberately left open what the user sees when a document will not load. This
is that answer.

## Considered Options

- **Read-only session.** Start empty, leave the bad document in place, and
  write nothing for the rest of the session. Rejected for the load-failure
  case. It preserves the document, but at the cost of everything the user
  draws next: an hour's work disappears on the next reload, and the same bad
  document blocks every boot after that. A failed load becomes a permanently
  unusable app. Quarantine preserves the document *and* gets it out of the
  way. This option survives as the fallback for an IndexedDB that will not
  open, because then there is no object store to move the document into, and
  not writing is the only move that destroys nothing.
- **Hard stop.** Refuse to mount and show an error screen. Rejected. It is
  finding L1 with better manners: total, and with no route forward for a user
  without devtools. There is a case for it with a newer-format document, since
  an old build arguably should not touch it. But quarantine already guarantees
  that the old build never destroys it, so stopping buys nothing more.
- **Overwrite.** Start empty and let the next persist replace whatever was
  there. Rejected firmly. It is the simplest option, and it destroys data the
  app merely failed to understand. That includes a perfectly good document
  written by a *newer* build, which is exactly the case the format version
  exists to detect. The loss is permanent and the user never learns it
  happened.
- **Per-element salvage.** Keep the valid elements, drop the invalid ones.
  Rejected. It looks like the kind option and is the most dangerous one. The
  dropped elements vanish silently. The next persist then makes the partial
  document the only copy, so a recoverable failure becomes permanent loss.
  Partial loads also have no good answer for duplicate ids (which of the two
  survives?) or for a newer format (most of a document a newer build
  understood fully is not a document). All-or-nothing keeps the original whole
  in quarantine, where it can still be recovered.

## Consequences

**Quarantine is a second object store, and it only grows.** Records are kept
forever under an auto-increment key. Each one holds the raw stored value
untouched, the reason (`invalid` or `unknown-format-version`), the path of the
first validation error (for example `elements[37].type`), and a timestamp.
Growth is bounded by how often loads fail, which should be close to never. No
pruning is built.

**Recovery is devtools-only.** There is no UI to inspect, restore or delete a
quarantined document. That would be a document-management feature, and this
project has none. What quarantine guarantees is that recovery is *possible*,
not that it is convenient.

**A downgrade orphans the newer document.** Open a newer-format document in an
older build and the newer document is quarantined. The older build then
persists its own fresh version-1 document. Going back to the newer build loads
that version-1 document, not the quarantined one. Nothing is lost, but nothing
moves back automatically either.

**Validation has to report a reason and a location, not just pass or fail.**
The validator distinguishes "not understood" (a newer format version) from
"invalid", and returns the path of the first error. Without both, a quarantine
record says only that something went wrong, somewhere.

**Loading never throws into React.** Every outcome resolves to a known state:
loaded, quarantined, or storage unavailable. So the load path still needs no
error boundary, and the one ADR-0003 deferred to this decision is not added.

**"Saving is off" has to be visible.** The open-failure fallback is a session
that does not persist. Without a notice it would be finding Q3 by choice: a
canvas that looks like it is saving and is not.
