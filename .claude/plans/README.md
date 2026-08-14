# Milestone Plans — Index

Infinite-canvas drawing POC (Excalidraw-style), a **learning project** built strictly **one milestone at a time**. Each milestone gets its **own** plan file in this directory, authored when we start that milestone (we do not pre-write future milestones).

**Category legend:** **[A]** = the user writes the core logic themselves (Claude gives interface + concept + review, not the implementation). **[B]** = Claude writes it (scaffolding/boilerplate). See `working-style` in project memory.

| Milestone | Scope | Category | Status | Plan file |
|---|---|---|---|---|
| M0 | Repo scaffolding | B | ✅ done | — |
| M1 | Element data model | B | ✅ done | — |
| M2 | World↔screen transform (+ zoom-around-cursor) | A | ✅ done | — |
| M3 | Pan & zoom interaction | A math / B wiring | ✅ done | — |
| M4 | Render loop + per-element draw fns | B | ✅ done | — |
| M5 | Draw tool — click-drag to create shapes (rectangle, ellipse, freehand) | B wiring / A state | ✅ done | [`m05-draw-tool.md`](m05-draw-tool.md) |
| M6 | Hit testing (point-in-rect/ellipse, near-path) | A | ✅ done | [`m06-hit-testing.md`](m06-hit-testing.md) |
| M7 | Selection tool (single-select) | B wiring / A state | ✅ done | [`let-s-plan-milestone-7-linked-sphinx.md`](let-s-plan-milestone-7-linked-sphinx.md) |
| **M8** | **Move selected element** | **A** | **⬅ next** | *(added when started)* |
| M9 | Persistence pass 1: localStorage | B / discuss | ⬜ | *(added when started)* |
| M10 | Deliberately break localStorage | discuss / A | ⬜ | *(added when started)* |
| M11 | Persistence pass 2: IndexedDB migration | A / B | ⬜ | *(added when started)* |
| M12 | Resize + Delete | mix | ⬜ | *(added when started)* |
| M13 | Undo/redo command stack | A | ⬜ | *(added when started)* |

**Out of scope (do not build):** multi-select / rubber-band, freehand smoothing beyond basic capture, text / arrows / connectors, PNG/JSON export, realtime collab, any backend.

> Notes: M0–M7 are complete — runtime design is documented in `ARCHITECTURE.md`. M5 shipped all three draw tools (rectangle, ellipse, freehand). M6 added `src/core/scene/hit-test.ts` (point-in-rect/ellipse, near-path). M7 replaced the M6 console probe with real single-select: a separate `src/core/editor/store.ts` (`createEditorStore`, id-based selection), `src/core/scene/bounds.ts` (`getBoundingBox`), a `drawSelectionBox` overlay, plus Escape-to-deselect, hover cursor, and auto-select-after-draw. The earlier combined M3→M4 plan is at `~/.claude/plans/what-milestone-is-next-idempotent-pearl.md`.
