# DRIFTWORKS — plan index & parallelization guide

Detailed, agent-runnable implementation plans derived from `docs/ROADMAP.md` (Horizon 1 + the
first Horizon-2 step). Each plan is self-contained and formatted for execution via the project's
`superpowers:subagent-driven-development` (or `executing-plans`) flow — point an agent at the file.

## The plans

| # | Plan file | Scope | Main files touched |
|---|-----------|-------|--------------------|
| 1 | `2026-06-25-ci-and-determinism-harness.md` | `npm test` runner + CI workflow + deterministic replay/hash harness | `package.json`, `.github/workflows/*`, `tests/*` (**no src**) |
| 2 | `2026-06-25-save-v3.md` | Save v3: persist inventory/research/unlocked/upgrades + v2 migration | `sim/types.ts`, `sim/world.ts`, `main.ts`, `tests/` |
| 3 | `2026-06-25-copper-circuits-and-recipes.md` | 2nd resource (copper), circuits, typed ore, `CONVERTERS`→`RECIPES`, recipe-select assembler | `sim/types.ts`, `sim/data.ts`, `sim/world.ts`, `sim/worker.ts`, `main.ts`, `ui/inspector.ts`, `tests/` |
| 4 | `2026-06-25-build-ux.md` | Erase refund, undo, blueprint copy/paste | `sim/types.ts`, `sim/world.ts`, `sim/worker.ts`, `main.ts`, `ui/hotbar.ts`, `tests/` |
| 5 | `2026-06-25-production-stats-and-minimap.md` | Production rate counters + stats panel + minimap | `sim/types.ts`, `sim/world.ts`, `main.ts`, `ui/hud.ts`, `ui/hotbar.ts`, new `ui/*`, `tests/` |
| 6 | `2026-06-25-settings-and-graphics-quality.md` | Settings panel + graphics-quality tiers (bloom/shadows/particles) | `render/renderer.ts`, `render/effects.ts`, `main.ts`, `ui/hud.ts`, `ui/hotbar.ts`, new `settings.ts` |
| 7 | `2026-06-25-onboarding-tutorial.md` | First-run tutorial + current-objective chip | `ui/*` (new `tutorial.ts`), `ui/hud.ts`, `main.ts`, CSS (**no sim**) |

**Status:** #1 (CI/determinism), #2 (save v3), #3 (copper/circuits/recipes) are **shipped** (built in
parallel worktrees, merged to `main` in order #1→#2→#3, live). #4–#7 remain to do.

## The master plan (DRIFTWORKS 1.0)

**`2026-07-05-driftworks-1.0-master-plan.md`** is the A-to-Z plan for shipping the complete
game (spec: `../specs/2026-07-05-driftworks-1.0-full-game-design.md`). Eleven sequential,
independently-shippable phases: Phase 1 **absorbs plans #4–#7 by reference** (execute them as
its sub-plans), then tooltips/UI v2 → chunked seeded world + 5 biomes + save v4 → full item
economy + tech tree v2 → fluids → power network → threat layer (Wanderer/Drifter) →
exploration/POIs → Ark endgame + menu/slots/offline → audio → release (perf/PWA/a11y/balance/
docs/1.0 tag). Execute one phase at a time; every phase ends merged, tested, deployed, and
live-verified. Supersedes the "recommended order" below once started.

(Earlier, for reference: `2026-06-25-ui-ux-redesign.md`, `2026-06-25-economy-research.md`.)

## Conflict map (why you can't naively run all 7 at once)

Every plan except #1 edits **`src/main.ts`** (the wire), so two of them running on the *same branch*
will collide there. Other shared hot-files:

- **`src/sim/world.ts`** — #2, #3, #4, #5 (#7 reads only)
- **`src/sim/types.ts`** — #2, #3, #4, #5
- **`src/sim/worker.ts`** — #3, #4
- **`src/ui/hud.ts`** — #5, #6, #7 (#3 too)
- **`src/ui/hotbar.ts`** — #4, #5, #6, #7

**#1 (CI + determinism) is the only fully conflict-free plan** — it touches no `src/`. Run it first
and/or concurrently with anything; it also gives you a determinism safety net before the sim
refactors land.

## How to run multiple agents

These plans **edit overlapping files**, so "multiple agents on the same working tree" will clobber
each other. Two safe ways to parallelize:

1. **Worktree per plan (recommended).** Give each agent its own `git worktree` + branch (the
   `superpowers:using-git-worktrees` skill, or `git worktree add ../dw-<feature> -b <feature>`), let
   it execute its plan there, then **merge branches one at a time** in the order below, resolving the
   `main.ts`/`world.ts`/`types.ts` conflicts at each merge. Re-run `npm run build` + `npm test` after
   each merge. Deploy per feature (push to `main` → Pages), as is the project norm.
2. **One lane at a time (simplest, lowest risk).** Execute the plans sequentially in the recommended
   order; each is a clean spec→build→test→deploy cycle. Slower wall-clock, zero merge pain.

If you do want concurrency, the safest split is **two lanes**:
- **Sim lane (sequential):** #1 → #2 → #3 → #4 → #5  (all share `world.ts`/`types.ts`).
- **Look/UX lane (sequential, parallel to the sim lane):** #6 → #7  (render + UI).
- Both lanes still touch `main.ts`; merge the **sim lane first**, then rebase the look/UX lane onto
  it. Keep each plan's `main.ts` edits small and localized to ease the merge.

## Recommended order (single lane)

1. **#1 CI + determinism harness** — conflict-free; protects determinism before sim refactors.
2. **#2 Save v3** — foundational, small footprint; clears the known save backlog.
3. **#3 Copper/circuits/recipes** — the big sim refactor (`CONVERTERS`→`RECIPES`, typed ore,
   multi-input). Land it **before** other sim-touchers so they build on the new model.
4. **#4 Build UX** — sim commands (undo/refund/paste); rebases onto #3's world/types.
5. **#5 Stats + minimap** — sim rate counters + UI; after the sim model settles.
6. **#6 Settings + graphics quality** — render/UI; mostly orthogonal to sim.
7. **#7 Onboarding tutorial** — UI + main; last, so it can teach the fuller feature set and merges
   onto a settled `main.ts`/`hud.ts`.

## Golden rules every executing agent must keep (from CLAUDE.md)

- **Determinism**: `src/sim/*` integer-only, command-driven, order-stable; same commands+ticks ⇒
  identical snapshots (the #1 harness enforces this).
- **`data.ts` is the single source of truth** for items/costs/recipes/tech.
- **Render/UI read snapshots; hold no game state.**
- **Commits contain NO AI attribution** (no `Co-Authored-By` / "Generated with").
- Gate every task on `npm run build`; verify visuals with headless `google-chrome` + `playwright-core`.
