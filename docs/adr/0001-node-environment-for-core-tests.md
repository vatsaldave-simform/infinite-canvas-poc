# Node test environment for core tests

Tests run under Vitest's `node` environment rather than `jsdom`, because jsdom
implements no 2D canvas context — `canvas.getContext('2d')` returns `null` — so
it buys nothing for the rendering modules, while costing startup time on the
pure coordinate and geometry math that makes up most of `src/core/`. Rendering
code is instead tested by passing a hand-rolled fake `CanvasRenderingContext2D`
that records calls, asserting drawing *intent* (the sequence of `moveTo` /
`lineTo` / `stroke` and their arguments) rather than pixels.

## Considered Options

- **jsdom** — rejected: no 2D context, so `canvas/render.ts`, `canvas/grid.ts`
  and `canvas/selection.ts` would be untestable under it anyway.
- **jsdom + `node-canvas`** — rejected: a native C++ build, which would need
  adding to `onlyBuiltDependencies` and `allowBuilds` in `pnpm-workspace.yaml`,
  for pixel-level assertions this project does not need.
- **`happy-dom`** — rejected for the same reason as jsdom.

## Consequences

A test that reaches for a real DOM will fail rather than silently degrade. If
one is ever genuinely needed, set `environment: 'jsdom'` per-file with a
`// @vitest-environment jsdom` docblock instead of flipping the global default.
