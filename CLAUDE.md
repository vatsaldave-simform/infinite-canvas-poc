# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An infinite-canvas drawing engine (Excalidraw-style) built as a POC. Rendering targets a single HTML `<canvas>`. The project is built one numbered milestone at a time (M0, M1, …); the roadmap and per-milestone plans live in `.claude/plans/` (index at `.claude/plans/README.md`), not in source comments. Respect that staging — don't pull work forward from a later milestone into an earlier one unless asked. For how the pieces fit together at runtime, see `ARCHITECTURE.md`.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — start the Vite dev server
- `pnpm build` — typecheck (`tsc --noEmit`) then production build; the typecheck gate means a type error fails the build
- `pnpm lint` — run ESLint over the repo
- `pnpm preview` — serve the built `dist/`

There is no test runner wired up yet.

## Architecture

The central invariant is a **strict two-layer boundary**:

- `src/core/` — the framework-agnostic engine: scene data model, canvas rendering, hit-testing, persistence, undo. Plain data and pure logic only. **No React, no DOM assumptions** beyond standard browser APIs.
- `src/react/` — the React/UI layer. Owns DOM nodes (the `<canvas>`), wires pointer/wheel/keyboard events, and calls into `core/`.

Dependencies flow **`react/` → `core/`, never the reverse.** This is enforced at build time: `eslint.config.js` has a `no-restricted-imports` rule that makes any React import (or `@react/*` import) from within `src/core/**` an ESLint error. Do not weaken or work around this rule.

Path aliases (defined in both `vite.config.ts` and `tsconfig.json`): `@core/*` → `src/core/*`, `@react/*` → `src/react/*`. Use them instead of long relative paths.

Entry flow: `index.html` → `src/main.tsx` (React root, `StrictMode`) → `src/App.tsx` → `src/react/CanvasBoard.tsx`.

### Scene data model (`src/core/scene/`)

`types.ts` is the shared vocabulary the whole engine speaks. Key facts:

- `SceneElement` is a **discriminated union** (`type: 'rectangle' | 'ellipse' | 'freehand'`) — narrow with `switch (el.type)`; `tsconfig` has `noFallthroughCasesInSwitch` on, so keep switches exhaustive.
- A `Scene` is an ordered `SceneElement[]` where **array order is z-order** (later index = drawn on top; hit-testing walks back-to-front).
- Coordinates are **world-space**; freehand `points` are offsets from the element's `(x, y)`.
- These are pure types — no factories, id generation, or store mutation live here (that is deferred "store logic").

### Canvas / HiDPI

`CanvasBoard` sizes the canvas backing store to physical pixels (`width/height × devicePixelRatio`) while keeping the CSS size at viewport dimensions, so drawing stays crisp on HiDPI displays. Any new rendering code must account for the DPR scale factor between CSS pixels and backing-store pixels.

## Conventions

- **React 19** with `react-jsx` (no `import React` needed). TypeScript is `strict`, plus `noUnusedLocals`/`noUnusedParameters` — unused symbols fail the build.
- When building or restyling UI components, prefer the **`frontend-design`** skill for polished, non-generic design.
- When writing, reviewing, or refactoring React/Next.js code, prefer the **`vercel-react-best-practices`** skill for performance-oriented patterns.
