# Phase 5 — Fluids & oil (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 5).
> Spec §3.2, §9.1 (guided oil objectives).

**Goal:** the pooled-pressure pipe network + pump/pumpjack/refinery/chem-plant chains:
water → crude → petroleum → plastic → advanced circuits → refined crystal → drift fuel;
`no_fluid` diagnostics; tier-3 guided objectives.

**Branch:** `phase-5-fluids-oil`.

## Pre-flight reality check

- [ ] Phase 4 merged: `FUTURE_ITEMS = ['plastic','adv_circuit','refined_crystal','drift_fuel']`
  still tolerated by `economy_graph` — **this phase empties that list**.
- [ ] Lakes/water and oil deposits already exist in worldgen (Phase 3 decision) — do NOT
  touch `worldgen.ts` generation logic (saves regenerate virgin cells from the seed).
  Verify: `world.water: Set<number>` populated; `deposits` contains `type: 'oil'` blobs in
  canopy; a lake exists near spawn (worldgen test guarantees it).
- [ ] `Blocked` union (Phase 2) is closed over 5 values — this phase adds `'no_fluid'`.
- [ ] Splitter/underground movement rework (Phase 4 Task 5) — pipes are NOT part of the
  packet movement pass at all; keep them out of `occ`/belt logic entirely.

## Contract deltas (exact)

`src/sim/types.ts`:

```ts
export type FluidType = 'water' | 'crude' | 'petroleum';
export type ModuleType = /* … */ | 'pipe' | 'pump' | 'pumpjack' | 'refinery' | 'chem_plant';
export type Blocked = /* … */ | 'no_fluid';
export interface FluidSegmentView {
  id: number; fluid: FluidType | null; volume: number; capacity: number; cells: number[];
}
// Snapshot gains:  fluids: FluidSegmentView[];   // windowed (segments intersecting the window; cells clipped to it)
```

`src/sim/data.ts`:

```ts
// Recipe interface gains:
//   fluidInputs?: { fluid: FluidType; amount: number }[];
//   fluidOutput?: { fluid: FluidType; amount: number };
// New recipes:
refine_petroleum   refinery    fluidIn 2 crude            → fluidOut 1 petroleum   t10 p6
make_plastic       chem_plant  1 coal + fluidIn 1 petroleum → 1 plastic            t12 p6
assemble_adv_circuit assembler 1 circuit + 1 plastic + 2 wire → 1 adv_circuit      t16 p5
refine_crystal     chem_plant  2 crystal + 1 sulfur       → 1 refined_crystal      t16 p6
make_drift_fuel    chem_plant  2 sulfur + fluidIn 1 petroleum → 1 drift_fuel       t20 p7
// Producer rates (units/tick while powered): PUMP_RATE = 4 (water), PUMPJACK_RATE = 2 (crude; halves to 1 at richness 0)
// Segment capacity per pipe cell: PIPE_CAP_PER_CELL = 50
BUILD_COSTS: pipe 1 plate · pump 4 plate + 2 gear · pumpjack 6 steel + 4 gear ·
             refinery 8 steel + 4 circuit · chem_plant 8 steel + 4 circuit
MODULE_CATEGORY: all five → 'production' (pipe → 'logistics')
FUTURE_ITEMS = []            // ← the integrity net now enforces full producibility
TECHS rows going live now (verbatim from the master-plan table):
oil_processing · plastics · sci3 · adv_electronics · sci4 · crystal_refining · fuel_tech
```

## Fluid model (locked)

- A **segment** = maximal orthogonally-connected run of `pipe` cells. Recomputed on any
  pipe place/remove (flood fill over the pipe set; cached; segments sorted by min cell id,
  ids reassigned deterministically each rebuild — ids are presentation-only).
- Segment state: `fluid: FluidType | null`, `volume: int`, `capacity = cells * PIPE_CAP_PER_CELL`.
- **Ports:** a machine connects to the segment containing the pipe cell adjacent to its
  port face: pump/pumpjack output = the cell they FACE (`dir`); refinery/chem_plant input =
  the cell BEHIND them (opposite `dir`), fluid output (refinery petroleum) = the cell they
  FACE. One face each — keeps mobile-legible.
- **Claim rule:** an empty segment takes the fluid type of the first producer that pushes
  into it this tick (sorted producer cell order). A producer/consumer whose fluid ≠
  segment fluid does nothing (machine shows `no_fluid`). A segment empties to `volume 0`
  but keeps its fluid type until **rebuilt** (place/remove) — predictable, no flicker.
- **Merging:** on rebuild, a merged segment keeps the fluid of the sub-segment with the
  larger volume (tie → lower min-cell id); mixed fluids: larger volume wins, the loser's
  volume is **discarded** (toast-worthy but sim-silent; document in MODULE_INFO.pipe).
- **Tick order** (inside `advance()`, after the power pass, before machine processing):
  producers push (up to rate, if powered + space), then consumers pull (machines needing
  fluidInputs check volume ≥ amount when a craft cycle completes — consumption happens
  with solid-input consumption in the completion branch).

---

## Task 1 — `src/sim/fluids.ts` pure module (TDD)

**Files:** Create `src/sim/fluids.ts`, `tests/fluids.test.ts`.
**Produces (exact):**

```ts
export interface Segment { id: number; cells: number[]; fluid: FluidType | null; volume: number; capacity: number }
export function rebuildSegments(pipes: Set<number>, w: number, h: number, prev: Segment[]): Segment[];
export function pushFluid(seg: Segment, fluid: FluidType, amount: number): number; // returns accepted
export function pullFluid(seg: Segment, fluid: FluidType, amount: number): boolean; // all-or-nothing
```

- [ ] **Failing tests:** two separate runs merge on connecting (volumes summed when same
  fluid; larger wins on mixed, loser discarded); split on removal (volume distributed
  proportionally to cell count, integer remainder to the lower-id segment); push respects
  capacity (returns accepted amount); push of a different fluid into a non-empty segment
  returns 0; pull is all-or-nothing; determinism (same op sequence twice ⇒ identical
  JSON).
- [ ] Implement (flood fill with a sorted stack; all integer). Tests PASS. Commit:
  `sim: pooled-pressure fluid segments (pure module + tests)`.

---

## Task 2 — World integration (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`, `src/sim/data.ts`,
`tests/fluids.test.ts` (integration section).

- [ ] Fields: `pipes = new Set<number>()`, `fluidSegs: Segment[] = []` (rebuilt via
  `rebuildSegments` on pipe place/remove; also on load). `pipe` placement stores in BOTH
  `modules` (so erase/undo/blueprint/inspector work uniformly) and `pipes`.
- [ ] Placement rules: `pump` requires an adjacent water cell (any of 4 neighbors in
  `this.water`); `pumpjack` requires `deposits.get(c)?.type === 'oil'`; extend
  `src/ui/placement.ts` `placementValid` with the same predicates (it receives the
  snapshot — water is windowed; use `snapshot.water` + `deposits`).
- [ ] `advance()` fluid step (order as locked above): producers = powered pumps
  (`PUMP_RATE` water) and pumpjacks (`PUMPJACK_RATE` crude, 1 at richness 0 — decrement
  richness per 10 crude pushed via an integer accumulator on the module); refinery is
  both consumer (crude, at cycle completion) and producer (petroleum, pushed into its
  facing segment when a cycle completes; if the output segment lacks space, the cycle
  holds — `output_full`).
- [ ] Recipe engine: extend the readiness check — `ready = solids ready && fluidInputs
  every(seg exists at port && seg.fluid matches && seg.volume >= amount)`; consume fluids
  in the completion branch; `blocked = 'no_fluid'` when solids ready but fluids missing.
  Power draw rows for pump (2) / pumpjack (4) enter the same wants/draw pass (they are
  simple non-recipe machines like miners).
- [ ] Snapshot: `fluids` (windowed as specced). `ModuleView` for the five new types:
  progress/buffer/out/recipe as for other machines; pipes get no per-cell view beyond the
  module row (fill level comes from the segment).
- [ ] **Integration tests:** pump on a lake fills a 5-pipe segment to 250 then blocks;
  pumpjack pushes crude; refinery converts 2 crude → 1 petroleum over t10 with power;
  chem_plant makes plastic (coal + petroleum); starved fluid → `no_fluid`; mixed-fluid
  connect discards smaller; determinism run with pipes.
- [ ] Suites + `economy_graph` (FUTURE_ITEMS now empty — everything must be producible)
  green; **re-baseline**. Commit: `sim: fluid network + oil chain machines (+tests, re-baseline)`.

---

## Task 3 — Renderer

**Files:** Modify `src/render/models.ts`, `src/render/renderer.ts`.

- [ ] `models.ts`: `pipe` auto-connects like belts — build the model from the 4-neighbor
  pipe/machine-port signature (straight/corner/T/cross variants; the renderer passes
  neighbor info: extend `buildModuleModel(type, dir, kit, ctx?)` with
  `ctx = { pipeNeighbors: [n,e,s,w] }` computed in `renderer.setSnapshot` from windowed
  modules — rebuild a pipe's model when its signature changes, like dir changes today).
  Pumpjack: nodding-donkey bob via the existing `anim` hook; refinery/chem_plant:
  distinct silhouettes (tower + tanks; box + vats) following `buildModuleModel` style.
- [ ] Fill tint: per snapshot, for each `FluidSegmentView`, tint member pipes' tube
  material emissive by fluid color (water #3aa0ff, crude #2b2b22, petroleum #b58a2e —
  add `FLUID_COLOR` to types.ts beside ITEM_COLOR) scaled by volume/capacity. Cache
  per-pipe material (do NOT share the kit material for tinted pipes).
- [ ] Visual check: pipe runs auto-join at all 4 rotations; fill animates as volume
  changes; pumpjack bobs only when powered (busy). Commit:
  `render: pipes (auto-connect, fill tint), pumpjack/refinery/chem plant models`.

---

## Task 4 — UI + guided oil objectives + phase gate

**Files:** Modify `src/main.ts` (describe rows for the five machines + pipes),
`src/ui/tutorial.ts` (guided sequence, data-driven), `src/ui/icons.ts`, `src/sim/data.ts`
(TECHS rows live).

- [ ] Inspector: pipes → segment fluid/volume/capacity bar; pump/pumpjack → rate + target
  segment fill; refinery/chem_plant → standard recipe rows + fluid port rows. Tooltips
  (`MODULE_INFO`) for all five, including the mixed-fluid discard warning on pipe.
- [ ] TECHS rows live (Task 2 already added them — verify research graph renders ~27
  nodes with sane columns; `sci3`/`sci4` gate as specced).
- [ ] **Guided oil objectives** (spec §9.1): extend the tutorial module with a second
  step-list `OIL_GUIDE_STEPS` (same `TutorialStep` shape, own localStorage key
  `driftworks.guide.oil`), armed when a snapshot first shows `oil_processing` in
  `research.completed`: find-oil (beacon to the nearest **discovered** oil deposit, else
  a compass hint toward canopy = east) → place pumpjack (detect: any pumpjack module) →
  pipe to refinery (refinery with `no_fluid` cleared) → power it (refinery busy) → first
  plastic (inventory/storage plastic > 0). Dismissible; never re-arms once done.
- [ ] Playtest the full chain on the phone viewport; FTUE regression quick-check.
- [ ] Full `npm test` + build; deploy; live-verify; update PLAN-INDEX/CLAUDE.md files
  (fluids seam in `src/sim/CLAUDE.md`).

**Acceptance (master plan):** water + oil pumped, refined, consumed by automated
plastic → adv-circuit → science3/science4 chains; pipes visibly fill; blocked machines say
`no_fluid`; the canopy oil field is worth the trip; guided objectives carry a new player
over the tier-3 cliff.
