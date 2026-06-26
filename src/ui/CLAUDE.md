# src/ui — DOM overlay HUD

A DOM/CSS overlay on top of the Three.js canvas. **Reads `Snapshot`s + `src/sim/data.ts`;
presentation only — no game logic** (the one exception, `placement.ts`, is a pure predicate over
the snapshot, unit-tested). Touch-first: big targets, joystick, drag-to-build.

## Files
- **`hud.ts`** — thin orchestrator. `buildHud(root, cb): Hud` composes the components below and
  exposes the `Hud` surface (`setStats`, `setResearch`, `setDir`, `setPaused`, `setSpeed`,
  `showInspect`/`hideInspect`, `pushToast`) + `HudCallbacks` to `main.ts`. Keep this surface stable;
  `main.ts` depends on it.
- **`statusbar.ts`** — top panel: pulse, power bar, inventory ore/plate/science (with icons).
- **`hotbar.ts`** — icon tiles (build tools + erase/inspect) with cost labels, **lock state**
  (`setUnlocked`), number-key shortcuts, and a control dock (Build dir, View, Pause, Speed, Explain,
  Research, Reset).
- **`research.ts`** — the tech-tree panel (renders `TECHS` from `sim/data`, select + contribute).
- **`inspector.ts`** — machine info popup (rows support a progress `bar` and an `icon`).
- **`toasts.ts`** — transient messages (`pushToast`).
- **`joystick.ts`** — virtual thumbstick for walking.
- **`icons.ts`** — inline SVG icon set (`ICONS` + `svgEl`); all `stroke="currentColor"`.
- **`placement.ts`** — `placementValid(cell, tool, snapshot)` pure fn (unlocked + affordable + valid
  cell). Unit-tested in `tests/placement.test.ts`.
- **`theme.css`** — design tokens (colors/spacing/radii/shadows). **`../style.css`** — component styles.

## Conventions
- New HUD bits consume the **theme tokens** (`var(--accent)`, `var(--panel)`, …) — don't hardcode colors.
- Costs/tech come from `sim/data.ts`, never re-declared here.
- After UI changes, verify visually with a headless screenshot (see root `CLAUDE.md`); `npm run build` must stay green.
