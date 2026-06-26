# src/sim — the deterministic simulation

The authoritative game logic. Runs in a Web Worker. **No DOM, no Three.js, no `Date.now`/
`Math.random`/`performance.now`/wall-clock/IO.** State is integer. Iterate order-stably (sort cell
keys before processing). Same command stream + same number of `advance()` calls ⇒ identical
snapshots. Breaking determinism breaks replays, saves, and future co-op — and there's a unit test
that will catch it.

## Files
- **`types.ts`** — the shared contract (keep dependency-free; both threads import it):
  `ItemType`, `ModuleType`, `Dir`, `ModuleView`, `PacketView`, `Snapshot` (what the worker ships
  each tick), `Command` (main → worker), plus presentation tables `DEFS`/`ITEM_COLOR`/`ITEM_LABEL`.
- **`data.ts`** — **single source of truth** for economy + progression: `BUILD_COSTS`,
  `START_INVENTORY`, `START_UNLOCKED`, `TECHS`, `UpgradeId`. Imported by the sim AND the UI. Tune
  balance here, not in code.
- **`world.ts`** — the `World` class: grid, `modules`, `ore`, `packets`, `inventory`, `unlocked`,
  `research`, `upgrades`. `advance()` = exactly one tick. Belts use **sub-tile slots** (`SLOTS=4`),
  items move ≤1 slot/tick (the `movedThisTick` guard prevents the teleport bug). A `CONVERTERS`
  config generalizes smelter + assembler (in→out over time); the Lab consumes science into research
  progress. `place()` validates unlock + cost + deducts; `placeRaw()` bypasses (seed base / load).
  `collect()` moves the shared `storage` pool into `inventory`. Upgrades scale rates via
  upgrade-aware locals computed each `advance()`.
- **`worker.ts`** — owns the `World`, advances it on a fixed schedule, routes `Command`s, posts
  `Snapshot`s. The tick loop starts only after the first load (no empty pre-init snapshot). Player
  position is NOT here.

## Common changes
- **New item:** extend `ItemType` (types.ts) + colors/labels + `START_INVENTORY` (data.ts).
- **New machine:** extend `ModuleType` (types.ts) + `DEFS` + `BUILD_COSTS` (data.ts) + behavior in
  `world.ts` (a `CONVERTERS` entry if it's an in→out converter) + snapshot its `ModuleView` fields.
- **New tech/upgrade:** add to `TECHS` (data.ts), apply its `unlocks`/`upgrade` in
  `world.completeResearch` / the upgrade-aware rate locals.
- After any change run the suites: `npx tsx tests/economy.test.ts tests/research.test.ts tests/placement.test.ts` (each is its own `npx tsx` run) and keep the determinism assertion green.
