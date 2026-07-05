# DRIFTWORKS 1.0 — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan **one phase at a time**.
> Steps use checkbox (`- [ ]`) syntax for tracking. Each phase is independently shippable —
> build → test → merge → deploy before starting the next.

**Goal:** Ship DRIFTWORKS as a complete, winnable single-player factory game — menu → tutorial →
four science tiers across five biomes → optional threat layer → Ark victory → Infinite Mode —
per the approved spec `docs/superpowers/specs/2026-07-05-driftworks-1.0-full-game-design.md`
(read it first; it is the source of truth for all content tables and behavior).

**Architecture:** Deterministic integer sim in a Web Worker (`src/sim/`), Three.js isometric
renderer (`src/render/`), DOM HUD (`src/ui/`), wired by `src/main.ts` through the
`Command`/`Snapshot` contract in `src/sim/types.ts`. All content (items, recipes, techs, biomes,
enemies, achievements) is declarative data in `src/sim/data.ts` + sibling data modules.

**Tech Stack:** TypeScript strict · Vite 5 · Three.js · Web Worker · tsx test runner ·
GitHub Actions → Pages · PWA. No backend, no new runtime deps without strong cause.

## Global Constraints (every task inherits these)

1. **Determinism is sacred.** `src/sim/*`: integer-only state, no `Date.now`/`Math.random`/
   `performance.now`/IO; iterate order-stably (sort cells/ids). Same commands + same tick
   count ⇒ identical snapshots. Worldgen uses seeded integer hash noise only.
2. **`tests/determinism.test.ts` bakes a golden snapshot hash.** Any sim/snapshot change breaks
   it **by design** — re-baseline (`npm test` prints `got <hash>`) as part of the same commit.
3. **Single source of truth:** all tunables live in `src/sim/data.ts` (or sibling `data_*.ts`
   modules it re-exports). UI/render import them; never re-declare costs/recipes/tech.
4. **Render & UI read snapshots; they own no game state.** New player actions = new `Command`
   variants. Player position stays client-side (renderer); it never enters the sim.
5. **The gate:** `npm run build` (tsc + vite) **and** `npm test` green before every commit.
   CI (`.github/workflows/deploy.yml`) gates deploy on the same.
6. **Commits: NO AI attribution** — no `Co-Authored-By`, no "Generated with".
7. **Mobile first:** touch targets ≥ 40 px, one-handed reachable, 60 fps target on mid phones;
   pixel ratio cap stays; dispose GPU resources on rebuild.
8. **UI consumes theme tokens** (`var(--accent)`, `var(--panel)`, …) from `src/ui/theme.css`;
   icons via `src/ui/icons.ts` (`stroke="currentColor"`).
9. **Per-folder rules** in `src/sim/CLAUDE.md`, `src/render/CLAUDE.md`, `src/ui/CLAUDE.md`
   apply verbatim; update those files when a phase changes their described surface.

## How to execute this plan

- [ ] **One phase at a time, in order.** Do not parallelize phases on one branch — nearly every
  phase touches `src/main.ts`, `src/sim/world.ts`, `src/sim/types.ts`. If you parallelize,
  use one git worktree per phase (`superpowers:using-git-worktrees`) and merge in phase order.
- [ ] **Phase kickoff protocol (required):** this master plan fixes each phase's scope,
  contracts, data, tests, and acceptance — but NOT every function body. At the start of each
  phase (Phase 2 onward; Phase 1's sub-plans already exist), first **write the detailed
  per-phase plan**: read the spec section + the phase below + the current code, then produce
  `docs/superpowers/plans/phases/phase-N-<slug>.md` in the same task/step format as the
  existing plans #4–#7 (exact files, code, test bodies, commands), using the
  superpowers:writing-plans skill. Commit it, then execute it task-by-task. The master plan
  wins on any contract/data conflict; if reality forces a contract change, update this file
  in the same commit and say why.
- [ ] Per phase: create a branch `phase-N-<slug>` → execute its tasks with TDD (write the
  failing test → see it fail → implement minimally → see it pass → commit) → run the full
  suite → re-baseline the determinism hash if sim changed → `npm run build` → merge to `main`
  → push (CI deploys) → verify live hash matches local `dist/` → update `docs/` state
  (PLAN-INDEX status, CLAUDE.md backlog note) → next phase.
- [ ] Each phase below lists **Contract deltas** (exact type/data changes — these ARE the
  design; copy them faithfully), **Tasks** (each with files, tests, steps), and **Acceptance**
  (behavior a reviewer checks in the running game, plus pacing/perf where relevant).
- [ ] When a task says "verify visually", use headless Chrome/Playwright screenshots
  (project norm, see root `CLAUDE.md`), on desktop AND a 390×844 mobile viewport.
- [ ] Balance numbers come from the spec §3 tables. If a number proves unplayable during a
  phase's playtest step, tune it **in `data.ts` only** and note it in the commit message.

## Phase map

| # | Phase | Ships | Main areas |
|---|-------|-------|-----------|
| 1 | Foundation UX (absorbs plans #4–#7) | undo/blueprints, stats+minimap, settings, tutorial v1 | sim cmds, ui, render |
| 2 | Tooltips & UI v2 | unified tooltips, build categories, inspector diagnostics, alerts, research graph, help | ui, types |
| 3 | World engine | 256×256 chunked seeded world, 5 biomes, fog, map view, richness, day/night, save v4 | sim, render, ui |
| 4 | Production depth | items (gear/wire/steel…), 4 science packs, tech tree v2, splitter/underground, leveled upgrades | sim data, ui |
| 5 | Fluids & oil | pipes/pumps/pumpjack/refinery/chem plant, plastic, adv circuits | sim, render, ui |
| 6 | Power network | boiler+steam, solar+accumulator, priorities, power graph | sim, ui |
| 7 | Threat layer & modes | Wanderer/Drifter, pollution, raids, walls/turrets/ammo, HP/repair | sim, render, ui |
| 8 | Exploration | POIs (ruins/salvage/rich nodes), hazards live, radar, heater, rover (stretch) | sim, render |
| 9 | Endgame & meta | Ark, victory, Infinite Mode, achievements, main menu, save slots, offline progress | sim, ui, main |
| 10 | Audio | AudioManager, SFX, per-biome music, settings mix | main, ui, assets |
| 11 | Release | perf budget, code splitting, PWA, a11y, balance pass, tutorial v2, README/docs, tag 1.0 | all |
| 12 | Launch & distribution | itch.io page, portal submissions, press kit, community posts, feedback loop | docs, assets (human-gated) |

> **Evidence base:** the spec's §9 research addendum records why several tasks below exist
> (mid-game drop-off at tiers 2–3, first-session pacing targets, QoL canon, IndexedDB saves,
> distribution funnel). Read it before re-scoping anything.

---

## Phase 1 — Foundation UX (absorb existing plans #4–#7)

**Goal:** land the four already-written, unbuilt plans. They are complete, task-level plans —
execute each **as written**, in this order, treating each as a sub-plan of this phase:

- [ ] **1.1** `docs/superpowers/plans/2026-06-25-build-ux.md` — erase refund, undo (last 10
  placements), blueprint copy/paste. (Sim commands + hotbar.)
- [ ] **1.2** `docs/superpowers/plans/2026-06-25-settings-and-graphics-quality.md` — settings
  panel + graphics-quality tiers (bloom/shadows/particles toggles, quality auto-detect).
- [ ] **1.3** `docs/superpowers/plans/2026-06-25-production-stats-and-minimap.md` — per-item
  rate counters (1/5/15-min windows), stats panel, corner minimap.
  **Deviation note:** build the minimap render off a `MinimapLayer` snapshot field (per-tile
  color indices) rather than reading `ore[]` directly — Phase 3 will swap the layer's source
  to chunk summaries + fog without touching the UI component.
- [ ] **1.4** `docs/superpowers/plans/2026-06-25-onboarding-tutorial.md` — first-run tutorial
  v1 + current-objective chip. (Phase 11 extends the step list to the full game; keep steps
  declarative in a `TUTORIAL_STEPS` array so extension = data.)
- [ ] **1.5** After each sub-plan: full gate (build + tests + determinism re-baseline if sim
  changed), merge, deploy, verify live. Update `PLAN-INDEX.md` status per sub-plan.

**Acceptance:** all four plans' own acceptance criteria; plus: fresh phone load walks through
tutorial v1; undo reverses a misplaced building with cost refund; stats panel shows a live
ore/min figure; settings persist across reload (localStorage `dw-settings`, not the save).
**FTUE pacing targets (stopwatch a real run):** first placed miner ≤ 2 min, first automated
belt line ≤ 8 min, tutorial completable ≤ 12 min — first-session length predicts retention
(spec §9.2); if a step drags, cut friction from the step, not depth from the game.

---

## Phase 2 — Tooltips & UI v2

**Goal:** the "explains itself" layer — one tooltip system used by every surface, build-menu
categories, inspector diagnostics, structured alerts, research tree graph, help panel.

**Files:** Create `src/ui/tooltip.ts`, `src/ui/buildmenu.ts`, `src/ui/alerts.ts`,
`src/ui/help.ts`, `src/ui/researchgraph.ts`, `tests/blocked.test.ts`. Modify `src/sim/types.ts`,
`src/sim/world.ts`, `src/sim/data.ts`, `src/ui/hud.ts`, `src/ui/hotbar.ts`,
`src/ui/inspector.ts`, `src/ui/research.ts`, `src/main.ts`, `src/style.css`.

**Contract deltas (exact):**

```ts
// types.ts — ModuleView gains a machine-diagnosis field (computed in sim, shown by UI):
export type Blocked = 'no_power' | 'no_input' | 'output_full' | 'no_recipe' | 'no_deposit';
export interface ModuleView { /* …existing… */ blocked?: Blocked; }

// types.ts — Snapshot gains structured alerts (ring buffer, newest last):
export interface AlertView { id: number; kind: 'low_power' | 'storage_full' | 'research_done'
  | 'raid' | 'ark_stage'; cell?: number; tick: number; }
export interface Snapshot { /* …existing… */ alerts: AlertView[]; }

// data.ts — per-module & per-item long descriptions for tooltips (single source of truth):
export const MODULE_INFO: Record<ModuleType, { desc: string; hint: string }>;
export const ITEM_INFO: Record<ItemType, { desc: string }>;
// EXPLAIN map is DELETED (folded into MODULE_INFO.hint); remove the Explain toggle from
// hotbar/main/renderer (setExplain) — tooltips replace it.
```

**Tasks:**

- [ ] **2.1 Sim: `blocked` diagnosis + alerts.**
  Test first (`tests/blocked.test.ts`): a smelter with no ore in buffer reports
  `blocked === 'no_input'`; cut power (remove generator) ⇒ `'no_power'`; fill output ⇒
  `'output_full'`; miner off-deposit ⇒ `'no_deposit'`. Alerts: dropping into power deficit
  appends one `low_power` alert (not one per tick — latch until recovered); completing
  research appends `research_done`. Implement in `world.ts` `advance()`/`snapshot()`; alerts
  ring buffer capped at 20, ids monotonic. Re-baseline determinism hash. Commit.
- [ ] **2.2 `tooltip.ts` — one component.**
  API: `attachTooltip(el: HTMLElement, content: () => TooltipContent)` where
  `TooltipContent = { title: string; lines: { icon?: string; text: string }[]; }`.
  Desktop: show on hover after 300 ms; touch: show on long-press (500 ms), dismiss on release.
  One singleton DOM node, positioned clamped to viewport, styled from theme tokens.
  Wire onto: hotbar tiles (name, cost, MODULE_INFO), statusbar item counts (ITEM_INFO),
  research nodes (cost, unlocks), stats rows. Visual check both viewports. Commit.
- [ ] **2.3 In-world tooltip via inspector v2.**
  Inspector (tap a machine) adds: recipe picker row (already exists), live in/out rates
  (from Phase-1 stats counters), and a red "Blocked: no input" line mapping `Blocked` →
  plain language from a `BLOCKED_LABEL` table in `data.ts`. Commit.
- [ ] **2.4 `buildmenu.ts` — categories.**
  `data.ts`: `export const MODULE_CATEGORY: Record<ModuleType, 'logistics'|'production'|'power'|'military'|'misc'>`.
  Hotbar shows 5 category tabs (icons) + the tools of the active category; keyboard 1–9 still
  works within category; current single-row behavior kept when ≤9 total unlocked tools
  (i.e. UI upgrades itself only when needed). Commit.
- [ ] **2.5 `alerts.ts` — HUD alert feed.**
  Renders `snapshot.alerts` deltas as toasts with an icon + optional "Go" button; "Go" pans…
  the camera can't pan freely (follow-cam) — instead "Go" sets a **beacon marker** the player
  can walk toward (arrow at screen edge pointing to the cell). Marker render in
  `renderer.ts` (`setMarker(cell|null)`). Commit.
- [ ] **2.6 `researchgraph.ts` — tree graph v2.**
  Replace the list panel: nodes laid out by tier columns (computed from prereq depth),
  SVG dependency lines, pan/zoom (pointer events), search box filter, tap = select, and a
  **queue** (up to 5): `Command` gains `{ type:'research'; action:'queue'; tech: string }`;
  `world.ts` auto-selects the next queued tech on completion (test: queue two techs, finish
  first ⇒ second becomes active). Works with today's 8 techs; must scale to ~30 (Phase 4).
  Commit.
- [ ] **2.7 `help.ts` — "?" panel.** Static content from `data.ts` strings: controls list
  (desktop + touch), the loop explained in 6 lines, "replay tutorial" button (re-arms
  tutorial state), link out to the repo. Commit.
- [ ] **2.8 Remove Explain mode** (hotbar button, `setExplain`, caption sprites in renderer,
  `EXPLAIN` map) — dead per tooltips. Commit.
- [ ] **2.9 Alt-overlay** (genre-canon readability, spec §4/§9.4). HUD toggle (hotbar dock
  button + `V` key): renderer draws each machine's recipe-output item icon as a billboard
  sprite above it (`setAltOverlay(on)`; sprites pooled, built from `ITEM_COLOR` + icon
  shapes, culled with the module). Persisted in settings. Visual check at 1k modules
  (sprite batching, no per-frame allocation). Commit.
- [ ] **2.10 Pipette.** With no tool armed, long-press (touch) / right-click (desktop; `Q`
  is taken by camera rotate) on a placed machine arms that module type as the build tool
  with the machine's `dir` and (via the Phase-1 blueprint plumbing) its recipe. Pure
  main/UI — no sim change. Toast "Tool picked: Smelter". Commit.
- [ ] **2.11 Recipe codex + ratio hints.** `src/ui/codex.ts`: searchable item list; each item
  shows "made by" (recipes producing it, with machine + inputs) and "used in" (recipes/
  build costs/techs consuming it) — computed once from `RECIPES`/`BUILD_COSTS`/`TECHS` at
  build time (pure data walk, unit-testable: `tests/codex.test.ts` asserts every item has
  ≥1 source or is a raw deposit). Tooltips on recipes gain ratio hints: "1 assembler
  consumes the output of N smelters" computed from `time`/`outputCount`/input amounts —
  helper `ratioLine(recipe, RECIPES)` in `codex.ts`, unit-tested. Open from: item tooltips'
  "?" affordance + Help panel. Full gate; visual check; deploy.

**Acceptance:** every interactive HUD element answers "what is this and why can't I use it"
via hover/long-press; a blocked smelter says why in the inspector; research is a legible
graph with a working queue; alerts arrive with working beacons; alt-overlay makes a mixed
base readable at a glance; pipette + codex work on touch; no Explain remnants.

---

## Phase 3 — World engine: chunks, seed, biomes, fog, map, save v4

**Goal:** replace the fixed 40×26 grid with a 256×256 seeded, biome-partitioned, fog-of-war
world with finite-richness deposits and a day/night clock, persisted as save v4 — without
breaking determinism or mobile perf.

**Files:** Create `src/sim/worldgen.ts`, `src/sim/data_biomes.ts`, `src/ui/mapview.ts`,
`tests/worldgen.test.ts`, `tests/savev4.test.ts`. Modify `src/sim/types.ts`, `src/sim/world.ts`,
`src/sim/worker.ts`, `src/sim/data.ts`, `src/render/renderer.ts`, `src/render/scenery.ts`,
`src/render/style.ts`, `src/ui/hud.ts`, `src/main.ts`, `tests/_harness.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type BiomeId = 'dust' | 'ridge' | 'canopy' | 'ember' | 'hollows';
export type OreType = 'iron' | 'copper' | 'coal' | 'sulfur' | 'crystal' | 'oil';
export const WORLD_W = 256; export const WORLD_H = 256; export const CHUNK = 32;

export interface DepositView { cell: number; type: OreType; richness: number } // richness int
export interface Snapshot {
  // w/h stay but now 256×256; modules/packets/deposits are WINDOWED (see below):
  window: { x: number; y: number; w: number; h: number };   // tile rect the views cover
  deposits: DepositView[];         // replaces ore[]/oreType[] (windowed)
  biome: BiomeId[];                // per-tile biome of the window rows (w*h of window)
  discovered: Uint8Array;          // 1 bit/tile packed, FULL map (256*256/8 = 8 KB)
  minimap: Uint8Array;             // per-chunk dominant color index (8×8 chunks = 64 bytes)
  dayPhase: number;                // 0..DAY_TICKS-1, deterministic from tick
}
// Command additions:
| { type: 'init'; seed: number; }            // seed now required at init
| { type: 'window'; x: number; y: number; w: number; h: number } // main thread follows player
| { type: 'reveal'; cells: number[] }        // fog reveal (batched from player position)
```

```ts
// worldgen.ts — pure, seeded, integer. Public surface:
export function hash2(seed: number, x: number, y: number): number; // 32-bit int hash (splitmix-style)
export function generate(seed: number): { biome: BiomeId[]; deposits: Map<number, {type: OreType; richness: number}> };
// Biome layout: 5 fixed regions (starter 'dust' centered at 64,128; 'ridge' N; 'canopy' E;
// 'ember' S; 'hollows' far E), boundaries wobbled by hash noise, blended ~4 tiles.
// Deposits per data_biomes.ts tables (density, richness range, which OreType).
// Guaranteed starter kit within 24 tiles of spawn (walkable spawn, iron ≥2 patches, coal ≥1,
// copper ≥1 small, water shore ≥1) — assert in tests, never trust the noise.
```

```ts
// data_biomes.ts (re-exported from data.ts)
export interface BiomeDef { id: BiomeId; name: string; palette: number[]; deposits:
  { type: OreType; density: number; richness: [number, number] }[]; hazard: 'storm' | 'cold'
  | 'spores' | 'lava' | 'dark'; }
export const BIOMES: BiomeDef[]; // 5 rows per spec §3.5
export const DAY_TICKS = 4800;   // ~10 min at 125 ms/tick
```

- **Save v4** (`SaveState.version: 4`): adds `seed`, `deposits` (cell,type,richness — only
  non-virgin cells; virgin cells regenerate from seed), `discovered` (base64 bitset),
  `dayPhase` — plus everything from v3. **Migration from v3:** new seeded world; carry over
  `inventory`, `research`, `unlocked`, `upgrades`; drop old modules/map; show a one-time
  migration toast ("The world has grown — your research and inventory came with you.").
- **Windowing:** worker keeps the full world; main sends `window` follow-commands (player tile
  ± ~24); snapshots carry only windowed modules/packets/deposits/biome + full-map bitsets +
  aggregates. Renderer builds terrain per chunk lazily, disposes chunks far outside the window.
- **Sim scaling:** `world.ts` keeps `modules` in a `Map<number, Module>` iterated over sorted
  keys (already the rule); belts/packets unchanged. Deposits: mining decrements richness;
  at 0, yield drops to 1 item per 10 cycles (the 10% trickle — anti-soft-lock).
- **Fog is game state, owned by the sim** (radar in Phase 8 also reveals); reveal arrives as
  a command so replays stay deterministic.

**Tasks:**

- [ ] **3.1 `worldgen.ts` + tests.** Write `tests/worldgen.test.ts` first: same seed twice ⇒
  deep-equal outputs; different seeds differ; starter guarantees hold for seeds 1–50; biome
  at spawn is `dust`; deposit counts per biome within data-table bounds. Implement (hash2 =
  integer splitmix; region layout; deposit scatter via hash threshold). Commit.
- [ ] **3.2 Types + world.ts integration.** Grid → 256×256; deposits Map; window state +
  command; reveal command + bitset; dayPhase counter in `advance()`. Update `_harness.ts`
  (tests init with a fixed seed + a full-map window so existing suites keep passing).
  All suites green; re-baseline determinism hash. Commit.
- [ ] **3.3 Save v4 + migration.** `tests/savev4.test.ts`: round-trip save/load equality on a
  built-up world (modules, richness partially mined, fog, dayPhase); v3 fixture migrates
  (inventory/research kept, world fresh, version bumped); corrupted JSON ⇒ fresh start, no
  crash. Implement in `world.ts` serialize/load + `main.ts` storage layer. Commit.
- [ ] **3.4 Renderer: chunked terrain + biome palettes.** `scenery.ts` builds per-chunk
  ground meshes (instanced scatter per biome palette from `style.ts`); chunks created/disposed
  as the window moves (test manually: walk 100 tiles, memory stable — check
  `renderer.info.memory.geometries` plateaus). Fog: undiscovered chunks render as dark voids
  (flat dark plane), no scenery. Day/night: directional-light intensity + sky color lerp from
  `dayPhase`. Visual check all 5 biomes via a debug teleport (dev-only URL param `?tp=x,y`).
  Commit.
- [ ] **3.5 `mapview.ts` + minimap rewire.** Full-screen map: renders the discovered bitset +
  chunk minimap colors + deposit dots + player + beacon markers onto a `<canvas>`; pan/zoom;
  tap sets the beacon (reuses Phase-2 marker). Minimap (Phase 1) now sources the same data.
  Commit.
- [ ] **3.6 Spawn & bootstrap rebalance.** Starter base seeding (`placeRaw` chain) uses the
  guaranteed starter deposits; `START_INVENTORY` unchanged. Playtest from scratch to first
  smelter < 10 min. Commit.
- [ ] **3.7 Save storage hardening (spec §6/§9.5).** Create `src/storage.ts` (main thread
  only): IndexedDB-backed save store (`idb`-free, raw API — one object store `saves`, keys
  `slot0..2`, values `{a: SaveState, b: SaveState, latest: 'a'|'b'}`), **A/B rotating
  writes** (alternate targets; on load prefer `latest`, fall back to the sibling if parse/
  validate fails), one-time migration read from the legacy localStorage key,
  `navigator.storage.persist()` requested once (after the first research completes — that's
  "meaningful progress"), and `exportSave(): string` / `importSave(s)` using
  `CompressionStream('gzip')` + base64 with a `DW4:` prefix (Settings gains Export/Import
  buttons — import confirms before overwrite). Tests (`tests/storage.test.ts`, run under a
  fake-indexeddb shim as a devDependency): A/B rotation survives a corrupted `latest`;
  export→import round-trips; legacy migration. Full gate; deploy; verify live.

**Acceptance:** new game on a phone: seeded 256×256 world, five visibly distinct biomes,
fog reveals as you walk, map view + minimap agree, deposits deplete visibly in inspector,
day/night visibly cycles, save v4 survives reload mid-exploration, v3 saves migrate with the
courtesy toast, determinism suite green with new baseline.

---

## Phase 4 — Production depth: items, science packs, tech tree v2

**Goal:** the full solid-item economy and the 5-branch tech tree with leveled upgrades and
pack-tiered science.

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts` (grows: full items/RECIPES/TECHS),
`src/sim/world.ts`, `src/ui/icons.ts`, `tests/recipes.test.ts`, `tests/research.test.ts`,
`tests/placement.test.ts`. Create `tests/economy_graph.test.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type ItemType = 'ore' | 'copper_ore' | 'coal' | 'sulfur' | 'crystal'
  | 'plate' | 'copper_plate' | 'gear' | 'wire' | 'circuit' | 'steel' | 'plastic'
  | 'adv_circuit' | 'refined_crystal' | 'frame' | 'drift_fuel' | 'ammo'
  | 'science' | 'science2' | 'science3' | 'science4';
export type ModuleType = /* existing 7 */ | 'splitter' | 'underground';
// Upgrades become LEVELED:
export type UpgradeId = 'miner_speed' | 'smelter_speed' | 'gen_output' | 'belt_speed'
  | 'storage_cap' | 'power_eff' | 'ammo_dmg' | 'turret_range';
// Snapshot + SaveState: upgrades: Partial<Record<UpgradeId, number>>  (level ≥ 1)
```

New recipes (add to `RECIPES`): `assemble_gear` (2 plate → 1 gear, t6 p3), `assemble_wire`
(1 copper_plate → 2 wire, t4 p2), `assemble_circuit` (**changed**: 1 plate + 2 wire →
1 circuit, t10 p4), `smelt_steel` (5 plate → 1 steel, t24 p5), `assemble_science`
(**changed**: 1 gear + 1 copper_plate → 1 science, t8 p3), `assemble_science2` (1 circuit +
1 gear → 1 science2, t12 p4), `assemble_science3` (1 plastic + 1 steel → 1 science3, t16 p5),
`assemble_science4` (1 adv_circuit + 1 refined_crystal → 1 science4, t20 p6), `assemble_ammo`
(1 plate + 1 copper_plate → 2 ammo, t8 p3), `assemble_frame` (2 steel + 2 gear → 1 frame,
t14 p5). Recipes whose inputs arrive later (science3/4 chains) exist as data now but are
unreachable until their techs — `economy_graph.test.ts` checks producibility along the DAG.

**Full TECHS v2 — the master reference table.** Keep the existing 8 ids for save compat;
`automation` additionally unlocks `assemble_gear` + `assemble_wire`. Labs consume the tech's
`costItem` as today (packs are items — no lab rework). Add each row **in the phase where its
grants gain behavior** (this phase: through the `heaters` row; the rest land with Phases 5–9;
`economy_graph.test.ts` enforces that every granted id exists when the row lands):

| branch | id | cost | prereqs | grants |
|---|---|---|---|---|
| prod | smelting *(exists)* | 20 ore | — | smelter |
| power | power *(exists)* | 30 ore | smelting | generator |
| prod | automation *(ext)* | 30 plate | power | assembler, lab, assemble_gear, assemble_wire |
| prod | copper_basics *(exists)* | 40 plate | automation | smelt_copper, assemble_circuit |
| prod | mining_prod / smelt_eff / power_grid *(exist)* | as today | automation | lv-1 upgrades |
| prod | steel_making | 60 science | copper_basics | smelt_steel |
| sci | sci2 | 50 science | copper_basics | assemble_science2 |
| logi | splitters | 40 science | automation | splitter |
| logi | undergrounds | 50 science | splitters | underground |
| logi | belt_speed_1 / 2 / 3 | 60 science / 100 science2 / 160 science3 | chain | belt_speed lv1/2/3 |
| logi | storage_2 | 80 science2 | sci2 | storage_cap lv1 |
| power | steam_power | 70 science | power | boiler, steam_engine *(Phase 6)* |
| power | solar_power | 120 science2 | steam_power | solar *(Phase 6)* |
| power | accumulators | 140 science2 | solar_power | accumulator *(Phase 6)* |
| power | efficiency | 150 science3 | accumulators | power_eff lv1 *(Phase 6)* |
| prod | oil_processing | 80 science2 | sci2 | pipe, pump, pumpjack, refinery, refine_petroleum *(Phase 5)* |
| prod | plastics | 100 science2 | oil_processing | chem_plant, make_plastic *(Phase 5)* |
| sci | sci3 | 80 science2 | plastics | assemble_science3 *(Phase 5)* |
| prod | adv_electronics | 120 science3 | plastics, sci3 | assemble_adv_circuit *(Phase 5)* |
| sci | sci4 | 100 science3 | adv_electronics | assemble_science4 *(Phase 5)* |
| prod | crystal_refining | 120 science3 | adv_electronics | refine_crystal *(Phase 5)* |
| prod | fuel_tech | 140 science4 | crystal_refining | make_drift_fuel *(Phase 5)* |
| mil | fortification | 50 science | automation | wall *(Phase 7)* |
| mil | turrets_tech | 80 science | fortification | turret, assemble_ammo *(Phase 7)* |
| mil | ammo_2 | 120 science2 | turrets_tech | ammo_dmg lv1 *(Phase 7)* |
| mil | turret_range | 150 science3 | ammo_2 | turret_range lv1 *(Phase 7)* |
| expl | cartography | 40 science | automation | radar *(Phase 8)* |
| expl | heaters | 60 science | cartography | heater *(Phase 8)* |
| expl | rover_tech | 200 science3 | cartography | rover_bay *(Phase 8, stretch)* |
| ark | ark_project | 200 science4 | sci4, fuel_tech | ark_site *(Phase 9)* |
| inf | inf_mining / inf_belt / inf_turret | 300·2^lv science4 | ark_project | repeatable lv+1 *(Phase 9)* |

**Tasks:**

- [ ] **4.1 Leveled upgrades.** Migrate `upgrades: UpgradeId[]` →
  `Partial<Record<UpgradeId, number>>` across sim/save/UI; v4 loader accepts the old array
  (→ lv 1). Rate math reads levels via **precomputed integer tables in `data.ts`** (e.g.
  `MINER_INTERVAL_BY_LEVEL = [8, 5, 4]` ticks) — no floats in sim. Update
  `tests/research.test.ts`; re-baseline determinism. Commit.
- [ ] **4.2 Items + recipes data.** Add all items (ITEM_COLOR, ITEM_LABEL, ITEM_INFO, icons)
  + the recipe rows above. Extend `tests/recipes.test.ts`: gear/wire/circuit chains craft
  end-to-end on a scripted mini-factory; the changed science recipe verified. Commit.
- [ ] **4.3 `economy_graph.test.ts` — the integrity net.** Pure data test (no sim run):
  every recipe input is producible (some recipe or deposit yields it); every tech's costItem
  is producible using only techs at-or-before it in the prereq DAG; every `unlocks` id exists
  as a module or recipe; every module has BUILD_COSTS + MODULE_INFO + MODULE_CATEGORY + an
  icon; every item has color/label/ITEM_INFO. This test guards ALL later content phases.
  Commit.
- [ ] **4.4 TECHS v2 rows (through `heaters`, minus later-phase grants) + queue flow.**
  `tests/research.test.ts`: pack-tier gating holds; queue (Phase 2) works across branches;
  completing `sci2` makes `science2` craftable. Commit.
- [ ] **4.5 Splitter + underground in sim.** Splitter: 1-in-2-out alternating (round-robin
  int per module). Underground: paired entrance/exit ≤4 tiles apart; drag places both ends;
  packets traverse unrendered between ends. `tests/placement.test.ts` extends (pairing, max
  gap, unlock gating); belt-throughput determinism case. Re-baseline. Commit.
- [ ] **4.6 Belt-speed levels.** Global scaling via `BELT_TICKS_PER_SLOT = [3, 2, 1, 1]`
  (index = belt_speed level; lv 3 also doubles packet cap per tile). Tread animation speed
  follows in the renderer. Tests + re-baseline. Full gate; deploy; verify live.

**Acceptance:** all tier-1/2 chains (gear, wire, circuit, steel, science, science2) automate
end-to-end in play; splitters/undergrounds behave and explain themselves via tooltips;
research graph renders ~20 nodes legibly with queue; `economy_graph.test.ts` green — and it
stays green through Phase 9.

---

## Phase 5 — Fluids & oil

**Goal:** a second logistics network — pooled-pressure pipes — feeding refinery/chem-plant
chains: water, crude, petroleum, plastic, advanced circuits, refined crystal, drift fuel.

**Files:** Create `src/sim/fluids.ts`, `tests/fluids.test.ts`. Modify `src/sim/types.ts`,
`src/sim/data.ts`, `src/sim/world.ts`, `src/render/models.ts`, `src/render/renderer.ts`,
`src/ui/inspector.ts`, `src/ui/icons.ts`, `src/main.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type FluidType = 'water' | 'crude' | 'petroleum';
export type ModuleType = /* … */ | 'pipe' | 'pump' | 'pumpjack' | 'refinery' | 'chem_plant';
export interface FluidSegmentView { id: number; fluid: FluidType | null; volume: number;
  capacity: number; cells: number[] }        // windowed, for pipe fill rendering + inspector
export interface Snapshot { /* … */ fluids: FluidSegmentView[]; }
```

```ts
// fluids.ts — pure module used by world.ts:
// A SEGMENT is a maximal connected run of pipe cells (recomputed on place/remove, cached).
// Each segment: one fluid type (first producer claims; mixed input is refused at the port),
// integer volume, capacity = cells.length * 50. Producers push up to rate/tick if space;
// consumers pull up to rate/tick if volume ≥ need. No per-cell flow sim, no packets. Machines
// connect via their facing port cell. Deterministic: segments sorted by min cell id.
export function rebuildSegments(pipes: Set<number>): Segment[];
export function tickFluids(segments: Segment[], producers: Port[], consumers: Port[]): void;
```

Fluid-capable machines get `fluidIn`/`fluidOut` in their recipe rows — extend `Recipe` with
optional `fluidInputs?: { fluid: FluidType; amount: number }[]` and
`fluidOutput?: { fluid: FluidType; amount: number }`. New recipes: `refine_petroleum`
(refinery: 2 crude → 1 petroleum, t10 p6), `make_plastic` (chem_plant: 1 petroleum + 1 coal →
1 plastic, t12 p6), `assemble_adv_circuit` (assembler: 1 circuit + 1 plastic + 2 wire →
1 adv_circuit, t16 p5), `refine_crystal` (chem_plant: 2 crystal + 1 sulfur →
1 refined_crystal, t16 p6), `make_drift_fuel` (chem_plant: 1 petroleum + 2 sulfur →
1 drift_fuel, t20 p7). Pump: shore-only placement (water-adjacent tile — worldgen already
places lakes; add `water` terrain flag to worldgen + one lake near spawn guaranteed).
Pumpjack: only on `oil` deposits (Toxic Canopy).

**Tasks:**

- [ ] **5.1 `fluids.ts` + tests.** `tests/fluids.test.ts` first: segment merge on connecting
  two runs; split on removal; producer fills to capacity then blocks; consumer starves below
  need; mixed-fluid refusal; determinism (two identical command scripts ⇒ identical volumes).
  Implement pure functions. Commit.
- [ ] **5.2 World integration.** Place/remove rebuild segments; pump/pumpjack/refinery/
  chem_plant behaviors (recipe engine reads fluidInputs/fluidOutput through the machine's
  port segment); `blocked` gains `'no_fluid'`. BUILD_COSTS: pipe 1 plate, pump 4 plate +
  2 gear, pumpjack 6 steel + 4 gear, refinery 8 steel + 4 circuit, chem_plant 8 steel +
  4 circuit. Re-baseline. Commit.
- [ ] **5.3 Renderer.** Pipe model (auto-connecting straight/corner/T from neighbors, like
  belts), fill-level tint from `FluidSegmentView`, pumpjack bob animation, refinery/chem
  plant models in `models.ts` (follow existing buildModuleModel patterns). Visual check.
  Commit.
- [ ] **5.4 UI + guided oil objectives.** Inspector shows segment fluid/volume on pipes and
  machine fluid ports; tooltips for the 5 new tools; TECHS rows `oil_processing`, `plastics`,
  `sci3`, `adv_electronics`, `sci4`, `crystal_refining`, `fuel_tech` go live (grants now
  exist — `economy_graph.test.ts` proves it). **Fluids are the genre's tier-3 drop-off cliff
  (spec §9.1):** when `oil_processing` completes, the objective chip runs a one-time guided
  sequence (data-driven like TUTORIAL_STEPS): "find oil (map ping on nearest discovered/
  undiscovered-direction deposit)" → "pumpjack on it" → "pipe to refinery" → "power it" →
  "first plastic". Dismissible; never repeats. Full gate; deploy; verify live.

**Acceptance:** water + oil pumped, refined, and consumed by automated plastic → adv-circuit
→ science3/science4 chains; pipes visibly fill; blocked machines say `no_fluid`; the full
oil field in Toxic Canopy is worth the trip.

---

## Phase 6 — Power network v2

**Goal:** power becomes a designed system: steam (coal+water), solar (day/night),
accumulators, brown-out priorities, and a power graph.

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts`, `src/sim/world.ts`,
`src/render/models.ts`, `src/ui/hud.ts` (+ stats panel from Phase 1), `src/main.ts`.
Create `tests/power.test.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type ModuleType = /* … */ | 'boiler' | 'steam_engine' | 'solar' | 'accumulator';
export interface PowerView { produced: number; used: number; deficit: boolean;
  stored: number; storedMax: number; solarFactor: number /* 0..100 int, from dayPhase */ }
export interface Snapshot { /* … */ power: PowerView; }
```

- **Priorities on deficit** (`data.ts`: `POWER_PRIORITY: Record<ModuleType, 0|1|2>`):
  class 0 (turrets, heaters) powered first, class 1 (miners, belts, pumps) next, class 2
  (smelters, assemblers, labs, refineries) shed first. Shedding is deterministic: within a
  class, higher cell id sheds first.
- **Boiler** consumes 1 coal / 40 ticks + 5 water/tick (fluid port) → feeds up to 2 adjacent
  steam_engines (adjacency pairing, no steam fluid). Steam engine: 12 power. Generator
  (starter turbine): rebalanced to 4 power. Solar: 6 × solarFactor/100 (0 at night, ramp at
  dusk/dawn, 0 always in `hollows`, halved during `storm` hazard). Accumulator: stores 500,
  charges ≤5/tick on surplus, discharges ≤5/tick on deficit before shedding.
- BUILD_COSTS: boiler 6 plate + 2 gear, steam_engine 8 plate + 4 gear, solar 4 plate +
  2 circuit, accumulator 4 steel + 4 circuit.

**Tasks:**

- [ ] **6.1 Sim + tests.** `tests/power.test.ts` first: boiler+engine produce iff coal+water
  present; solarFactor curve from dayPhase (table-driven ints in data.ts, no floats);
  accumulator charge/discharge order; priority shedding (build class-0/1/2 machines, force
  deficit, assert exactly the class-2 machine browns out; `blocked === 'no_power'`).
  Re-baseline. Commit.
- [ ] **6.2 Models + UI.** Four new models; power graph in the stats panel (produced/used/
  stored over the Phase-1 ring-buffer window); statusbar power bar shows stored + solar sun
  icon at daytime; `low_power` alert fires before shedding (at 90% load, latched). TECHS rows
  `steam_power`, `solar_power`, `accumulators`, `efficiency` live (power_eff lv1 = all draws
  ×3/4, integer table). Full gate; deploy; verify live.

**Acceptance:** a coal+water steam plant carries the base at night, solar+accumulators carry
the day; a deliberate overload sheds labs before turrets and the graph shows why; Crystal
Hollows genuinely needs non-solar power.

---

## Phase 7 — Threat layer & modes (Wanderer / Drifter)

**Goal:** the Drifter mode: pollution attracts deterministic raids; defense (walls, turrets,
ammo, HP, repair) is a factory problem. Wanderer keeps it all off. Mode + difficulty chosen
at new game (minimal pre-menu; the full main menu lands in Phase 9).

**Files:** Create `src/sim/threat.ts`, `src/sim/data_threat.ts`, `tests/threat.test.ts`.
Modify `src/sim/types.ts`, `src/sim/world.ts`, `src/sim/data.ts`, `src/render/models.ts`,
`src/render/effects.ts`, `src/render/renderer.ts`, `src/ui/hud.ts`, `src/ui/hotbar.ts`,
`src/main.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type GameMode = 'wanderer' | 'drifter';
export type Difficulty = 0 | 1 | 2;                      // Calm / Standard / Relentless
export type ModuleType = /* … */ | 'wall' | 'turret';
export type EnemyKind = 'mite' | 'stalker' | 'behemoth';
export interface EnemyView { id: number; x: number; y: number; px: number; py: number;
  hp: number; kind: EnemyKind }
export interface ModuleView { /* … */ hp?: number; hpMax?: number }
export interface Snapshot { /* … */ mode: GameMode; enemies: EnemyView[];
  pollution: Uint8Array /* per-chunk 0..255 */; raid: { incoming: boolean; eta: number } }
// Commands:
| { type: 'init'; seed: number; mode: GameMode; difficulty: Difficulty }
| { type: 'repair'; cell: number }        // player hold-to-repair, costs 1 plate per 20 HP
| { type: 'offline'; ticks: number }      // fast-forward, raids suppressed (spec §4)
```

```ts
// data_threat.ts
export const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number /* ticks/tile */;
  dmg: number /* per hit, every 8 ticks */; }>; // mite 20/6/2 · stalker 60/4/5 · behemoth 300/8/20
export const RAID_TABLE: { threshold: number; wave: { kind: EnemyKind; n: number }[] }[];
export const POLLUTION: Partial<Record<ModuleType, number>>; // per-craft emission ints
export const MODULE_HP: Record<ModuleType, number>;          // wall 300, turret 150, rest 100
export const TURRET = { range: 5, dmg: 10, ticksPerShot: 4, ammoPerShot: 1 };
export const DIFFICULTY_SCALE = [50, 100, 200];              // % raid size
```

BUILD_COSTS: wall 2 plate · turret 5 plate + 2 gear + 2 circuit.

- **Pollution:** per-chunk int accumulator; +POLLUTION[type] on each completed craft/mine;
  −1 per chunk per 100 ticks (decay). Drives raid budget.
- **Raids (threat.ts):** every RAID_INTERVAL ticks (data: 9000 ≈ 19 min, ×difficulty), if
  total pollution > next RAID_TABLE threshold, schedule a raid: alert + `raid.eta` countdown
  (1200 ticks), spawn the wave at the nest POI nearest the highest-pollution chunk (static
  edge nests from worldgen; Phase 8 makes them visible POIs). Pathing: integer greedy-toward-
  target with wall-collision (enemies attack blocking walls/buildings; no flow fields —
  cheap, deterministic, sorted-id iteration). Target = highest-pollution chunk's nearest
  building. Enemies attack adjacent buildings (HP−dmg), die at hp≤0, despawn all when the
  wave's target chunk pollution < threshold/2 or wave wiped.
- **Turrets** auto-fire at nearest enemy in range (sorted enemy id ties), consume `ammo` from
  an internal buffer fed by belts/adjacent storage like any machine input. **Walls** are
  passive HP blockers. Destroyed buildings leave rubble (auto-clears; no item drop, refund
  nothing — the raid *cost* you). Repair: `repair` command, 1 plate per 20 HP.
- **Wanderer:** threat.ts never ticks; military tools hidden (`MODULE_CATEGORY` filtering by
  snapshot.mode); Military TECHS branch hidden in the research graph.
- **Mode select:** until Phase 9's real menu, a first-boot overlay (two big cards
  Wanderer/Drifter + difficulty + optional seed field) writes `{seed, mode, difficulty}` into
  the init command; existing saves default to Wanderer.

**Tasks:**

- [ ] **7.1 HP + pollution plumbing.** Tests: crafts emit per-table pollution into the right
  chunk; decay floors at 0; buildings expose hp/hpMax; repair command heals and deducts
  plates. Re-baseline. Commit.
- [ ] **7.2 `threat.ts` raids.** Tests (scripted, fixed seed): no pollution ⇒ no raid ever;
  pollution over threshold ⇒ raid at the scheduled tick, deterministic spawn/pathing (two
  runs identical); enemies destroy an undefended wall line; turret with ammo kills a mite
  wave; turret without ammo doesn't fire; `offline` command never spawns raids; Wanderer
  never ticks threat. Re-baseline. Commit.
- [ ] **7.3 Render + UI.** Enemy models (low-poly, pooled, interpolated like packets), turret
  fire tracer + hit sparks in `effects.ts`, HP bars on damaged buildings (billboard quads),
  raid alert with countdown chip + beacon to the nest, ammo bar in turret inspector, mode
  badge in statusbar. Military category appears only in Drifter. Visual check. Commit.
- [ ] **7.4 Mode-select overlay + init/save wiring.** Save v4 gains `mode`/`difficulty`
  (already in the v4 schema — populate now); `_harness.ts` defaults to Wanderer so all prior
  tests stay green; new-game overlay — **Wanderer card visually recommended for first-time
  players** ("Start here" badge; combat is divisive, spec §9.3), Drifter framed as "the full
  pressure"; TECHS military rows live. Playtest a Standard raid cycle. Full gate; deploy;
  verify live.

**Acceptance:** in Drifter, a polluting base draws a telegraphed raid that walls+turrets+ammo
lines repel; losses are repairable; Calm/Standard/Relentless visibly scale; Wanderer shows
zero combat surface anywhere; determinism suite green including a threat-mode script.

---

## Phase 8 — Exploration: POIs, live hazards, radar, heater, rover (stretch)

**Goal:** make crossing the world rewarding (ruins/salvage/rich nodes) and each biome
mechanically distinct (hazards act), with radar for map intel and heaters for the Ridge.

**Files:** Modify `src/sim/worldgen.ts`, `src/sim/world.ts`, `src/sim/types.ts`,
`src/sim/data_biomes.ts`, `src/render/scenery.ts`, `src/render/effects.ts`,
`src/ui/mapview.ts`, `src/main.ts`, `tests/worldgen.test.ts`. Create `tests/hazards.test.ts`.

**Contract deltas (exact):**

```ts
// types.ts
export type ModuleType = /* … */ | 'radar' | 'heater' | 'rover_bay';
export interface PoiView { cell: number; kind: 'ruin' | 'salvage' | 'nest'; looted: boolean }
export interface Snapshot { /* … */ pois: PoiView[] /* discovered only */;
  hazard: { storm: boolean; stormEta: number } }
// Command: | { type: 'loot'; cell: number }   // player adjacent to POI
```

- **POIs in worldgen:** per-biome counts from `data_biomes.ts` (`POI_TABLE`): ruins grant a
  one-time free tech (the cheapest unresearched tech ≤ its tier — deterministic choice),
  salvage grants items (table), nests are Phase-7 spawn anchors, now visible + lootable-once
  after clearing (Drifter). `loot` validates player-adjacency client-side (it's a claim —
  sim validates only looted-state; position stays out of the sim, consistent with `collect`).
- **Hazards act** (all integer, all in `advance()`):
  *Storm* (dust): scheduled by hash(seed, day) — 1-in-3 days, 1200 ticks; solarFactor halved,
  render fog thickens, particles blow. *Cold* (ridge): machines outside a heater aura (radius
  4, class-0 power draw 2) run at half speed — precomputed aura bitset on place/remove.
  *Spores* (canopy): pollution decays 4× slower (angrier raids). *Lava* (ember): lava tiles
  unbuildable (placement rule) + knock the player back with a screen flash (client-side —
  no sim state). *Dark* (hollows): render-side light radius + solarFactor 0 (already in
  Phase 6).
- **Radar:** reveals fog in radius 12 (as `reveal`-equivalent inside the sim, it owns fog),
  power class 0, draw 3. **Rover (stretch — build last, cut first):** rover_bay crafts a
  rover (100 steel, 50 circuit); mounting doubles player speed + auto-reveals radius 6;
  pure client-side movement modifier + a renderer mesh swap; sim knows nothing.
- BUILD_COSTS: radar 4 plate + 2 circuit · heater 4 plate + 2 gear · rover_bay 20 steel +
  10 circuit.

**Tasks:**

- [ ] **8.1 Worldgen POIs + tests** (counts, determinism, nest placement matches Phase 7
  spawns; starter area has ≥1 ruin within 40 tiles). Commit.
- [ ] **8.2 Hazards live + `tests/hazards.test.ts`** (storm schedule deterministic; cold
  halves miner rate outside aura, full inside; spore decay factor; lava placement refused).
  Re-baseline. Commit.
- [ ] **8.3 Radar + heater + loot flow** (sim + models + map-view POI pins + loot toast).
  TECHS rows `cartography`, `heaters` live. Commit.
- [ ] **8.4 Biome ambience pass** — per-biome particles (`effects.ts`), scenery decoration
  from `POI/BIOME` palettes, storm visuals. Visual check all biomes. Commit.
- [ ] **8.5 (Stretch) rover.** TECHS `rover_tech`. Full gate; deploy; verify live.

**Acceptance:** a trek to any biome pays off (loot, tech ruin, rich node) and *feels*
different (hazard + ambience); heater makes Ridge factories viable; radar+map turn
exploration into planning; hazards suite green.

---

## Phase 9 — Endgame & meta: Ark, victory, Infinite Mode, achievements, menu, slots, offline

**Goal:** the game becomes winnable and re-playable: the Ark megaproject, the win screen,
infinite research, achievements, a real main menu with 3 save slots, and offline progress.

**Files:** Create `src/sim/ark.ts`, `src/sim/data_meta.ts` (ARK_STAGES, ACHIEVEMENTS),
`src/ui/menu.ts`, `src/ui/winscreen.ts`, `src/ui/milestones.ts`, `tests/ark.test.ts`,
`tests/achievements.test.ts`, `tests/offline.test.ts`. Modify `src/sim/types.ts`,
`src/sim/world.ts`, `src/sim/data.ts`, `src/render/models.ts`, `src/render/effects.ts`,
`src/ui/hud.ts`, `src/main.ts`, `src/style.css`.

**Contract deltas (exact):**

```ts
// types.ts
export type ModuleType = /* … */ | 'ark_site';           // 4×4 footprint, unique (max 1)
export interface ArkView { stage: 0|1|2|3|4;             // 4 = launched/victory
  needs: { item: ItemType; have: number; need: number }[] }
export interface Snapshot { /* … */ ark: ArkView | null;
  stats: { ticks: number; sciTotal: number; peakRate: number; raidsSurvived: number };
  achievements: string[] }                                // earned ids
// Commands: | { type: 'prestige' }                       // stretch: NG+ reset

// data_meta.ts
export const ARK_STAGES: { name: string; needs: { item: ItemType; n: number }[] }[] = [
  { name: 'Frame',    needs: [{ item: 'frame', n: 200 }, { item: 'steel', n: 100 }] },
  { name: 'Reactor',  needs: [{ item: 'drift_fuel', n: 150 }, { item: 'circuit', n: 200 }] },
  { name: 'Guidance', needs: [{ item: 'refined_crystal', n: 100 }, { item: 'adv_circuit', n: 150 }] },
  { name: 'Payload',  needs: [{ item: 'science4', n: 100 }, { item: 'plastic', n: 200 }] },
];
export interface AchievementDef { id: string; name: string; desc: string;
  check: 'stat' | 'event'; }                              // ~20 rows; checks evaluated in sim
export const ACHIEVEMENTS: AchievementDef[];
```

- BUILD_COSTS: ark_site 50 steel + 25 circuit (the real cost is the four stages).
- **Multi-tile:** `ark_site` occupies a 4×4 cell block (placement validates all 16 cells;
  `modules` stores the anchor; occupancy map for the rest). It consumes items belt-delivered
  to any edge cell into the current stage's needs. Stage completes when all needs met →
  `ark_stage` alert + objective chip advances. Stage 4 = `victory` flag in snapshot (one-shot).
- **Victory flow (main/UI):** on `stage: 4` first appearing: renderer plays the launch
  sequence (site mesh ascends + particle exhaust + screen flash — ~6 s, skippable), then
  `winscreen.ts` shows run stats (from `snapshot.stats`) + "Continue in Infinite Mode" +
  "New Game+". Save marks `won: true`; infinite TECHS rows (`inf_*`) appear only when won.
- **Achievements:** evaluated **in the sim** (deterministic; events like "first turret kill"
  and stat thresholds like "1000 plates produced"); earned ids in snapshot + save; UI
  `milestones.ts` panel + toast on earn. ~20 rows per spec §3.8.
- **Main menu (`menu.ts`):** replaces the Phase-7 overlay. Boot → menu (unless
  `?quick=1`): Continue (most recent slot), 3 slot cards (mode badge, playtime, Ark stage,
  screenshot-free), New Game (mode/difficulty/seed), Settings, How to Play (help panel),
  Credits. Slots live in the Phase-3.7 IndexedDB store (`src/storage.ts`); the existing
  single save migrates to slot 0. Slot cards expose Export/Import (storage.ts strings).
- **Offline progress:** on load, main computes elapsed real ms (persisted `lastSeen`
  timestamp — main thread MAY read the clock; the sim may not), caps at
  `OFFLINE_CAP_TICKS` (a `data.ts` constant, initially 2 h of 1× ticks — a deliberate,
  perf-bounded generosity lever per spec §9.6; the toast says "kept working for up to 2 h"
  so the cap reads as a feature, not a theft), sends
  `{type:'offline', ticks}`; worker advances in ≤2000-tick slices (yielding between slices to
  keep snapshots flowing), raids suppressed; then a summary toast (items delta, research
  delta). `tests/offline.test.ts`: offline(N) ≡ N manual advances with raids off (hash
  equality); cap respected.
- **Prestige (stretch):** `prestige` resets the world (new seed) keeping achievements +
  one chosen boon (`data_meta.ts` BOONS: head-start inventory / free cartography / +1 belt
  level). Skip if the phase runs long — victory + infinite already close the loop.

**Tasks:**

- [ ] **9.1 Ark sim + tests** (multi-tile placement rules; edge delivery consumes into
  needs; stage advance; victory one-shot; needs snapshot correct). Re-baseline. Commit.
- [ ] **9.2 Ark model + progress UI + objective chip integration** (site model grows per
  stage — 4 mesh states; inspector shows per-item progress bars). Commit.
- [ ] **9.3 Launch cinematic + win screen.** Visual check; `?quick=1` dev bypass. Commit.
- [ ] **9.4 Achievements sim + panel + tests.** Commit.
- [ ] **9.5 Infinite research** (repeatable techs, geometric cost `300·2^level`, leveled
  upgrade grants; research graph renders "∞ lv N"). Tests. Commit.
- [ ] **9.6 Main menu + save slots + migration** (single-save → slot 0; slot delete with
  confirm). Visual check mobile. Commit.
- [ ] **9.7 Offline progress + tests.** Full gate; deploy; verify live.

**Acceptance:** a played-through save reaches the Ark, feeds all four stages, launches, sees
stats, continues into Infinite Mode with infinite research; menu manages three slots cleanly;
closing the tab for an hour yields a capped, summarized offline gain; all new suites green.

---

## Phase 10 — Audio

**Goal:** the 1.0 soundscape per spec §5 — small, lazy, settings-mixed, never in the sim.

**Files:** Create `src/audio/manager.ts`, `src/audio/sfx.ts`, `public/audio/*` (assets).
Modify `src/main.ts`, `src/ui/hud.ts` (settings sliders), `vite.config.ts` (asset handling
if needed).

- [ ] **10.1 `AudioManager`:** WebAudio, init on first user gesture; master/music/sfx gain
  nodes; volumes from the Phase-1 settings store; auto-mute on `visibilitychange`.
  API: `play(id, opts?)`, `setBiome(biome)`, `pulse(tick)`, `setFactorySize(n)`.
- [ ] **10.2 SFX set (synthesized first, CC0 replace later):** ui_tap, place, erase, collect,
  research_done, alert, raid_horn, turret_fire (pooled/throttled), launch. Generated via
  small WebAudio synth functions in `sfx.ts` (no asset download for SFX — zero weight,
  consistent style).
- [ ] **10.3 Music:** one CC0 ambient bed per biome (5 files, ≤ 700 KB each OGG; document
  source + license in `public/audio/CREDITS.md`), crossfade on biome change, factory-hum
  layer scaled by module count near the player. Total budget ≤ 4 MB — enforce by checking
  `dist/` size in the phase gate.
- [ ] **10.4 Hooks:** main.ts triggers off snapshot deltas (alerts → stingers, biome →
  `setBiome`, pulse → beat layer) and UI callbacks (tap/place/erase). No autoplay violations
  (silence until gesture). Settings sliders live. Full gate; deploy; verify live on a phone
  (iOS Safari audio unlock included).

**Acceptance:** sound level feels cohesive; every category mixable to zero; no console
autoplay warnings; bundle+assets within budget.

---

## Phase 11 — Release: performance, PWA, accessibility, balance, tutorial v2, docs, 1.0

**Goal:** the ship-it phase — budgets enforced, installable PWA, accessible, tuned pacing,
tutorial covering the full game, and honest docs.

**Files:** Modify `vite.config.ts`, `index.html`, `public/*` (icons/manifest/SW),
`src/render/*` (perf), `src/ui/*` (a11y), `src/sim/data*.ts` (balance), `README.md`,
`CLAUDE.md` + per-folder CLAUDE.md, `docs/superpowers/plans/PLAN-INDEX.md`.
Create `CHANGELOG.md`, `tests/softlock.test.ts`, `tests/replay.test.ts` (extend harness).

- [ ] **11.1 Performance pass.** Measure first (Chrome tracing on a throttled profile +, if
  available, a real mid phone): 1k-module benchmark save (scripted builder in
  `tests/_harness.ts`). Fix to budget: instanced machine meshes per type (renderer refactor
  — biggest win), chunk frustum culling, particle caps by quality tier, snapshot window size
  tune. Budget: 60 fps mid phone / 30 fps floor low tier; sim `advance()` < 8 ms at 1k
  modules (add a perf assertion test with a generous 3× CI margin).
- [ ] **11.2 Bundle pass.** Code-split: three.js + render layer behind `import()` after
  first paint (menu renders DOM-only instantly); postfx lazy per quality tier. Target ≤
  250 KB gz initial, whole app ≤ 1.2 MB gz excluding audio. Check with
  `npx vite-bundle-visualizer` and record numbers in the commit message.
- [ ] **11.3 PWA polish.** Real icon set (192/512 + maskable, from the game's look — draw an
  SVG → render PNGs), splash/theme-color, precaching SW (Workbox `generateSW` via
  `vite-plugin-pwa` — acceptable dev-dep) with an update toast ("Updated — reload").
  Lighthouse PWA pass ≥ 90.
- [ ] **11.4 Accessibility.** UI scale slider (root `font-size` var); colorblind-safe:
  every item icon gets a distinct **shape** (icons.ts audit — no color-only pairs);
  reduce-motion setting kills camera bob/particle bursts/screen flash; touch targets audit
  ≥ 40 px; `aria-label`s on all buttons; focus order for keyboard users.
- [ ] **11.5 Balance & pacing pass.** Scripted "speedrun" test drives commands through the
  whole arc (mine → … → Ark) asserting reachability (this is `tests/softlock.test.ts`:
  from a fresh world AND from a deliberately bankrupted state — everything sold/erased — the
  script still reaches plates; plus DAG guards from `economy_graph.test.ts` stay green).
  Manual playtest calibration against spec targets: first automated science 30–60 min,
  Ark 6–10 h (extrapolated via rates, not a 10-h sit). Tune `data*.ts` only; log every
  change in the commit body. **Milestone-density check (spec §9.1 — most genre players quit
  at tiers 2–3, not the tutorial):** chart minutes-between-unlocks across the whole tech
  DAG at scripted-playthrough rates; no gap between meaningful unlocks may exceed ~2× the
  early-game cadence; fix gaps by re-costing techs or adding an achievement/objective
  beat, never by grind.
- [ ] **11.6 Tutorial v2 + objective chip never blank.** Extend `TUTORIAL_STEPS` (Phase 1)
  to teach: tooltips (long-press hint), pipette, codex, research queue, map/beacons, power
  (steam), first raid prep (Drifter only branch), Ark objective intro at sci4. Replayable
  from Help; steps skippable. The objective chip gets a fallback chain so it is **never
  blank** after the tutorial (spec §9.1): active tutorial/guided step → active research →
  cheapest affordable unresearched tech ("Research X?") → next Ark stage → Infinite-Mode
  suggestion. Visual check.
- [ ] **11.7 Replay harness extension.** `tests/replay.test.ts`: record a 5k-tick command
  script covering every command type (place/remove/recipes/research/queue/repair/loot/
  offline/window/reveal) → replay ⇒ identical final hash. This is the co-op/anti-regression
  insurance for post-1.0.
- [ ] **11.8 Docs & release.** Rewrite `README.md`: hero paragraph + screenshot, play-now
  link, feature list, quickstart (play + dev), architecture summary (three layers + wire +
  determinism), test/deploy guide, roadmap pointer, license + audio credits. Update root +
  per-folder `CLAUDE.md` (new files, new rules — e.g. fluids/threat/ark modules, audio
  layer). Start `CHANGELOG.md` at `1.0.0`. Update `PLAN-INDEX.md` (this plan → shipped).
  Bump `package.json` version to `1.0.0`, tag `v1.0.0`, push, verify live, play the live
  build once end-to-end (menu → tutorial → first automation).

**Acceptance (= Definition of Done for 1.0):** a stranger on a mid-range phone can install
the PWA, be taught the loop, automate four science tiers across five biomes, choose cozy or
threatened play, win via the Ark, and keep playing — at 60 fps, with sound, tooltips on
everything, no lost saves, and a README that does the game justice.

---

## Phase 12 — Launch & distribution (human-gated where outward-facing)

**Goal:** put 1.0 where players are — the proven web-game funnel (spec §7/§9.7). Agents
**prepare** everything; **Martin publishes** (portal submissions, community posts, and any
account-holding action are explicitly human steps — never performed by an agent).

- [ ] **12.1 Capture kit.** Scripted Playwright capture session against the live build:
  6–8 screenshots (each biome, a dense base, the Ark, the research graph — desktop + phone
  aspect) and 3 short GIF/WebM loops (Pulse packets flowing, a drag-built belt line, a raid
  defense). Store under `docs/presskit/` with a `presskit.md` (pitch paragraph, feature
  bullets, fact sheet, links, license note). Commit.
- [ ] **12.2 In-game feedback loop.** Menu + Help gain "Send feedback" (GitHub issues new-
  issue link with a prefilled template: version, seed, mode — no automatic data collection).
  `README.md` gains a "Feedback" section. **Analytics decision (locked, spec §7): no player
  analytics, no tracking, no SDKs.** At most a privacy-respecting page-view counter on the
  Pages site — and only if Martin opts in later; nothing ships in 1.0. Commit.
- [ ] **12.3 itch.io draft.** Prepare (as files in `docs/presskit/itch/`) the full page:
  title, tagline, description (short + long), tag list (`automation`, `factory`, `base-
  building`, `idle`, `free`, `mobile`…), embed sizing (the game already handles small
  viewports), screenshots/GIF selection, pricing = free. **Human step:** Martin creates the
  page, uploads/embeds, publishes, and iterates tags per CTR (the itch algorithm rewards
  tag/CTR tuning — spec §9.7 source).
- [ ] **12.4 Portal submissions.** Prepare a one-page submission brief (game summary, tech
  facts: HTML5/no plugins, touch-ready, offline-capable, load size, no ads/IAP) for **Poki**
  and **CrazyGames** developer portals — both evaluate builds before any SDK integration.
  **Human step:** Martin submits; if a portal accepts and requires its SDK, that lands as a
  post-1.0 plan (SDK wrappers must not touch the sim).
- [ ] **12.5 Community showcase drafts.** Draft (in `docs/presskit/posts.md`) three tailored
  posts: r/BaseBuildingGames (builder angle, GIF-led), r/incremental_games (offline-progress
  + free + browser angle), r/WebGames (tech angle). Honest tone, dev-post conventions, one
  GIF each, live link. **Human step:** Martin posts and engages replies.
- [ ] **12.6 Post-launch triage loop.** Add `docs/POST-LAUNCH.md`: how to read GitHub issue
  reports (the feedback template), a severity ladder (save-loss = drop everything →
  balance nits = batch), and the cadence promise (a patch pass in week 1, then the post-1.0
  roadmap: Horizon 5 per `docs/ROADMAP.md`). Update `PLAN-INDEX.md` (this plan → shipped) —
  final commit of the plan.

**Acceptance:** press kit + drafts exist in-repo and are publish-ready; feedback link works
from the live build; every outward-facing step is documented as human-executed with the
prepared materials; no tracking shipped.

---

## Plan-wide self-review checklist (run at every phase boundary)

- [ ] Determinism suite green **with a freshly-baked hash committed in the same PR** as any
  sim change; replay test green from Phase 11 onward.
- [ ] `economy_graph.test.ts` green (no orphan items/recipes/techs/modules) from Phase 4 on.
- [ ] `npm run build` + full `npm test` + visual check (desktop + 390×844) before merge.
- [ ] Deployed and live-verified (CDN hash matches `dist/`) before the next phase starts.
- [ ] `PLAN-INDEX.md` + root `CLAUDE.md` backlog updated to reflect reality.
- [ ] No tunable landed outside `src/sim/data*.ts`; no game state outside the sim; no AI
  attribution in any commit.

---

## Kickoff prompt (paste to the executing agent to start or resume)

> Execute `docs/superpowers/plans/2026-07-05-driftworks-1.0-master-plan.md`. First read that
> file fully, then the spec it names (including §9). Determine the current phase: check
> `docs/superpowers/plans/PLAN-INDEX.md` status, `docs/superpowers/plans/phases/` for
> per-phase plans, and recent git history. Then continue from the first unfinished phase,
> following the plan's "How to execute" and "Phase kickoff protocol" sections exactly
> (per-phase detailed plan first for Phases 2+, then subagent-driven execution, full gates,
> deploy, live-verify, docs updates). Work one phase per session; stop after the phase's
> deploy is live-verified and report what shipped and what's next.



