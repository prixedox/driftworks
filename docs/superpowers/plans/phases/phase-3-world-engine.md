# Phase 3 — World engine: chunks, seed, biomes, fog, map, save v4 (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 3, incl.
> Task 3.7). Spec §3.5, §6, §9.5. **This is the highest-risk phase** — it rewrites the
> world model. Keep every task's determinism suite green before moving on.

**Goal:** 256×256 seeded chunked world, five biomes (+ lakes), finite-richness deposits with
a 10% trickle floor, sim-owned fog of war, windowed snapshots, day/night clock, full-screen
map view, save v4 with v3 migration, and hardened IndexedDB save storage.

**Branch:** `phase-3-world-engine`.

## Pre-flight reality check

- [ ] Phase 2 merged (`alerts`, `blocked`, research queue in snapshot; determinism hash
  current). `tests/_harness.ts` exposes `replayHash/snapshotHash` as today.
- [ ] `world.ts` still: `GRID_W=40/GRID_H=26`, `ore: Map<number, OreType>`, `genWorld()`
  with `mulberry32`, `loadDemo()`, `loadSave(s)`; `snapshot()` sends `ore[]`/`oreType[]`.
  Renderer rebuilds scenery keyed on `s.ore.length` (`lastOreSig`) — that seam is replaced.
- [ ] Plan #5 minimap reads `s.ore` + `s.modules`; plan #6 settings store exists; plan #4
  blueprint/undo live in world.ts (their cell math is grid-width-relative — verify it uses
  `this.w`, not literals).
- [ ] `main.ts` save path: `SAVE_KEY='driftworks.save.v3'`, `readSave/writeSave/migrateToV3`.

## Locked design decisions (this plan)

1. **Lakes ship now** (not Phase 5): worldgen versioning — virgin cells regenerate from the
   seed, so the generator must not change once players have v4 saves. Water is inert until
   pumps exist. Note this in the Phase 5 pre-flight when you get there.
2. **`loadDemo()` becomes `loadNew(seed)`** + a compat wrapper `loadDemo() { this.loadNew(1); }`
   so every existing test keeps passing unmodified; the starter base is seeded at the spawn.
3. **Map view data** is pulled on demand: a `{ type: 'map' }` command makes the worker post
   a one-shot `{ type: 'map', ... }` message (discovered deposits + chunk biomes). Snapshots
   stay lean; determinism untouched (read-only).
4. **Fog is sim state**, revealed via `{ type: 'reveal', cells }` commands batched by the
   main thread from player position (radius 6). Main keeps a mirror bitset to avoid resends.

## Contract deltas (exact)

`src/sim/types.ts`:

```ts
export type BiomeId = 'dust' | 'ridge' | 'canopy' | 'ember' | 'hollows';
export type OreType = 'iron' | 'copper' | 'coal' | 'sulfur' | 'crystal' | 'oil';
export const WORLD_W = 256; export const WORLD_H = 256; export const CHUNK = 32;
export const CHUNKS_X = WORLD_W / CHUNK; export const CHUNKS_Y = WORLD_H / CHUNK; // 8×8

export interface DepositView { cell: number; type: OreType; richness: number }

export interface Snapshot {
  // w/h now report 256; REMOVED: ore[], oreType[].  ADDED:
  window: { x: number; y: number; w: number; h: number }; // tile rect covered by modules/packets/deposits/biome
  deposits: DepositView[];      // windowed
  biome: BiomeId[];             // window.w * window.h entries, row-major within the window
  water: number[];              // windowed water cells (absolute cell ids)
  discovered: Uint8Array;       // full map, 1 bit/tile, 8192 bytes
  minimap: Uint8Array;          // CHUNKS_X*CHUNKS_Y entries; dominant BiomeId index (0-4), +5 if any water
  dayPhase: number;             // pulse % DAY_TICKS
}

export type Command =
  | { type: 'init'; seed: number }                                  // CHANGED (seed required)
  | { type: 'window'; x: number; y: number; w: number; h: number }
  | { type: 'reveal'; cells: number[] }
  | { type: 'map' }
  | /* …all existing variants unchanged… */;

export type WorkerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'map'; deposits: DepositView[]; pois: never[] };        // pois filled in Phase 8

export interface SaveState {                                        // version: 4
  version: 4;
  seed: number;
  modules: { cell: number; type: ModuleType; dir: Dir; recipe?: string }[]; // recipe now persisted
  storage: Record<ItemType, number>;
  pulse: number;
  player?: { x: number; y: number };
  inventory: Record<ItemType, number>;
  unlocked: string[];
  research: { active: string | null; progress: number; completed: string[]; queue: string[] };
  upgrades: UpgradeId[];
  minedDeposits: { cell: number; richness: number }[]; // only cells whose richness differs from virgin
  discovered: string;                                   // base64 of the bitset
  dayPhase: number;
  mode?: 'wanderer' | 'drifter';                        // populated in Phase 7
  difficulty?: 0 | 1 | 2;
}
```

`src/sim/data_biomes.ts` (new; re-export everything from `data.ts`):

```ts
import type { BiomeId, OreType } from './types';
export interface BiomeDef {
  id: BiomeId; name: string;
  /** Ground palette indices used by the renderer (style.ts BIOME_PALETTES). */
  deposits: { type: OreType; blobs: number; r: [number, number]; richness: [number, number] }[];
  hazard: 'storm' | 'cold' | 'spores' | 'lava' | 'dark';
}
export const BIOMES: BiomeDef[] = [
  { id: 'dust',    name: 'Dust Flats',      hazard: 'storm',
    deposits: [ { type: 'iron', blobs: 14, r: [2, 4], richness: [400, 900] },
                { type: 'coal', blobs: 3,  r: [2, 3], richness: [250, 500] },
                { type: 'copper', blobs: 1, r: [2, 2], richness: [250, 400] } ] },
  { id: 'ridge',   name: 'Frozen Ridge',    hazard: 'cold',
    deposits: [ { type: 'copper', blobs: 12, r: [2, 4], richness: [500, 1000] },
                { type: 'iron', blobs: 4, r: [2, 3], richness: [300, 600] } ] },
  { id: 'canopy',  name: 'Toxic Canopy',    hazard: 'spores',
    deposits: [ { type: 'oil', blobs: 8, r: [1, 2], richness: [800, 1600] },
                { type: 'iron', blobs: 3, r: [2, 3], richness: [300, 600] } ] },
  { id: 'ember',   name: 'Ember Wastes',    hazard: 'lava',
    deposits: [ { type: 'coal', blobs: 12, r: [2, 4], richness: [500, 1000] },
                { type: 'sulfur', blobs: 8, r: [2, 3], richness: [400, 800] } ] },
  { id: 'hollows', name: 'Crystal Hollows', hazard: 'dark',
    deposits: [ { type: 'crystal', blobs: 10, r: [1, 3], richness: [300, 700] } ] },
];
export const DAY_TICKS = 4800;
export const SPAWN = { x: 72, y: 128 };  // inside 'dust'
```

Region layout (fixed, wobbled by noise ±6 tiles at the borders): `dust` = an ellipse around
SPAWN (radius ~56×44); `ridge` = north band (y < 64 outside dust); `canopy` = east band
(x > 168, y < 168); `ember` = south band (y > 192); `hollows` = far-east pocket
(x > 208, 64 ≤ y ≤ 160); anything else = `dust`-fringe. Lakes: ~10 blobs (r 2–4) anywhere
except `hollows`, plus one guaranteed at SPAWN+(10..16, −4..4). Deposits never on water.

---

## Task 1 — `src/sim/worldgen.ts` (pure, TDD)

**Files:** Create `src/sim/worldgen.ts`, `src/sim/data_biomes.ts`, `tests/worldgen.test.ts`.
**Produces:** `hash2(seed,x,y): number` (32-bit uint), `generate(seed): GenWorld` where
`GenWorld = { biome: BiomeId[] /* full map */, water: Set<number>, deposits: Map<number, { type: OreType; richness: number }> }`.

- [ ] **Step 1: failing tests** (`tests/worldgen.test.ts`):

```ts
import { generate, hash2 } from '../src/sim/worldgen';
import { WORLD_W, WORLD_H } from '../src/sim/types';
import { SPAWN } from '../src/sim/data_biomes';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };
const cell = (x: number, y: number) => y * WORLD_W + x;

ok(hash2(1, 5, 9) === hash2(1, 5, 9), 'hash2 deterministic');
ok(hash2(1, 5, 9) !== hash2(2, 5, 9), 'hash2 seed-sensitive');
ok(Number.isInteger(hash2(1, 5, 9)) && hash2(1, 5, 9) >= 0, 'hash2 is a uint');

const a = generate(42), b = generate(42), c = generate(43);
ok(JSON.stringify([...a.deposits]) === JSON.stringify([...b.deposits]), 'generate deterministic');
ok(JSON.stringify([...a.deposits]) !== JSON.stringify([...c.deposits]), 'generate seed-sensitive');
ok(a.biome.length === WORLD_W * WORLD_H, 'biome covers map');

// Starter guarantees for seeds 1..50 (never trust noise)
for (let seed = 1; seed <= 50; seed++) {
  const g = generate(seed);
  ok(g.biome[cell(SPAWN.x, SPAWN.y)] === 'dust', `seed ${seed}: spawn in dust`);
  ok(!g.water.has(cell(SPAWN.x, SPAWN.y)) && !g.deposits.has(cell(SPAWN.x, SPAWN.y)),
    `seed ${seed}: spawn tile clear`);
  const near = (t: string, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = g.deposits.get(cell(SPAWN.x + dx, SPAWN.y + dy));
      if (d && d.type === t) return true;
    }
    return false;
  };
  ok(near('iron', 24), `seed ${seed}: iron within 24`);
  ok(near('coal', 24), `seed ${seed}: coal within 24`);
  ok(near('copper', 24), `seed ${seed}: copper within 24`);
  let water = false;
  for (let dy = -20; dy <= 20 && !water; dy++) for (let dx = -20; dx <= 20; dx++)
    if (g.water.has(cell(SPAWN.x + dx, SPAWN.y + dy))) { water = true; break; }
  ok(water, `seed ${seed}: water within 20`);
  // biome exclusives
  for (const [cl, d] of g.deposits) {
    if (d.type === 'crystal') ok(g.biome[cl] === 'hollows', `crystal only in hollows`);
    if (d.type === 'sulfur') ok(g.biome[cl] === 'ember', `sulfur only in ember`);
  }
}
console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2: implement.** Use the reference implementation in **Appendix A** below —
  it is written against the exact contracts of this plan; adapt only where the appendix
  and the test disagree (the test wins). Float division is fine INSIDE worldgen (output
  is data; determinism holds because inputs are integers); the running sim stays integer.
- [ ] **Step 3:** tests PASS. Commit: `sim: seeded worldgen (biomes, lakes, deposits) + guarantees`.

---

## Task 2 — World integration: grid, deposits, fog, window, day (TDD via existing suites)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`, `src/sim/worker.ts`,
`tests/_harness.ts`.

- [ ] **world.ts:**
  - `readonly w = WORLD_W; readonly h = WORLD_H;` (drop GRID_W/H exports; grep for users —
    `render-lab.ts` may import them; fix those too).
  - Replace `ore: Map<number, OreType>` with `deposits: Map<number, { type: OreType; richness: number }>`;
    keep a **compat getter** `get ore(): Map<number, OreType>` used by plan-#4 tests if any
    (grep; if unused, skip the getter). Add `water: Set<number>`, `biome: BiomeId[]`,
    `discovered: Uint8Array`, `seed = 0`, `dayPhase` getter (`this.pulse % DAY_TICKS`).
  - `loadNew(seed)`: run `generate(seed)`, store parts, clear dynamic state (same list
    `loadDemo` clears today), stamp the starter base at SPAWN (generator/miner/belts/
    smelter/storage — translate today's `loadDemo` layout to SPAWN offsets, miner on the
    guaranteed iron), reveal radius 10 around SPAWN. `loadDemo()` → `this.loadNew(1)`.
  - **Mining richness:** in the miner branch, on emit: `d.richness > 0` → decrement 1 and
    `m.cooldown = minerPeriod`; at 0 → still emit but `m.cooldown = minerPeriod * 10`
    (the 10% trickle; no deposit removal ever — anti-soft-lock).
  - **Ore-type mapping:** extend the `oreItem` pick: iron→`ore`, copper→`copper_ore`,
    coal→`coal`†, sulfur→`sulfur`†, crystal→`crystal`†, oil→**miners refuse** (blocked
    `no_deposit`; oil needs a pumpjack — Phase 5). († these ItemTypes arrive in Phase 4 —
    until then map coal/sulfur/crystal also to *refuse* with `no_deposit` and leave a
    `// TODO Phase 4` — the tsc union forces the revisit.)
  - **Placement rule:** `place()` refuses water cells and undiscovered cells (return false).
  - **Fog:** `reveal(cells: number[])` sets bits (bounds-checked). Helper
    `bit(cell): boolean`. `place`/`remove` unaffected by fog beyond the rule above.
  - **Window:** field `window = { x: 0, y: 0, w: WORLD_W, h: WORLD_H }` (full map default —
    tests keep working); `setWindow(x,y,w,h)` clamps to map. `snapshot()` filters
    `modules`/`packets`/`deposits` to the rect, emits `biome` for the rect, `water` cells
    in-rect, `discovered` (the live Uint8Array — worker structured-clones it), `minimap`
    (recompute only when a `minimapDirty` flag is set by reveal/gen), `dayPhase`, and drops
    `ore`/`oreType`.
- [ ] **worker.ts:** `init` case → `world.loadNew(cmd.seed)`; new cases `window`
  (`world.setWindow(...)`, no post), `reveal` (`world.reveal(...)`, no post — next tick's
  snapshot carries it), `map` → `ctx.postMessage({ type: 'map', deposits: world.discoveredDeposits(), pois: [] })`
  where `discoveredDeposits()` filters `deposits` by the fog bitset.
- [ ] **_harness.ts:** `replayHash` calls `world.loadDemo()` — unchanged and green by the
  compat wrapper. Add optional `seed` to `ReplayOpts` (`loadNew(opts.seed ?? 1)`).
- [ ] **Existing suites:** placement/economy/recipes/research tests use absolute cells like
  `w.cell(5,5)` — now far from the starter base but valid; failures will be about ore
  presence: update those tests' setup to `w.deposits.set(cell, { type: 'iron', richness: 999 })`
  where they previously did `w.ore.set/add`. Run each suite; fix mechanically.
- [ ] **Re-baseline** the golden hash (snapshot shape changed radically — expected).
  `npm run build` green (renderer still compiles against removed `ore` field? It reads
  `s.ore` — **stub it first**: keep `ore: number[]` in Snapshot as a deprecated empty array
  only if the renderer edit lands in a later task… **No**: do Task 3 (renderer) in the same
  PR before building; commit sim+render together if needed. Preferred order: land types+sim,
  then immediately Task 3, then run the gate.)
- [ ] Commit: `sim: 256×256 seeded world, richness, fog, window, day clock (re-baseline)`.

---

## Task 3 — Renderer: chunked terrain, biome palettes, fog voids, day/night, teleport

**Files:** Modify `src/render/scenery.ts`, `src/render/renderer.ts`, `src/render/style.ts`.

- [ ] **style.ts:** add `BIOME_GROUND: Record<BiomeId, { base: number; alt: number; scatter: number }>`
  (dust ambers, ridge blue-grays, canopy greens, ember dark reds, hollows deep violet) and
  `DAY_CURVE`: 8-entry table of `{ sky: number; light: number; ambient: number }` sampled
  by `dayPhase/DAY_TICKS*8` with lerp (dawn/day/dusk/night).
- [ ] **scenery.ts:** replace whole-map build with a `ChunkManager`:
  `ensure(chunkIds: number[], s: Snapshot)` builds missing chunks (32×32 ground mesh —
  one `PlaneGeometry` with vertex colors from `BIOME_GROUND` + hash-jitter; water cells
  flat emissive-blue quads; deposit rocks via the existing instanced-rock path per chunk;
  scatter per biome), `dispose(keepIds)` removes others (dispose geometries/materials —
  follow the existing `dispose()`). Undiscovered chunks (no revealed bit in the chunk) get
  a cheap dark plane only.
- [ ] **renderer.ts:** replace the `lastOreSig` seam: each `setSnapshot`, compute the 3×3
  chunk neighborhood of the window center, call `ensure`/`dispose`. Recompute a chunk when
  reveal state or deposit count in it changes (keep a per-chunk signature:
  `revealedCount:depositCount`). Day/night in `frame()`: sample `DAY_CURVE` (the snapshot's
  `dayPhase` + interpolation), set `dirLight.intensity`, ambient intensity, `scene.background`,
  fog color. Respect plan-#6 quality tiers (shadows off ⇒ skip shadow updates).
- [ ] **Teleport (dev):** in `main.ts`, parse `?tp=x,y` → `renderer.setPlayer(x+0.5, y+0.5)`
  after init (dev aid only; harmless in prod).
- [ ] Visual check: walk 100+ tiles (memory plateaus — `renderer.info.memory.geometries`
  via console), teleport to all five biomes + a lake, verify palettes/fog voids/day cycle
  (`?tp=` + speed ×4). Commit: `render: chunked biome terrain, fog voids, day/night`.

---

## Task 4 — main.ts: window-follow, reveal batching, save v4 + migration (TDD)

**Files:** Modify `src/main.ts`, `src/sim/types.ts` (SaveState above). Create
`tests/savev4.test.ts`.

- [ ] **Window/reveal:** after each snapshot: if the player moved ≥ 8 tiles from the last
  window center, `send({ type:'window', x: px−24, y: py−24, w: 48, h: 48 })`. Reveal: mirror
  bitset in main; every 300 ms compute unrevealed cells within radius 6 of the player →
  `send({ type: 'reveal', cells })` if non-empty.
- [ ] **Save v4** (`SAVE_KEY = 'driftworks.save.v4'`): `writeSave` now also needs sim-side
  data not in the windowed snapshot (full deposits diff, discovered). Snapshot additions
  would bloat every tick — instead add a `{ type: 'save' }` command: worker replies once
  with `{ type: 'save', save: SaveState }` (world serializes itself: `toSave(player)`
  minus player, filled by main). Autosave: send `save` every 3 s, write the reply through
  `src/storage.ts` (Task 6). `migrateV3toV4(v3): SaveState` — fresh `seed = 1337`, carry
  inventory/unlocked/research/upgrades, empty modules/minedDeposits/discovered, one-time
  toast: `The world has grown — your research and inventory came with you.`
- [ ] **tests/savev4.test.ts:** build a world (`loadNew(7)`), mine a deposit down, reveal
  an area, place machines with recipes, queue research; `const s = w.toSave()`;
  `w2.loadSaveV4(s)`; assert deep-equal snapshots (full window), richness diff restored,
  fog restored, dayPhase restored. v3-fixture migration: inventory/research carried,
  version 4, modules empty. Corrupt JSON → `readSave` returns null (no throw).
- [ ] Suite + build green; re-baseline if the save/load path altered any snapshot field.
  Commit: `save: v4 (seed/fog/richness/recipes/queue) + v3 migration + save command`.

---

## Task 5 — Map view + minimap rewire

**Files:** Create `src/ui/mapview.ts`. Modify `src/ui/minimap.ts`, `src/ui/hud.ts`,
`src/main.ts`, `src/style.css`.

- [ ] **mapview.ts:** full-screen sheet (dock button `Map`, key `m`): a `<canvas>` drawing
  (a) chunk biome colors from `snapshot.minimap` (undiscovered chunks dark), (b) deposits
  from the one-shot `map` reply (request on open; redraw on reply; colors = ITEM_COLOR of
  the ore item, 2×2 px), (c) player arrow, (d) beacon marker. Pan/zoom (pointer +
  pinch, like researchgraph). Tap → set beacon (`onGo(cell)` reuse from Phase 2 alerts).
- [ ] **minimap.ts:** replace `s.ore` reads: background = chunk colors from
  `snapshot.minimap` (8×8 chunks → scaled blocks) masked by a downsampled fog; machines
  from windowed `s.modules` (translate by `s.window`); player dot as today; alert-beacon
  dot if set. Keep its size/POSITION; it becomes fog-aware automatically.
- [ ] Build; visual: explore, open map, tap a far chunk → beacon + arrow guide; minimap
  agrees with map. Commit: `ui: full map view + fog-aware minimap`.

---

## Task 6 — Save storage hardening (`src/storage.ts`) — master plan Task 3.7 (TDD)

**Files:** Create `src/storage.ts`, `tests/storage.test.ts`. Modify `src/main.ts`
(read/write through it), `package.json` (devDependency `fake-indexeddb`), settings sheet
(Export/Import buttons).

- [ ] **API (exact):**

```ts
export interface SlotMeta { slot: 0 | 1 | 2; savedAt: number; mode?: string; pulse: number }
export async function loadSlot(slot: 0 | 1 | 2): Promise<SaveState | null>;   // prefers `latest`, falls back to sibling on parse/validate failure
export async function saveSlot(slot: 0 | 1 | 2, save: SaveState): Promise<void>; // alternates a/b, then updates `latest`
export async function listSlots(): Promise<SlotMeta[]>;
export async function migrateLegacy(): Promise<SaveState | null>; // one-time read of localStorage v4/v3 keys → slot 0 (delete keys after)
export async function requestPersistence(): Promise<boolean>;     // navigator.storage?.persist?.() — call once after first research completes
export async function exportSave(save: SaveState): Promise<string>;  // 'DW4:' + base64(gzip(JSON)) via CompressionStream
export async function importSave(s: string): Promise<SaveState>;     // throws on bad prefix/corrupt/failed validation
```

  One DB `driftworks`, store `saves`, keys `slot0..2`, values
  `{ a?: SaveState; b?: SaveState; latest: 'a' | 'b'; savedAt: number }`. `validate(s)`:
  `version === 4`, `Array.isArray(modules)`, `typeof seed === 'number'`. Raw IndexedDB
  (promisified open/get/put helpers, ~30 lines) — **no `idb` runtime dep**.
- [ ] **tests/storage.test.ts** (run with `fake-indexeddb/auto` imported first; gzip via
  Node ≥ 18 `CompressionStream` — if unavailable in the runner, fall back to zlib in the
  export/import impl behind a feature check): A/B survives corruption (save twice, corrupt
  the `latest` blob by writing garbage into it directly, `loadSlot` returns the sibling);
  export→import round-trips deep-equal; `importSave('DW4:garbage')` throws; legacy
  localStorage v4 key migrates to slot 0 and is removed.
- [ ] **main.ts:** boot: `migrateLegacy()` then `loadSlot(0)`; autosave path →
  `saveSlot(0, save)` (fire-and-forget with error toast on failure); after first
  `research_done` alert ever → `requestPersistence()`. Settings sheet gains Export
  (copies string to clipboard + shows it in a textarea) and Import (textarea + confirm
  dialog "Overwrite current save?" before `send({type:'load', save})` + `saveSlot`).
- [ ] Suite + build; manual: export in browser, wipe site data, import, world restored.
  Commit: `storage: IndexedDB slots, A/B rotation, persist(), export/import (+tests)`.

---

## Task 7 — Spawn balance + phase gate

- [ ] Fresh-run playtest (dev server, phone viewport): spawn → first smelter < 10 min;
  tutorial (#7) still completes (its detection predicates read snapshot fields that still
  exist — verify each step key).
- [ ] `npm test` fully green; `npm run build`; deploy; live-verify; update `PLAN-INDEX.md`
  + root `CLAUDE.md` (world size, save v4, storage layer notes) and
  `src/sim/CLAUDE.md`/`src/render/CLAUDE.md` (worldgen/chunks seams).

**Acceptance (master plan):** seeded 256×256 world, five visibly distinct biomes, fog
reveals as you walk, map + minimap agree, deposits deplete visibly in the inspector,
day/night cycles, save v4 survives reload mid-exploration, v3 migrates with the courtesy
toast, determinism green with the new baseline — plus hardened storage (A/B, persist,
export/import) from Task 6.

---

## Appendix A — `worldgen.ts` reference implementation

Written against this plan's contracts; Phase 7 adds nests and Phase 8 adds POIs/lava to
the SAME structure (keep `generate` composable — each feature is its own pass).

```ts
import type { BiomeId, OreType } from './types';
import { WORLD_W, WORLD_H } from './types';
import { BIOMES, SPAWN } from './data_biomes';

export interface GenWorld {
  biome: BiomeId[];
  water: Set<number>;
  deposits: Map<number, { type: OreType; richness: number }>;
}

/** 32-bit integer hash (splitmix-style). Deterministic across platforms. */
export function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}
const rand01 = (seed: number, x: number, y: number, salt: number): number =>
  hash2(seed ^ Math.imul(salt, 0x9e3779b1), x, y) / 0x100000000;
const cellOf = (x: number, y: number): number => y * WORLD_W + x;
const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;

/** Region layout with hash-wobbled borders. Order matters: hollows before canopy. */
export function biomeAt(seed: number, x: number, y: number): BiomeId {
  const dx = x - SPAWN.x, dy = y - SPAWN.y;
  if ((dx * dx) / (56 * 56) + (dy * dy) / (44 * 44) <= 1) return 'dust';
  const wob = (hash2(seed, x >> 3, y >> 3) % 13) - 6;
  if (x + wob > 208 && y >= 64 && y <= 160) return 'hollows';
  if (y + wob < 64) return 'ridge';
  if (y + wob > 192) return 'ember';
  if (x + wob > 168 && y < 168) return 'canopy';
  return 'dust';
}

function stampBlob(g: GenWorld, cx: number, cy: number, r: number,
                   put: (cell: number) => void): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 1) continue;
    const x = cx + dx, y = cy + dy;
    if (inMap(x, y)) put(cellOf(x, y));
  }
}

export function generate(seed: number): GenWorld {
  const g: GenWorld = { biome: new Array(WORLD_W * WORLD_H), water: new Set(), deposits: new Map() };
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++)
    g.biome[cellOf(x, y)] = biomeAt(seed, x, y);

  // Lakes: 10 hash-placed blobs, never in hollows; + guaranteed spawn lake (below).
  for (let i = 0; i < 10; i++) {
    const cx = hash2(seed, 1000 + i, 1) % WORLD_W;
    const cy = hash2(seed, 1000 + i, 2) % WORLD_H;
    if (g.biome[cellOf(cx, cy)] === 'hollows') continue;
    const r = 2 + (hash2(seed, 1000 + i, 3) % 3);
    stampBlob(g, cx, cy, r, (c) => g.water.add(c));
  }

  // Deposits per biome def: rejection-sample centers inside the region, off water.
  for (const b of BIOMES) {
    b.deposits.forEach((d, di) => {
      for (let blob = 0; blob < d.blobs; blob++) {
        const salt = 7000 + di * 100 + blob;
        for (let t = 0; t < 100; t++) {                      // bounded, deterministic
          const cx = hash2(seed ^ salt, t, 11) % WORLD_W;
          const cy = hash2(seed ^ salt, t, 12) % WORLD_H;
          const c = cellOf(cx, cy);
          if (g.biome[c] !== b.id || g.water.has(c)) continue;
          const r = d.r[0] + (hash2(seed ^ salt, t, 13) % (d.r[1] - d.r[0] + 1));
          stampBlob(g, cx, cy, r, (cc) => {
            if (g.water.has(cc)) return;
            const rich = d.richness[0] +
              Math.floor(rand01(seed, cc % WORLD_W, (cc / WORLD_W) | 0, salt) *
                         (d.richness[1] - d.richness[0]));
            g.deposits.set(cc, { type: d.type, richness: rich });
          });
          break;                                             // placed — next blob
        }
      }
    });
  }

  // Starter guarantee pass — check, then stamp deterministic fallbacks if missing.
  const near = (t: OreType, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = g.deposits.get(cellOf(SPAWN.x + dx, SPAWN.y + dy));
      if (d && d.type === t) return true;
    }
    return false;
  };
  const stampDeposit = (ox: number, oy: number, r: number, t: OreType): void =>
    stampBlob(g, SPAWN.x + ox, SPAWN.y + oy, r, (c) => {
      if (!g.water.has(c)) g.deposits.set(c, { type: t, richness: 500 });
    });
  if (!near('iron', 24)) stampDeposit(8, 2, 2, 'iron');
  if (!near('coal', 24)) stampDeposit(-9, 5, 2, 'coal');
  if (!near('copper', 24)) stampDeposit(4, -9, 2, 'copper');
  let hasWater = false;
  for (let dy = -20; dy <= 20 && !hasWater; dy++) for (let dx = -20; dx <= 20; dx++)
    if (g.water.has(cellOf(SPAWN.x + dx, SPAWN.y + dy))) { hasWater = true; break; }
  if (!hasWater) stampBlob(g, SPAWN.x + 12, SPAWN.y, 2, (c) => { g.deposits.delete(c); g.water.add(c); });
  // Spawn tile clear:
  g.deposits.delete(cellOf(SPAWN.x, SPAWN.y));
  g.water.delete(cellOf(SPAWN.x, SPAWN.y));
  return g;
}
```
