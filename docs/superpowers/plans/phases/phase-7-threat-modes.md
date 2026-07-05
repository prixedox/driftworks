# Phase 7 — Threat layer & modes: Wanderer / Drifter (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 7).
> Spec §3.7, §9.3. **Determinism is the hard part here** — enemies are sim entities; every
> spawn, path step, target pick, and shot must be integer and order-stable.

**Goal:** per-save mode (Wanderer/Drifter) + difficulty; pollution; telegraphed raids;
walls/turrets/ammo; building HP + player repair; Wanderer shows zero combat surface.

**Branch:** `phase-7-threat-modes`.

## Pre-flight reality check

- [ ] Phase 6 merged: `POWER_PRIORITY` exists with class 0 empty (turrets/heaters land
  there); alerts (Phase 2) support `kind: 'raid'` in the union already.
- [ ] Worldgen (Phase 3) — nests were NOT generated. **This phase adds nest placement to
  `worldgen.ts`** and that CHANGES generated worlds for a given seed. Gate: existing v4
  saves regenerate virgin cells from seed — adding nests alters nothing retroactively
  destructive (nests occupy previously-empty edge cells), but the determinism worldgen
  test hashes change. Acceptable pre-1.0; note it in the commit. Nests must never spawn
  inside the starter guarantee radius.
- [ ] `Command init` is `{ type: 'init'; seed }` (Phase 3). It grows mode/difficulty here.
- [ ] Hotbar has `setMilitaryVisible(on)` no-op hook (Phase 2 Task 4).

## Contract deltas (exact)

`src/sim/types.ts`:

```ts
export type GameMode = 'wanderer' | 'drifter';
export type Difficulty = 0 | 1 | 2;                       // Calm / Standard / Relentless
export type ModuleType = /* … */ | 'wall' | 'turret';
export type EnemyKind = 'mite' | 'stalker' | 'behemoth';
export interface EnemyView { id: number; x: number; y: number; px: number; py: number; hp: number; kind: EnemyKind }
// ModuleView gains:   hp?: number; hpMax?: number;
// Snapshot gains:     mode: GameMode; enemies: EnemyView[];
//                     pollution: Uint8Array;              // CHUNKS_X*CHUNKS_Y, clamped 0..255 for display
//                     raid: { incoming: boolean; eta: number };
// Command changes:    | { type: 'init'; seed: number; mode: GameMode; difficulty: Difficulty }
//                     | { type: 'repair'; cell: number }
//                     | { type: 'offline'; ticks: number }
// SaveState:          mode/difficulty now REQUIRED (default 'wanderer'/1 on load of older v4),
//                     plus: pollution: number[]; enemies: { id,x,y,hp,kind }[];
//                     moduleHp: { cell: number; hp: number }[]   // only damaged ones
//                     nextRaidTick: number;
```

`src/sim/data_threat.ts` (new; re-exported from data.ts):

```ts
import type { EnemyKind, ModuleType } from './types';
export const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; dmg: number }> = {
  mite:     { hp: 20,  speed: 6, dmg: 2 },   // speed = ticks per tile step
  stalker:  { hp: 60,  speed: 4, dmg: 5 },
  behemoth: { hp: 300, speed: 8, dmg: 20 },
};
export const ATTACK_PERIOD = 8;              // ticks between hits while adjacent
export const RAID_TABLE: { threshold: number; wave: { kind: EnemyKind; n: number }[] }[] = [
  { threshold: 200,  wave: [{ kind: 'mite', n: 6 }] },
  { threshold: 600,  wave: [{ kind: 'mite', n: 8 }, { kind: 'stalker', n: 3 }] },
  { threshold: 1500, wave: [{ kind: 'mite', n: 10 }, { kind: 'stalker', n: 6 }] },
  { threshold: 3000, wave: [{ kind: 'stalker', n: 8 }, { kind: 'behemoth', n: 1 }] },
  { threshold: 6000, wave: [{ kind: 'stalker', n: 10 }, { kind: 'behemoth', n: 3 }] },
];
export const POLLUTION: Partial<Record<ModuleType, number>> = {
  miner: 2, smelter: 4, assembler: 3, lab: 1, refinery: 6, chem_plant: 6, pumpjack: 3,
  boiler: 5, generator: 1,           // per completed craft/emit/burn cycle
};
export const POLLUTION_DECAY_TICKS = 100;    // −1 per chunk per this many ticks
export const MODULE_HP: Record<ModuleType, number> = { /* wall: 300, turret: 150, every other type: 100 */ } as never; // fill ALL types — tsc enforces
export const TURRET = { range: 5, dmg: 10, ticksPerShot: 4, ammoPerShot: 1, ammoCap: 20 };
export const DIFFICULTY_SCALE = [50, 100, 200];   // % of wave size
export const RAID_INTERVAL = 9000;                // base ticks between raid checks
export const RAID_TELEGRAPH = 1200;               // alert → spawn delay
export const REPAIR = { hpPerPlate: 20 };
BUILD_COSTS: wall 2 plate · turret 5 plate + 2 gear + 2 circuit
MODULE_CATEGORY: wall/turret → 'military' · POWER_PRIORITY: turret → 0 (draw 2)
TECHS rows live now: fortification · turrets_tech · ammo_2 · turret_range
```

## Threat semantics (locked)

- **Pollution:** `pollution: Int32Array(64)` (chunk-indexed, unclamped in sim; clamped for
  the snapshot). +`POLLUTION[type]` on each completed cycle/emit, into the machine's
  chunk. Every `POLLUTION_DECAY_TICKS` ticks, every chunk −1 (floor 0). Spores biome:
  Phase 8 multiplies decay ×4 slower — leave a hook (`decayPeriodFor(chunk)`).
- **Nests (worldgen):** 6 nests per world at map-edge cells (≥ 8 tiles from edge corners,
  ≥ 80 tiles from SPAWN, hash-picked, one per compass-ish sector). Exposed by worldgen as
  `nests: number[]`; stored on World; rendered as POI mounds (Phase 8 makes them lootable).
- **Raid scheduling (threat.ts):** at ticks divisible by
  `RAID_INTERVAL * 100 / DIFFICULTY_SCALE[difficulty] / 100` (precompute integer
  `raidPeriod`), if `totalPollution > RAID_TABLE[nextRaidIdx].threshold` → arm a raid:
  `pushAlert('raid', nestCell)`, `raid = { incoming: true, eta: RAID_TELEGRAPH }`; eta
  counts down each tick; at 0, spawn the wave (sizes × difficulty scale, ÷100 integer,
  min 1) at the nest nearest the **highest-pollution chunk** (ties: lower chunk index).
  `nextRaidIdx` advances past every threshold ≤ current pollution (so pollution growth
  escalates waves). After a raid despawns, idx re-derives from current pollution.
- **Enemy tick (all integer):** enemies live on tile coordinates (packets-style
  interpolation via px/py). Each enemy steps every `speed` ticks: greedy step (dx or dy
  sign toward target, prefer the axis with larger delta; ties prefer x) unless the step
  cell holds a module — then attack it instead (every `ATTACK_PERIOD` ticks, −dmg HP).
  Target = nearest module in the target chunk (recomputed when destroyed; if the chunk
  empties, retarget to nearest module globally; if no modules exist, despawn all).
  Iteration over enemies sorted by id. Two enemies may share a tile (no collision — keeps
  it cheap and deterministic).
- **Buildings:** all modules get `hp` (init `MODULE_HP[type]`). At hp ≤ 0: remove module
  (no refund, no undo entry), leave nothing. `repair` command: +`hpPerPlate` per plate
  from inventory (consume 1 plate per call step; main sends repeatedly while held).
- **Turrets:** each tick when powered and `ammo > 0` (internal buffer fed by belts like a
  boiler, accepts `ammo` only, cap `ammoCap`): every `ticksPerShot`, hit the nearest
  enemy in `range` (Chebyshev distance; ties: lower enemy id) for
  `dmg × (ammo_dmg lv ? 150 : 100) / 100`; range +1 per `turret_range` level.
- **Wanderer:** the threat module never runs; pollution still accumulates (harmless —
  and Drifter-upgrade-proof), enemies list always empty, military TECHS/tools hidden.
- **Offline:** `{ type: 'offline', ticks }` advances in a loop with a `raidsSuppressed`
  flag: scheduling checks skip; eta freezes; existing spawned enemies still act (they were
  already telegraphed). Worker slices ≤ 2000 ticks per event-loop turn (setTimeout(0)
  between slices) and posts a snapshot after each slice.

---

## Task 1 — HP + pollution + repair (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`; create `src/sim/data_threat.ts`,
`tests/threat.test.ts` (section 1).

- [ ] Failing tests: a smelter completing crafts adds `POLLUTION.smelter` to its chunk;
  decay reaches 0 and stays; `moduleHp` snapshot fields appear only when damaged
  (hp < hpMax); `repair` heals 20/plate, consumes plates, stops at hpMax, no-ops at 0
  plates; save round-trips pollution + damaged HP.
- [ ] Implement (fields, snapshot, save v4 additions with backward-tolerant load
  defaults). Suites + re-baseline. Commit: `sim: building HP, chunk pollution, repair`.

---

## Task 2 — `src/sim/threat.ts` — raids (TDD)

**Files:** Create `src/sim/threat.ts`; modify `src/sim/world.ts` (integration),
`src/sim/worldgen.ts` (+ nests, + worldgen test rows), `src/sim/worker.ts` (init/repair/
offline commands), `tests/threat.test.ts`.

**threat.ts surface (exact):**

```ts
export interface ThreatState { enemies: Enemy[]; nextId: number; raidEta: number; raidArmed: boolean; targetChunk: number }
export function threatTick(w: WorldLike, st: ThreatState, difficulty: Difficulty, suppressed: boolean): void;
// WorldLike = the narrow interface it needs: pulse, pollution, nests, modules, damage(cell, dmg), pushAlert(...)
```

- [ ] **Failing tests (fixed seed, scripted):** zero pollution ⇒ no raid across 3 raid
  periods; pollution over threshold ⇒ `raid` alert exactly at the period tick, spawn
  exactly `RAID_TELEGRAPH` later at the nest nearest the polluted chunk; two identical
  runs → identical enemy arrays every 50 ticks; an undefended wall line is chewed through
  (wall hp 300 / mite dmg 2 per 8 ticks × 6 mites — assert the wall dies and enemies
  proceed); turret with ammo kills a 6-mite wave (assert all dead, ammo spent =
  shots × 1); turret without ammo never fires; `offline` ticks never arm a raid; Wanderer
  never runs threatTick (world flag); Calm halves and Relentless doubles wave size.
- [ ] Implement threat.ts + world wiring (`mode`, `difficulty` fields set by `loadNew`;
  `advance()` calls `threatTick` only in drifter mode; enemies/raid into snapshot; save
  fields). Worker: init carries mode/difficulty; `repair`; `offline` (sliced loop as
  locked above).
- [ ] Suites + re-baseline (twice: worldgen hashes too). Commit:
  `sim: deterministic raids — scheduling, pathing, combat, offline suppression (+tests)`.

---

## Task 3 — Render + UI

**Files:** Modify `src/render/models.ts` (wall, turret, enemy meshes),
`src/render/renderer.ts`, `src/render/effects.ts`, `src/ui/hud.ts`, `src/ui/hotbar.ts`,
`src/main.ts`, `src/style.css`.

- [ ] **Enemies:** pooled meshes keyed by id (exactly the packet pattern:
  create/remove in `setSnapshot`, interpolate px/py→x/y in `frame()`); kind-distinct
  silhouettes (mite = low wedge, stalker = tall spider-ish, behemoth = bulky) with a
  hostile emissive palette (style.ts `ENEMY_COLOR`).
- [ ] **Combat feedback (`effects.ts`):** turret muzzle flash + a tracer line
  (fade 100 ms) from turret to its target (`ModuleView` gains transient `shotAt?: number`
  cell — include in snapshot only on firing ticks), impact sparks on hit, small rubble
  puff on building death.
- [ ] **HP bars:** billboard quad above damaged modules (hp < hpMax), red fill ratio;
  reuse the alt-overlay sprite pooling; hidden beyond 60% zoom-out if perf demands.
- [ ] **Raid UX:** alert chip (Phase 2 feed handles it — copy: "Raid incoming — {eta}s")
  + a persistent countdown chip next to the objective chip while `raid.incoming`; beacon
  auto-set to the nest; ammo row in turret inspector (buffer/cap); repair = hold-tap on a
  damaged building with no tool armed → `repair` command every 250 ms while held
  (mobile: same long-press-hold; show '+HP' floats).
- [ ] **Mode gating:** `hud`/`hotbar.setMilitaryVisible(snapshot.mode === 'drifter')` —
  hides the military category tab and military TECHS in the research graph (filter by a
  `military?: true` flag added to those TECHS rows in data.ts).
- [ ] Visual check (Drifter save, forced pollution): telegraph → spawn → walls hold →
  turrets fire with tracers → repair works; Wanderer shows nothing military anywhere.
  Commit: `render/ui: enemies, combat feedback, HP bars, raid UX, mode gating`.

---

## Task 4 — Mode select overlay + init/save wiring + phase gate

**Files:** Create `src/ui/modeselect.ts`; modify `src/main.ts`, `tests/_harness.ts`.

- [ ] **modeselect.ts:** shown only when no save exists (before the first `init`): two
  cards — **Wanderer** (badge "Start here", cozy copy) and **Drifter** ("The full
  pressure") — difficulty segmented control (default Standard), optional numeric seed
  field (blank → derive from `Date.now()` **in main.ts**, never the sim), Start button →
  `send({ type: 'init', seed, mode, difficulty })`. Existing saves skip it entirely
  (mode lives in the save). Reset (dock) now returns to this overlay.
- [ ] `_harness.ts` + all tests: `loadNew(seed)` defaults to
  `('wanderer', 1)` — signature `loadNew(seed, mode = 'wanderer', difficulty = 1)`; threat
  tests pass 'drifter' explicitly. Verify every suite is green unmodified otherwise.
- [ ] Playtest a full Standard raid cycle on the phone viewport (place polluters, wait,
  defend). FTUE check: new Wanderer game → tutorial runs, zero combat UI.
- [ ] Full `npm test` + build; deploy; live-verify; update PLAN-INDEX, root CLAUDE.md,
  `src/sim/CLAUDE.md` (threat seam + WorldLike interface), spec if any tunable moved.

**Acceptance (master plan):** a polluting Drifter base draws a telegraphed raid that
walls+turrets+ammo repel; losses are repairable; Calm/Standard/Relentless visibly scale;
Wanderer shows zero combat surface; determinism suite green including a threat-mode script.
