# Phase 8 — Exploration: POIs, live hazards, radar, heater, rover (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 8).
> Spec §3.5, §9. Rover (Task 5) is the plan's designated **stretch — cut first** if the
> phase runs long.

**Goal:** crossing the world pays off (ruins → free tech, salvage → items, nests →
loot-once) and each biome acts (storms, cold+heaters, spores, lava, dark), with radar for
map intel.

**Branch:** `phase-8-exploration`.

## Pre-flight reality check

- [ ] Phase 7 merged: nests exist in worldgen + threat targeting; `WorkerMessage 'map'`
  reply has `pois: never[]` placeholder (Phase 3) — becomes real here.
- [ ] Worldgen changes again this phase (POI placement) — same caveat as Phase 7: worldgen
  test hashes re-baseline; placement must respect existing guarantees (test-enforced).
- [ ] `SOLAR_CURVE`/`solarFactor` (Phase 6) — storms halve it here; verify where
  solarFactor is computed so the hazard hook lands in one place.
- [ ] Pollution decay hook `decayPeriodFor(chunk)` left by Phase 7.

## Contract deltas (exact)

```ts
// types.ts
export type ModuleType = /* … */ | 'radar' | 'heater' | 'rover_bay';
export type PoiKind = 'ruin' | 'salvage' | 'nest';
export interface PoiView { cell: number; kind: PoiKind; looted: boolean }
// Snapshot gains:  pois: PoiView[];                        // discovered only
//                  hazard: { storm: boolean; stormEta: number };  // stormEta = ticks to next state flip
// Command gains:   | { type: 'loot'; cell: number }
// WorkerMessage 'map' reply: pois: PoiView[] (discovered)

// data_biomes.ts additions
export const POI_TABLE: Record<BiomeId, { ruins: number; salvage: number }> = {
  dust: { ruins: 2, salvage: 3 }, ridge: { ruins: 2, salvage: 3 }, canopy: { ruins: 2, salvage: 3 },
  ember: { ruins: 2, salvage: 3 }, hollows: { ruins: 1, salvage: 2 },
};
export const SALVAGE_LOOT: { item: ItemType; n: [number, number] }[] = [
  { item: 'plate', n: [20, 60] }, { item: 'gear', n: [5, 20] }, { item: 'circuit', n: [3, 12] },
];                                    // pick per-cache via hash
export const STORM = { periodDays: 3, durationTicks: 1200 };  // hash-scheduled, see below
export const COLD_SLOW_PCT = 50;      // machines outside heater aura run at 50%
export const HEATER = { radius: 4, power: 2 };                // priority class 0
export const RADAR = { radius: 12, power: 3 };                // priority class 0
export const SPORE_DECAY_MULT = 4;    // pollution decays 4× slower in canopy chunks
BUILD_COSTS: radar 4 plate + 2 circuit · heater 4 plate + 2 gear · rover_bay 20 steel + 10 circuit
MODULE_CATEGORY: radar/heater/rover_bay → 'misc' · POWER_PRIORITY: radar 0, heater 0
TECHS rows live now: cartography · heaters · rover_tech (stretch)
```

## Locked semantics

- **POIs (worldgen):** per-biome counts from `POI_TABLE`, hash-placed on land, ≥ 10 tiles
  apart, ≥ 12 from SPAWN except **one guaranteed ruin within 40 tiles of SPAWN**
  (fallback stamp like the deposit guarantees). Nests (Phase 7) join `pois` with
  `kind: 'nest'`. World stores `pois: Map<number, { kind: PoiKind; looted: boolean }>`;
  looted state persists in save v4 (`lootedPois: number[]`).
- **Loot rules (`loot` command — position is a client claim, like `collect`):**
  ruin → complete the cheapest unresearched tech whose prereqs are all met (deterministic:
  sort by cost then id; uses the normal `completeResearch` path so unlocks/alerts fire;
  none available → grant 50 science to inventory instead); salvage → items per
  `SALVAGE_LOOT` hash-pick into inventory + toast; nest → lootable only when no raid is
  armed and no enemies alive (`50 ammo + 20 circuit` bounty, Drifter only). All one-time
  (`looted: true`).
- **Storms (dust chunks):** schedule by day index: storm on day `d` iff
  `hash2(seed, d, 7) % STORM.periodDays === 0`, active for the first
  `durationTicks` of that day. While active: `solarFactor = solarFactor / 2 | 0` for
  panels on dust cells; snapshot `hazard.storm`; renderer thickens fog + wind particles;
  `stormEta` = ticks until the flip (UI shows "Dust storm — Xs").
- **Cold (ridge):** machines on ridge cells run at `COLD_SLOW_PCT` (recipe/miner
  progress advances every OTHER worked tick — integer: a per-module `coldToggle` bit)
  unless within Chebyshev `HEATER.radius` of a **powered** heater. Heater auras =
  a `Set<number>` rebuilt on heater place/remove/power-change (cheap: few heaters).
- **Spores (canopy):** `decayPeriodFor(chunk)` returns `POLLUTION_DECAY_TICKS *
  SPORE_DECAY_MULT` for majority-canopy chunks (precompute per chunk at load).
- **Lava (ember):** worldgen marks lava cells inside ember (blob edges of a few dedicated
  blobs; stored like `water`). Unbuildable (`place` refuses + `placementValid`); walking:
  client-side knockback + screen flash in renderer/main (player is never harmed — spec).
  Belts/pipes cannot cross; undergrounds CAN (they tunnel — the pair validity check
  ignores lava between the ends). Lava cells render emissive orange with heat shimmer
  particles.
- **Dark (hollows):** already: solar 0 (Phase 6) + fog-of-war black. Add: renderer clamps
  the day/night curve to night-ambient for the camera when the player stands in hollows,
  with a local light pool around player + powered machines (one PointLight following the
  player is enough; machine glow via existing emissives).
- **Radar:** powered radar reveals `RADAR.radius` (Chebyshev) around itself **in the
  sim** once on placement and again whenever power returns (cheap: reveal is idempotent
  bit-sets). Also acts as a map beacon (minimap pip).
- **Rover (stretch):** `rover_bay` + `rover_tech`; bay crafts a rover over 60 s (recipe
  row `build_rover`: 100 steel + 50 circuit → 1 `rover` item… **No** — keep the sim out:
  the bay is a plain machine whose ModuleView exposes `roverReady` after consuming inputs
  once). Mounting = walk onto the bay, main.ts toggles rover mode: player speed ×2
  (`WALK_SPEED` factor in renderer via `setSpeedFactor(2)`), reveal radius 6 → sent as
  bigger reveal batches, player mesh swaps to the rover model. Dismount = tap the bay.
  Purely client-side; persists as `rover: boolean` in save (main-side field).

---

## Task 1 — Worldgen POIs + lava (TDD)

**Files:** Modify `src/sim/worldgen.ts`, `src/sim/data_biomes.ts`,
`tests/worldgen.test.ts`.

- [ ] Failing tests: POI counts per biome match `POI_TABLE` (± the guaranteed ruin);
  spacing ≥ 10; the SPAWN-40 ruin guarantee holds for seeds 1–50; lava only in ember,
  never on deposits/water/POIs; determinism.
- [ ] Implement; re-baseline worldgen-affected hashes. Commit:
  `sim: worldgen POIs (ruins/salvage) + ember lava fields`.

---

## Task 2 — Hazards live (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`, `src/sim/data_biomes.ts`;
create `tests/hazards.test.ts`.

- [ ] Failing tests: storm schedule matches the hash rule across 10 simulated days
  (advance DAY_TICKS chunks with a helper that fast-sets `pulse` — no, pulse must tick:
  use small DAY override? **No overrides in sim** — instead compute expected storm days
  from `hash2` directly and assert `hazard.storm` at sampled ticks on those days);
  cold: identical smelters on/off ridge, aura on/off → ridge-no-heater completes half
  the crafts of the dust one over 240 ticks, heater aura restores parity, unpowered
  heater does not; spores: same pollution emission decays 4× slower in a canopy chunk;
  lava: place on lava refused; underground pair spanning lava allowed; determinism run.
- [ ] Implement (hooks noted above; `hazard` in snapshot). Suites + re-baseline. Commit:
  `sim: live hazards — storms, cold+heaters, spores, lava (+tests)`.

---

## Task 3 — Radar, heater, loot flow

**Files:** Modify `src/sim/world.ts`, `src/sim/worker.ts` (loot command, map reply pois),
`src/ui/mapview.ts`, `src/ui/minimap.ts`, `src/main.ts`, `src/render/models.ts`
(radar dish spin anim, heater glow aura ring, POI mound/ruin/cache meshes in scenery.ts).

- [ ] Sim: radar reveal-on-power; `loot` command with the rules above (+ `lootedPois`
  in save); pois in snapshot (discovered only) + map reply.
- [ ] UI: map view + minimap render POI pins (ruin ◆, salvage ▪, nest ☠ — Drifter only);
  walking within 1 tile of an unlooted POI shows a "Loot" floating button (main.ts,
  like the collect radius check) → `send({ type: 'loot', cell })`; result toast
  ("Ancient cache: Copper Processing researched!" / itemized salvage).
- [ ] TECHS `cartography`/`heaters` verified live (added in data during Task 2/3 —
  `economy_graph` guards). Visual check each POI type + radar reveal + heater aura ring
  (subtle ground decal, drawn like `setHighlight`).
- [ ] Commit: `sim/ui: radar, heater, POI loot flow`.

---

## Task 4 — Biome ambience pass

**Files:** Modify `src/render/effects.ts`, `src/render/scenery.ts`, `src/render/style.ts`.

- [ ] Per-biome ambient particles keyed by the player's current biome (dust motes /
  snow / spores / embers / crystal sparkle — one pooled system, palette+behavior from a
  `BIOME_AMBIENT` table in style.ts), storm visuals (fog density ×3 lerp + horizontal
  particle velocity while `hazard.storm`), lava shimmer, hollows player-light. Respect
  the plan-#6 particle quality toggle.
- [ ] Visual sweep: `?tp=` through all five biomes, day + night + storm, screenshots
  both viewports; check `renderer.info` draw calls stay < 150 at each stop.
- [ ] Commit: `render: biome ambience, storm/lava/dark hazard visuals`.

---

## Task 5 — (Stretch) Rover

**Files:** Modify `src/sim/data.ts` (rover_tech row already; bay recipe/consume),
`src/render/models.ts` (+ rover player model), `src/render/renderer.ts`
(`setSpeedFactor`), `src/main.ts` (mount/dismount + save field + bigger reveal radius).

- [ ] As locked above; test: bay consumes inputs once, `roverReady` persists via save;
  mount/dismount round-trip; speed factor visibly doubles.
- [ ] Commit: `feature: rover — fast traversal mount (client-side)`. **Skip cleanly if
  the phase is over budget — delete the TECHS row too (economy_graph stays green).**

---

## Task 6 — Phase gate

- [ ] Full `npm test` + build; playtest: a trek to ridge (heater base) and canopy (loot a
  ruin on the way) feels rewarding; storms read clearly; nothing hazard-related
  soft-locks (hand-mining always possible — run `tests/softlock`-style manual check:
  erase everything, verify recovery path).
- [ ] Deploy; live-verify; PLAN-INDEX + CLAUDE.md updates (hazard hooks in sim CLAUDE.md).

**Acceptance (master plan):** a trek to any biome pays off and feels different; heater
makes Ridge factories viable; radar+map turn exploration into planning; hazards suite
green.
