# Phase 6 — Power network v2 (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 6).
> Spec §3.6.

**Goal:** steam power (boiler + water + coal → steam engines), solar with the day/night
clock, accumulators, deterministic brown-out priority shedding, and a power graph — plus
the lab finally draws power (clears a launch-era backlog item).

**Branch:** `phase-6-power-network`.

## Pre-flight reality check

- [ ] Phase 5 merged: fluid segments + pump/pipes exist (boiler consumes piped water);
  `dayPhase` in snapshot since Phase 3; stats panel (plan #5) has the ring-buffer pattern
  to extend for the power graph.
- [ ] Power pass in `world.ts` is still: sum produced → iterate sorted cells → wants/draw
  → `worked` set, `power = { produced, used, deficit }`. The pass is rewritten here.
- [ ] `GEN_OUTPUT_BY_LEVEL` (Phase 4) drives the starter generator.

## Contract deltas (exact)

`src/sim/types.ts`:

```ts
export type ModuleType = /* … */ | 'boiler' | 'steam_engine' | 'solar' | 'accumulator';
export interface PowerView {
  produced: number; used: number; deficit: boolean;
  stored: number; storedMax: number;
  solarFactor: number;            // 0..100 integer, derived from dayPhase (and hazards in Phase 8)
}
// Snapshot.power: PowerView   (replaces the 3-field object)
```

`src/sim/data.ts`:

```ts
export const POWER_PRIORITY: Partial<Record<ModuleType, 0 | 1 | 2>> = {
  // class 0 (never shed): turret/heater/radar arrive in Phases 7–8
  miner: 1, conveyor: 1, splitter: 1, underground: 1, pump: 1, pumpjack: 1,
  smelter: 2, assembler: 2, lab: 2, refinery: 2, chem_plant: 2,
};                                  // absent = draws no power (storage, pipes, generators)
export const GENERATOR_OUT = 4;     // starter turbine, REBALANCED (GEN_OUTPUT_BY_LEVEL → [4, 6, 8])
export const STEAM_ENGINE_OUT = 12;
export const SOLAR_OUT = 6;         // × solarFactor/100, integer floor
export const BOILER = { coalTicks: 40, waterPerTick: 5, feeds: 2 }; // 1 coal / 40 ticks
export const ACCUMULATOR = { cap: 500, rate: 5 };
export const LAB_POWER = 2;         // labs draw power now (backlog fix)
// SOLAR_CURVE: 24 integers (0..100), indexed by (dayPhase * 24 / DAY_TICKS) | 0 — dawn ramp,
// full day, dusk ramp, night zeros. No floats in the sim: factor = SOLAR_CURVE[idx].
BUILD_COSTS: boiler 6 plate + 2 gear · steam_engine 8 plate + 4 gear ·
             solar 4 plate + 2 circuit · accumulator 4 steel + 4 circuit
MODULE_CATEGORY: all four → 'power'
TECHS rows live now: steam_power · solar_power · accumulators · efficiency
POWER_EFF_PCT_BY_LEVEL = [100, 75]  // efficiency upgrade: draws ×3/4, integer: (draw*pct+99)/100|0, min 1
```

## Power pass v2 (locked semantics — rewrite the existing pass)

1. **Produce:** generators (`GEN_OUTPUT_BY_LEVEL`), steam engines (12 each **if fed**: a
   steam engine is fed when orthogonally adjacent to a boiler that burned this tick; a
   boiler burns when it has coal buffered (solid input via belts, `inBuf`) AND pulls
   `waterPerTick` from its port segment; each boiler feeds at most `BOILER.feeds`
   engines — assign engines to boilers by sorted cell id, deterministic), solar
   (`(SOLAR_OUT * solarFactor / 100) | 0` each; `solarFactor = SOLAR_CURVE[idx]`, and 0
   for panels standing in `hollows` biome cells).
2. **Demand:** iterate sorted cells; compute each machine's `draw` (recipe power or table)
   × `POWER_EFF_PCT_BY_LEVEL`. Collect wants per priority class.
3. **Allocate:** class 0 first, then 1, then 2; within a class ascending cell id gets
   power first, **higher cell id sheds first** (i.e. when budget runs out mid-class, the
   remaining higher ids brown out). Budget = produced + accumulator discharge (below).
4. **Accumulators:** after allocation, `surplus = produced − granted`; if surplus > 0,
   charge (≤ `rate`/tick each, ascending id) until stored = cap. If demand exceeded
   produced, accumulators discharge (≤ `rate`/tick each, ascending id) to cover class
   order before anything sheds; only after storage is exhausted does shedding occur.
   `deficit = true` only when something actually shed.
5. `PowerView`: produced (incl. solar/steam), used = granted, stored/storedMax summed,
   solarFactor.

Boilers/steam engines/solar/accumulators are placed like any machine; boiler is a
recipe-less machine with a coal `inBuf` (cap 4, fed by belts exactly like smelter input —
extend the belt-delivery branch: boilers accept `coal` only).

---

## Task 1 — Sim (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`, `src/sim/data.ts`,
`src/sim/worker.ts` (nothing new — no new commands). Create `tests/power.test.ts`.

- [ ] **Failing tests** (`tests/power.test.ts`; use `placeRawPublic`, direct `inBuf`
  seeding, and a helper to lay a pump→pipes→boiler water line):
  - boiler+engine produce 12 iff coal AND water present; stop within `coalTicks` after
    coal runs out; 1 boiler + 3 adjacent engines → only 2 fed (sorted-id pick);
  - solar: factor follows `SOLAR_CURVE` (advance to a known dayPhase by ticking; assert
    produced at noon = 6×panels, at night = 0); a panel on a `hollows` cell contributes 0;
  - accumulator: charges on surplus at ≤ 5/tick; on deficit, discharges before anything
    sheds; `deficit === false` while storage covers the gap;
  - priority shedding: build class-1 (miner) + two class-2 (smelters) + tight supply →
    exactly the higher-cell-id smelter sheds (`blocked === 'no_power'`), miner keeps
    working; `low_power` alert fires when shedding starts (reuse the Phase-2 latch — move
    the latch trigger from `deficit` to "shed something");
  - lab draws `LAB_POWER` (a lab with science but no power does not consume/progress —
    the launch-backlog fix, assert it);
  - determinism: full plant (steam + solar + accus) 200-tick two-run identity.
- [ ] Implement the pass rewrite + boiler/engine/solar/accumulator instances (fields on
  `ModuleInst`: `stored?` for accumulator, `burnTicks?` for boiler). Snapshot `PowerView`.
- [ ] All suites green (statusbar compiles against `PowerView` — fix its power bar to
  show `used/produced` + a stored pip); **re-baseline**. Commit:
  `sim: power network v2 — steam/solar/accumulators, priority shedding, lab draw (+tests)`.

---

## Task 2 — Models + UI + phase gate

**Files:** Modify `src/render/models.ts`, `src/ui/stats.ts`, `src/ui/statusbar.ts`,
`src/main.ts` (describe rows), `src/sim/data.ts` (MODULE_INFO rows for the four).

- [ ] Models: boiler (drum + firebox glow when burning — `anim` hook off `busy`),
  steam engine (piston bob), solar (tilted panel; emissive by solarFactor via a per-frame
  hook reading the snapshot — pass solarFactor down like `busy`), accumulator (cell stack;
  emissive scales with `stored` — add `stored01?: number` to `ModuleView`).
- [ ] Stats panel: a power section — produced/used/stored **graph over time** (extend the
  plan-#5 sparkline history with `power: number[]` produced series + `used: number[]`;
  two-line sparkline, labels, deficit tick marks). Statusbar: sun/moon glyph by
  `solarFactor` (>0 sun) + stored bar.
- [ ] Inspector rows: boiler (coal buffer, water segment fill, engines fed), engine
  (fed y/n, output), solar (current output, factor), accumulator (stored/cap bar).
- [ ] `low_power` alert copy: "Power shortfall — labs and smelters are browning out"
  (ALERT_LABEL in alerts.ts).
- [ ] Playtest: night with only solar → accus drain → labs shed first, turret-class
  nothing yet (class 0 empty); steam plant carries the night. Verify Crystal Hollows
  solar dead (`?tp=`).
- [ ] Full `npm test` + build; deploy; live-verify; PLAN-INDEX + CLAUDE.md updates
  (power pass semantics in `src/sim/CLAUDE.md`; the "lab draws no power" backlog line in
  root CLAUDE.md is now stale — remove it).

**Acceptance (master plan):** a coal+water steam plant carries the base at night;
solar+accumulators carry the day; a deliberate overload sheds labs before miners and the
graph shows why; Crystal Hollows genuinely needs non-solar power.
