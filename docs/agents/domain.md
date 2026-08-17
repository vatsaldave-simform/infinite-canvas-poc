# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** One `CONTEXT.md` and one `docs/adr/` at the repo root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If a root `CONTEXT-MAP.md` ever appears, this repo has become multi-context: read it
first and follow it to the per-context `CONTEXT.md` files relevant to the topic, plus
any `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-scene-element-discriminated-union.md
│   └── 0002-strict-core-react-boundary.md
└── src/
```

## Also read, in this repo

- **`ARCHITECTURE.md`** — how the pieces fit together at runtime.
- **`.claude/plans/`** (index at `.claude/plans/README.md`) — the M0–M13 milestone
  roadmap. Respect the staging: don't pull later-milestone work into an earlier one.

These are existing conventions, not created by this setup. `CONTEXT.md` and
`docs/adr/` remain the domain glossary and decision record, created lazily by
`/domain-modeling`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
