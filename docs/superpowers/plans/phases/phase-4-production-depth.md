# Phase 4 — Production depth: items, science packs, tech tree v2 (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 4 — its
> TECHS v2 table is the **authoritative content reference**; copy rows verbatim). Spec §3.1,
> §3.4.

**Goal:** the full solid-item economy (gear/wire/steel/ammo/frame + 4 science packs),
leveled upgrades, splitters + underground belts, belt-speed research, and the
`economy_graph.test.ts` integrity net that guards every later content phase.

**Branch:** `phase-4-production-depth`.

## Pre-flight reality check

- [ ] Phase 3 merged: `deposits` Map with richness; coal/sulfur/crystal deposits exist in
  the world but miners **refuse them with `// TODO Phase 4`** (that TODO is resolved here).
- [ ] `upgrades` is still `Set<UpgradeId>` in world.ts / `UpgradeId[]` in Snapshot+Save.
- [ ] `RECIPES`/`TECHS` in data.ts match main's shipped state (8 techs, 4 recipes);
  research graph (Phase 2) renders from `TECHS` generically.
- [ ] Hotbar category layer (Phase 2 Task 4) is dormant-ready; adding splitter/underground
  will push tool count past 9 and activate it — verify that path works in this phase.

## Contract deltas (exact)

`src/sim/types.ts`:

```ts
export type ItemType =
  | 'ore' | 'copper_ore' | 'coal' | 'sulfur' | 'crystal'
  | 'plate' | 'copper_plate' | 'gear' | 'wire' | 'circuit' | 'steel'
  | 'plastic' | 'adv_circuit' | 'refined_crystal' | 'frame' | 'drift_fuel' | 'ammo'
  | 'science' | 'science2' | 'science3' | 'science4';
export type ModuleType = /* existing 7 */ | 'splitter' | 'underground';
export type UpgradeId =
  | 'miner_speed' | 'smelter_speed' | 'gen_output' | 'belt_speed'
  | 'storage_cap' | 'power_eff' | 'ammo_dmg' | 'turret_range';
// Snapshot + SaveState:  upgrades: Partial<Record<UpgradeId, number>>   (level ≥ 1)
// ModuleView gains:      pair?: number   (underground exit cell, on the entrance's view)
// Command gains nothing new (underground pairing is computed at place time).
```

Note: plastic/adv_circuit/refined_crystal/drift_fuel **items** exist now (colors, labels,
info, icons, START_INVENTORY zeros) but their recipes land in Phase 5 — `economy_graph`
therefore treats items with no producer as allowed **only** if listed in
`FUTURE_ITEMS: ItemType[]` (exported from data.ts, emptied by Phase 5; the test prints what
it tolerated). This keeps every phase's tsc + test green without lying.

`src/sim/data.ts` — new/changed rows (times in ticks, power in units, bufCap 4 unless
noted):

```
assemble_gear      assembler  2 plate            → 1 gear      t6  p3
assemble_wire      assembler  1 copper_plate     → 2 wire      t4  p2
assemble_circuit   assembler  1 plate + 2 wire   → 1 circuit   t10 p4   (CHANGED inputs)
smelt_steel        smelter    5 plate            → 1 steel     t24 p5
assemble_science   assembler  1 gear + 1 copper_plate → 1 science  t8 p3 (CHANGED inputs)
assemble_science2  assembler  1 circuit + 1 gear → 1 science2  t12 p4
assemble_science3  assembler  1 plastic + 1 steel → 1 science3 t16 p5
assemble_science4  assembler  1 adv_circuit + 1 refined_crystal → 1 science4 t20 p6
assemble_ammo      assembler  1 plate + 1 copper_plate → 2 ammo t8 p3
assemble_frame     assembler  2 steel + 2 gear   → 1 frame     t14 p5
BUILD_COSTS: splitter 4 plate + 2 gear · underground 4 plate + 4 gear (per pair END — each
end is a placed module costing this)
Upgrade rate tables (integer, index = level, index 0 = no upgrade):
MINER_INTERVAL_BY_LEVEL   = [2, 1, 1]        // existing lv1 behavior preserved at idx 1
SMELT_TIME_FACTOR_PCT     = [100, 66, 50]    // applied as (time * pct + 99) / 100 | 0, min 1
GEN_OUTPUT_BY_LEVEL       = [12, 18, 24]
BELT_TICKS_PER_SLOT       = [1, 1, 1, 1]     // see Task 5 — speed via SLOT_STRIDE instead
BELT_STRIDE_BY_LEVEL      = [1, 2, 3, 4]     // slots moved per tick at belt_speed lv 0..3
STORAGE_SOFT_CAP_BY_LEVEL = [500, 1500]
```

`TECHS` — copy the master-plan Phase 4 table rows **through `heaters`** except rows marked
for later phases; and change `automation.unlocks` to
`['assembler', 'lab', 'assemble_gear', 'assemble_wire']`. Rows landing NOW: existing 8
(with the automation change), `steel_making`, `sci2`, `splitters`, `undergrounds`,
`belt_speed_1/2/3`, `storage_2`. Rows for Phases 5–8 stay OUT of the table until their
grants exist (`economy_graph` enforces).

---

## Task 1 — Leveled upgrades (TDD)

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts`, `src/sim/world.ts`,
`src/main.ts` (describe() generator row), `tests/research.test.ts`.

- [ ] **Failing tests first** (extend `tests/research.test.ts`): completing `mining_prod`
  yields `snapshot.upgrades.miner_speed === 1`; loading a save with legacy
  `upgrades: ['miner_speed']` (array) produces the same; rates read the tables (miner
  emits every `MINER_INTERVAL_BY_LEVEL[1]+1` ticks after the upgrade — assert via packet
  counts over 30 ticks).
- [ ] **Implement:** `World.upgrades: Map<UpgradeId, number>`; `completeResearch` does
  `upgrades.set(id, (upgrades.get(id) ?? 0) + 1)` (repeatable-ready for Phase 9);
  `advance()` locals read the tables clamped to table length
  (`const lvl = Math.min(this.upgrades.get('miner_speed') ?? 0, MINER_INTERVAL_BY_LEVEL.length - 1)`).
  Replace the three existing upgrade ternaries. Snapshot: `upgrades:
  Object.fromEntries(this.upgrades)`. Save v4 load: accept array (→ level 1 each) or
  record. Inspector's generator row in `main.ts` reads `GEN_OUTPUT_BY_LEVEL` instead of
  its hardcoded 12/18.
- [ ] Suites green; **re-baseline determinism**. Commit:
  `sim: leveled upgrades (Map + integer rate tables), legacy array accepted`.

---

## Task 2 — Items + recipes data (TDD)

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts`, `src/ui/icons.ts`,
`tests/recipes.test.ts`, `tests/blocked.test.ts` (Record growth).

- [ ] Extend `ItemType`; add all `ITEM_COLOR`/`ITEM_LABEL`/`ITEM_INFO`/`START_INVENTORY`
  rows (zeros; keep `ore: 40`). tsc now forces every `Record<ItemType, …>` across the
  codebase to grow — fix each (statusbar shows only ore/plate/science + any nonzero item:
  make it data-driven over `ITEM_LABEL` keys with count > 0 to stop the per-item chip
  sprawl). Icons: add distinct **shapes** per item (a11y rule): gear = cog, wire = wave,
  circuit = chip, steel = ingot, science packs = flask with tier pips, etc.
- [ ] Add the recipe rows (table above), change `assemble_circuit` and `assemble_science`
  inputs, add `FUTURE_ITEMS = ['plastic', 'adv_circuit', 'refined_crystal', 'drift_fuel']`.
- [ ] Resolve the Phase-3 `// TODO Phase 4` in world.ts: miners on coal/sulfur/crystal now
  emit `coal`/`sulfur`/`crystal`; oil still refuses (Phase 5 pumpjack).
- [ ] **tests/recipes.test.ts additions:** scripted mini-factory (placeRawPublic chains,
  inject inputs into `inBuf`) proves gear, wire, circuit (new inputs), steel, science
  (new inputs), science2 craft end-to-end; changed recipes' old inputs no longer work
  (plate-only science stalls with `blocked === 'no_input'`).
- [ ] Suites green; re-baseline. Commit: `data: full solid-item set + tier-1/2 recipes (science rework)`.

---

## Task 3 — `tests/economy_graph.test.ts` — the integrity net (pure data)

**Files:** Create `tests/economy_graph.test.ts`.

- [ ] Assert over data only (no sim run):
  1. every `Recipe.inputs[].item` and `BUILD_COSTS[].item` is producible: has a producing
     recipe, is a deposit product (`ore, copper_ore, coal, sulfur, crystal`), or is in
     `FUTURE_ITEMS`;
  2. every `TECHS[].costItem` is producible using only techs whose prereq-closure precedes
     it (walk the DAG: a tech's costItem must have a producer recipe unlocked by
     START_UNLOCKED or by some tech in its ancestor set — including itself being a
     bootstrap costItem like raw `ore`);
  3. every `TECHS[].unlocks` id exists as a ModuleType or Recipe id;
  4. every `TECHS[].prereqs` id exists; the DAG is acyclic;
  5. every ModuleType has `BUILD_COSTS`, `DEFS`, `MODULE_INFO`, `MODULE_CATEGORY`, and an
     `ICONS` key (import `ICONS` from `../src/ui/icons` — it is a plain object);
  6. every ItemType has `ITEM_COLOR`, `ITEM_LABEL`, `ITEM_INFO`, `START_INVENTORY`;
  7. print (not fail) the `FUTURE_ITEMS` currently tolerated.
- [ ] PASS; add to the `npm test` glob (it is `tests/*.test.ts` — automatic). Commit:
  `tests: economy-graph integrity net (producibility, DAG, table completeness)`.

---

## Task 4 — TECHS v2 rows + pack-tier flow (TDD)

**Files:** Modify `src/sim/data.ts`, `tests/research.test.ts`.

- [ ] Add the Phase-4 rows listed above (costs/prereqs verbatim from the master-plan
  table). `economy_graph` must stay green — it is the reviewer here.
- [ ] **Tests:** `sci2` completion makes `assemble_science2` selectable
  (`selectRecipe` succeeds) and science2 craftable; `belt_speed_1` requires science
  (pack), not ore; queueing across branches (`splitters` then `steel_making`)
  auto-advances; a tech whose costItem is `science2` cannot be *contributed* before any
  science2 exists (contribute is a no-op when inventory lacks the item — existing
  behavior, assert it).
- [ ] Research graph visual check: ~20 nodes, columns by depth, edges sane, search works.
- [ ] Commit: `data: tech tree v2 through logistics/production tier 2`.

---

## Task 5 — Splitter + underground belts in the sim (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts` (`pair?`), `src/main.ts`
(drag-place both ends), `src/render/models.ts` (two models),
`tests/placement.test.ts`, `src/ui/placement.ts`.

Rules (locked):
- **Splitter** occupies one cell, has a direction; input from the back like any machine;
  alternates its two outputs (left-forward, right-forward relative to `dir`) with an
  integer `toggle` per module; if one output is blocked, it sends to the other (no stall
  unless both blocked). It is a belt-like transport: packets pass through it occupying
  its single slot 0 (treat as a 1-slot belt in the movement pass — extend the conveyor
  branch: `mod.type === 'conveyor' || mod.type === 'splitter'` with splitter using
  `SLOTS = 1` semantics and the alternating exit).
- **Underground** is placed as a **pair**: the place command for an `underground` with an
  existing unpaired entrance ≤ 4 tiles straight ahead in the same `dir` becomes its exit
  (store `pair` cell on both instances; `ModuleView.pair` exposes it). Packets entering
  the entrance teleport to the exit's slot 0 after `gapTiles` ticks spent in an internal
  FIFO (`inTransit: { item: ItemType; ticksLeft: number; id: number }[]`, order-stable,
  capacity `gapTiles * SLOTS`). Removing either end removes both (refund both).
- Placement validity (`placementValid` + world.place): underground exit requires a
  matching unpaired entrance in range; the ghost shows the link (main.ts draws the ghost
  at both cells — reuse blueprint's multi-ghost approach if plan #4 added one, else two
  `setGhost` alternating is NOT possible — add `setGhostCells(cells: number[], valid)` to
  the renderer: a thin instanced overlay like `setHighlight`).
- [ ] **Failing tests** (`tests/placement.test.ts` + a new section in
  `tests/recipes.test.ts` for throughput): pair forms at gap ≤ 4, refuses > 4 or
  misaligned; removal removes both + refunds both; packets cross a 3-gap underground in
  3 ticks (item conservation: N in = N out, order preserved); splitter alternates L/R
  over 10 packets (5/5) and sends 10/0 when one side is blocked; determinism run.
- [ ] Implement; models (`models.ts`): splitter = belt base + Y-manifold; underground =
  ramp portal (follow `buildModuleModel` patterns; keep silhouettes distinct).
- [ ] Suites green; re-baseline. Commit: `sim: splitter (alternating) + underground pairs (+models, tests)`.

---

## Task 6 — Belt-speed levels

**Files:** Modify `src/sim/world.ts`, `src/render/renderer.ts`.

- [ ] Movement pass: packets on conveyors attempt `BELT_STRIDE_BY_LEVEL[lvl]` slot-steps
  per tick (loop the existing single-step logic; `movedThisTick` becomes a step counter
  `Map<number, number>` capped at the stride). All existing invariants (no overlap, no
  teleport past occupied slots) hold per step.
- [ ] Renderer: tread scroll speed × (1 + lvl) (`beltTex.offset` line); packet
  interpolation needs no change (prev/cur positions already carry the larger step).
- [ ] Tests: throughput at lv0 vs lv3 on a 10-belt line (≈4× items delivered in a fixed
  window); no-overlap invariant fuzz (200 ticks, assert no two packets share cell+slot).
  Re-baseline. Commit: `sim: belt-speed strides lv0–3`.

---

## Task 7 — Phase gate

- [ ] Full `npm test` + build; playtest: automate gear→circuit→science2 end-to-end on a
  phone viewport; hotbar categories activated (>9 tools) and legible; research graph at
  ~20 nodes.
- [ ] Deploy, live-verify, update `PLAN-INDEX.md`, root `CLAUDE.md`, `src/sim/CLAUDE.md`
  (new items/upgrade tables/underground rules).

**Acceptance (master plan):** tier-1/2 chains automate end-to-end; splitters/undergrounds
behave and explain themselves via tooltips (MODULE_INFO rows exist); research graph legible
with queue; `economy_graph.test.ts` green and guarding.
