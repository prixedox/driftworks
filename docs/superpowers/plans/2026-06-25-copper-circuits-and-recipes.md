# DRIFTWORKS Copper + Circuits + Recipe-Selectable Assembler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Horizon 2 depth kickoff. Add copper as a second resource (typed ore deposits), copper smelting, the circuit item (multi-input recipe), a formal `RECIPES` data table that replaces the hardcoded `CONVERTERS` config, make the Assembler recipe-selectable via the inspector, gate copper/circuits behind new techs, and add a full unit-test suite.

**Architecture summary:**
- `data.ts` gains `RECIPES` (the single source of truth for all converter recipes) and two new techs.
- `types.ts` gains `copper_ore` and `copper_plate` `ItemType`s, a `RecipeId` union, a `select-recipe` `Command`, and typed-ore fields on `Snapshot` and `ModuleView`.
- `world.ts`: `ore` field becomes a `Map<number, OreType>` internally; `genWorld` places typed blobs; the `CONVERTERS` constant is deleted and replaced by a lookup of `RECIPES`; `ModuleInst` gains a `recipeId` field; multi-input buffers become `Map<ItemType, number>`; a new `selectRecipe` method is added.
- `worker.ts` routes the `select-recipe` command.
- `main.ts` `describe()` shows recipe info and a recipe-change UI hook.
- `src/ui/inspector.ts` gets a recipe-picker row (select element).
- `src/ui/icons.ts` gets `copper_ore`, `copper_plate`, `circuit` icons.
- Tests: `tests/recipes.test.ts`.

**Tech Stack:** TypeScript (strict), Vite 5. No new runtime deps.

---

## Global Constraints

- **Determinism:** all sim state integer; no `Date.now`/`Math.random`/wall-clock in `src/sim/*` (the existing `mulberry32` seeded RNG is fine for world gen; it already runs only at world generation time). Same commands + same tick count ⇒ identical snapshots. The determinism test in the new suite must pass.
- **Build gate:** every task ends green on `npm run build` (`tsc --noEmit && vite build`), strict TS (no unused locals/params).
- **Single source of truth:** all items, recipes, costs, and techs in `src/sim/data.ts`. Never hardcode a recipe or cost in logic files.
- **Snapshots in, commands out:** the renderer and UI read `Snapshot`s and call `Command`s. No game state in UI.
- **Commits:** do NOT add any Claude/AI attribution (no `Co-Authored-By`, no "Generated with").
- **Run tests after each world.ts task:** `npx tsx tests/recipes.test.ts tests/economy.test.ts tests/research.test.ts tests/placement.test.ts`

---

## Data model decisions (read before implementing)

### Typed ore

The `World.ore` field today is `Set<number>`. We change it to `Map<number, OreType>` where `OreType = 'iron' | 'copper'`. This is a pure internal change inside `world.ts`. The snapshot must remain stable for the renderer.

**Snapshot shape for `ore`:** add two parallel arrays to `Snapshot`:
```ts
ore: number[];           // cell indices (all ore, any type) — used by miner highlight and placement validation, unchanged meaning
oreType: OreType[];      // parallel to `ore`; index i of oreType corresponds to index i of ore
```
This is additive — existing renderer/UI code that reads `snap.ore` continues to work without changes. The renderer only uses `ore` for highlighting; it does not need `oreType`. Only the inspector (describe()) and the miner highlight in `main.ts` use the ore field, and neither needs ore type. No renderer churn.

`OreType` is a small string union defined in `types.ts`. It is **not** an `ItemType` — it describes the deposit kind, not the item produced. The item emitted is derived: iron deposit → `'ore'` (keeping backward compat with existing save format), copper deposit → `'copper_ore'`.

### RECIPES data table

Delete the `CONVERTERS` constant from `world.ts`. Define a `RECIPES` table in `data.ts`. A recipe:

```ts
export type RecipeId =
  | 'smelt_iron'
  | 'smelt_copper'
  | 'assemble_science'
  | 'assemble_circuit';

export interface RecipeInput {
  item: ItemType;
  amount: number;  // integer, how many to consume per craft
}

export interface Recipe {
  id: RecipeId;
  name: string;
  /** Machine types this recipe is valid for. */
  machines: ModuleType[];
  inputs: RecipeInput[];
  /** Single output item + count per craft. */
  output: ItemType;
  outputCount: number;
  /** Ticks per craft (integer). */
  time: number;
  /** Power draw while crafting. */
  power: number;
  /** Input buffer capacity per input slot (integer). */
  bufCap: number;
}
```

Concrete values:

| id | machines | inputs | output | outputCount | time | power | bufCap |
|----|----------|--------|--------|-------------|------|-------|--------|
| `smelt_iron` | `['smelter']` | `[{ore,1}]` | `plate` | 1 | 6 | 3 | 4 |
| `smelt_copper` | `['smelter']` | `[{copper_ore,1}]` | `copper_plate` | 1 | 6 | 3 | 4 |
| `assemble_science` | `['assembler']` | `[{plate,1}]` | `science` | 1 | 8 | 3 | 4 |
| `assemble_circuit` | `['assembler']` | `[{copper_plate,1},{plate,1}]` | `circuit` | 1 | 10 | 4 | 4 |

**Design notes:**
- The smelter has two possible recipes (`smelt_iron`, `smelt_copper`). Its default is `smelt_iron` (preserving existing behavior). The player can switch via the inspector recipe picker.
- The assembler default recipe is `assemble_science` (preserving existing science chain). `assemble_circuit` is unlocked by the `copper_basics` tech.
- `bufCap` is per input slot, not total. For `assemble_circuit` with 2 inputs, each input has a buffer of 4, so the total buffer capacity is 8 items.
- `outputCount` is always 1 in these recipes but the field exists for future use.

### Multi-input buffer in ModuleInst

Today `ModuleInst.inBuf: number` is a single integer count. We replace it with `inBuf: Map<ItemType, number>` — a map from item type to count in buffer. This is the most invasive change; all code touching `m.inBuf` must be updated. The snapshot's `ModuleView.buffer` will report total items across all input slots (sum of values in the map) for display purposes; this keeps the inspector/renderer working without changes.

For single-input recipes (all smelter/assemble_science cases), the map has exactly one key and behaves identically to the old integer. The crafting condition is: every input slot has `inBuf.get(item) >= recipe.inputs[i].amount`.

### Recipe selection

`ModuleInst` gains `recipeId: RecipeId`. When a machine is placed, it gets the default recipe for its type (first valid recipe in RECIPES for that machine type). A new `select-recipe` command lets the player change it. The recipe must be valid for the machine type; if not, the selection is ignored. Smelter and assembler are both recipe-selectable.

### Research gating

Two new techs appended to `TECHS`:

| id | name | costItem | cost | prereqs | effect |
|----|------|----------|------|---------|--------|
| `copper_basics` | Copper Processing | `plate` | 40 | `['automation']` | unlocks nothing directly; needed to enable copper recipes |
| `circuits` | Circuits | `science` | 60 | `['copper_basics']` | no unlock needed; the recipe is available once the tech is researched |

**Gating mechanism:** Rather than adding a separate `unlockedRecipes` set, we store unlocked recipe IDs in `unlocked` by treating `RecipeId` values as an extension of the unlock namespace. This requires minimal refactoring: `World.unlocked` becomes `Set<ModuleType | RecipeId>`. Tech `copper_basics` has `unlocks: ['smelt_copper', 'assemble_circuit']` (treating these as recipe unlock keys). The `selectRecipe` method checks `this.unlocked.has(recipeId)` before allowing the change.

> **Implementation note:** `ModuleType | RecipeId` is a string union in TypeScript strict mode. `BUILD_COSTS` and `START_UNLOCKED` continue to use `ModuleType`; the compiler needs a cast or a widened type for `World.unlocked`. Easiest: declare `unlocked = new Set<string>()` internally and keep the `Snapshot.unlocked: ModuleType[]` typed as before (only ModuleTypes appear in snapshot unlocked for UI). The `selectRecipe` check uses the string set internally. See the exact code in Task C2.

**Default demo behavior (no regression):** On `loadDemo`, the world still has the iron ore miner → smelter → storage chain. The smelter gets `recipeId: 'smelt_iron'` by default. The assembler gets `recipeId: 'assemble_science'`. Nothing changes for the existing player until they research copper and switch recipes.

---

## File structure

| File | Change type | Summary |
|------|-------------|---------|
| `src/sim/types.ts` | Modify | Add `copper_ore`, `copper_plate`, `circuit` to `ItemType`; `OreType`; `RecipeId`; `oreType` to `Snapshot`; `select-recipe` Command; `recipe` field on `ModuleView`; colors/labels/EXPLAIN for new items/recipes |
| `src/sim/data.ts` | Modify | Add `RecipeInput`, `Recipe`, `RecipeId`, `RECIPES`; add `copper_basics` + `circuits` techs; add `copper_ore`, `copper_plate`, `circuit` to `START_INVENTORY`; add build costs for no new machines |
| `src/sim/world.ts` | Modify | `ore` → `Map<number,OreType>`; `ModuleInst.inBuf` → `Map<ItemType,number>`; `ModuleInst.recipeId`; delete `CONVERTERS`; recipe-driven advance(); `selectRecipe()`; typed blobs in `genWorld`; snapshot `oreType`; miner emits ore type based on deposit |
| `src/sim/worker.ts` | Modify | Route `select-recipe` command |
| `src/main.ts` | Modify | `describe()` shows recipe + recipe picker trigger; pass `selectRecipe` to hud |
| `src/ui/inspector.ts` | Modify | Add `recipe` row type with a `<select>` element; render when `rows` entry has `options` field |
| `src/ui/icons.ts` | Modify | Add `copper_ore`, `copper_plate`, `circuit` icons |
| `src/ui/hud.ts` | Modify | Add `selectRecipe` to `HudCallbacks`; pass through to `main.ts` |
| `tests/recipes.test.ts` | Create | Full recipe/copper/circuit/determinism test suite |

---

# PHASE C — RECIPES data model + typed ore + multi-input converters

## Task C1: Contract additions (types.ts + data.ts)

**Files:** Modify `src/sim/types.ts`; Modify `src/sim/data.ts`.

**Interfaces produced:**
- `ItemType` extended with `'copper_ore' | 'copper_plate' | 'circuit'`
- `OreType = 'iron' | 'copper'` exported from `types.ts`
- `RecipeId` union exported from `data.ts`
- `Recipe`, `RecipeInput`, `RECIPES` exported from `data.ts`
- `Snapshot.oreType: OreType[]` added
- `ModuleView.recipe?: RecipeId` added
- `Command` extended with `{ type: 'select-recipe'; cell: number; recipe: RecipeId }`
- Colors/labels for new items; EXPLAIN entries for new recipes
- `copper_basics` and `circuits` added to `TECHS`
- `START_INVENTORY` extended

- [ ] **Step 1: Edit `src/sim/types.ts`**

  Replace the `ItemType` line:
  ```ts
  export type ItemType = 'ore' | 'plate' | 'science' | 'copper_ore' | 'copper_plate' | 'circuit';
  ```

  Add after the `ItemType` line:
  ```ts
  /** The type of resource in a deposit cell. */
  export type OreType = 'iron' | 'copper';
  ```

  In `ModuleView`, add the optional recipe field after `out?`:
  ```ts
  /** Current recipe ID for recipe-selectable machines (smelter, assembler). */
  recipe?: string;
  ```

  In `Snapshot`, add after `ore: number[];`:
  ```ts
  /** Parallel to `ore`; index i gives the OreType of ore[i]. */
  oreType: OreType[];
  ```

  In the `Command` union, add:
  ```ts
  | { type: 'select-recipe'; cell: number; recipe: string }
  ```

  In `ITEM_COLOR`, add:
  ```ts
  copper_ore: 0xe07840,
  copper_plate: 0xf09030,
  circuit: 0x44cc66,
  ```

  In `ITEM_LABEL`, add:
  ```ts
  copper_ore: 'Copper Ore',
  copper_plate: 'Copper Plate',
  circuit: 'Circuit',
  ```

  In `EXPLAIN`, add (for machines; items don't need EXPLAIN entries):
  ```ts
  // No new ModuleType added, so EXPLAIN stays as-is.
  // (EXPLAIN is Record<ModuleType, string> — all 7 entries already present)
  ```

- [ ] **Step 2: Edit `src/sim/data.ts`**

  Add `RecipeId` and recipe types after the `UpgradeId` block:
  ```ts
  export type RecipeId =
    | 'smelt_iron'
    | 'smelt_copper'
    | 'assemble_science'
    | 'assemble_circuit';

  export interface RecipeInput {
    item: ItemType;
    amount: number;
  }

  export interface Recipe {
    id: RecipeId;
    name: string;
    machines: ModuleType[];
    inputs: RecipeInput[];
    output: ItemType;
    outputCount: number;
    /** Ticks to complete one craft. */
    time: number;
    /** Power draw while crafting. */
    power: number;
    /** Buffer capacity per input slot. */
    bufCap: number;
  }

  export const RECIPES: Recipe[] = [
    {
      id: 'smelt_iron',
      name: 'Smelt Iron',
      machines: ['smelter'],
      inputs: [{ item: 'ore', amount: 1 }],
      output: 'plate',
      outputCount: 1,
      time: 6,
      power: 3,
      bufCap: 4,
    },
    {
      id: 'smelt_copper',
      name: 'Smelt Copper',
      machines: ['smelter'],
      inputs: [{ item: 'copper_ore', amount: 1 }],
      output: 'copper_plate',
      outputCount: 1,
      time: 6,
      power: 3,
      bufCap: 4,
    },
    {
      id: 'assemble_science',
      name: 'Assemble Science',
      machines: ['assembler'],
      inputs: [{ item: 'plate', amount: 1 }],
      output: 'science',
      outputCount: 1,
      time: 8,
      power: 3,
      bufCap: 4,
    },
    {
      id: 'assemble_circuit',
      name: 'Assemble Circuit',
      machines: ['assembler'],
      inputs: [
        { item: 'copper_plate', amount: 1 },
        { item: 'plate', amount: 1 },
      ],
      output: 'circuit',
      outputCount: 1,
      time: 10,
      power: 4,
      bufCap: 4,
    },
  ];
  ```

  Extend `START_INVENTORY`:
  ```ts
  export const START_INVENTORY: Record<ItemType, number> = {
    ore: 40, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0,
  };
  ```

  Append two new techs to `TECHS` (after `power_grid`):
  ```ts
  {
    id: 'copper_basics',
    name: 'Copper Processing',
    desc: 'Unlock copper smelting and circuit assembly.',
    costItem: 'plate',
    cost: 40,
    prereqs: ['automation'],
    unlocks: ['smelt_copper' as unknown as ModuleType, 'assemble_circuit' as unknown as ModuleType],
  },
  {
    id: 'circuits',
    name: 'Circuits',
    desc: 'Advanced circuit boards from copper and iron plates.',
    costItem: 'science',
    cost: 60,
    prereqs: ['copper_basics'],
  },
  ```

  > **Note on the `as unknown as ModuleType` cast:** `Tech.unlocks` is typed `ModuleType[]` today. We need to store recipe IDs in `unlocked` to gate recipe selection without adding a separate data field. The cleanest approach is to widen `Tech.unlocks` to `string[]` in this step, removing the cast. Change the `Tech` interface's `unlocks` field:
  > ```ts
  > unlocks?: string[];
  > ```
  > This is backward-compatible — the existing `world.ts` code does `tech.unlocks?.forEach((b) => this.unlocked.add(b))`. If `unlocked` is `Set<string>` (see Task C2), this compiles cleanly. The snapshot still filters to ModuleTypes for the `unlocked: ModuleType[]` field.

- [ ] **Step 3: Build** — will FAIL until C2 (world.ts snapshot no longer satisfies Snapshot due to missing `oreType`, and `ItemType` has new values not in `START_INVENTORY` record before our edit). This is expected. Proceed to C2 before building. Alternatively, `npm run build` to see the exact errors for context, then continue.

- [ ] **Step 4: Commit (pre-green is OK at this step)**
  ```bash
  git -C /home/martin/projects/driftworks add src/sim/types.ts src/sim/data.ts
  git -C /home/martin/projects/driftworks commit -m "sim: copper items + RECIPES table + two new techs (contract)"
  ```

---

## Task C2: World — typed ore, RECIPES-driven advance, multi-input buffers, selectRecipe (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/worker.ts`; Create `tests/recipes.test.ts`.

**Interfaces produced:**
- `World.ore` is now `Map<number, OreType>` internally
- `ModuleInst.inBuf` is now `Map<ItemType, number>`
- `ModuleInst.recipeId: RecipeId` (default per machine type)
- `CONVERTERS` constant removed; replaced by RECIPES lookups
- `World.selectRecipe(cell, recipeId): boolean`
- Snapshot includes `oreType: OreType[]`
- Miner emits item matching deposit type
- All upgrade-aware rates derived from the recipe's `time`/`power`

### 2a: Write the test first (TDD)

- [ ] **Step 1: Create `tests/recipes.test.ts`** (failing at this point):

```ts
import { World } from '../src/sim/world';
import type { OreType } from '../src/sim/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// ── Typed ore deposits ──────────────────────────────────────────────────────

const w0 = new World();
w0.loadDemo();
const snap0 = w0.snapshot(150, false);

// The world has some ore cells; oreType must be parallel and same length.
ok(snap0.oreType.length === snap0.ore.length, `oreType.length === ore.length (${snap0.oreType.length} vs ${snap0.ore.length})`);

// At least one iron and one copper blob should be present (genWorld places both).
const hasIron = snap0.oreType.some((t: OreType) => t === 'iron');
const hasCopper = snap0.oreType.some((t: OreType) => t === 'copper');
ok(hasIron, 'world has iron deposits');
ok(hasCopper, 'world has copper deposits');

// ── Miner on copper emits copper_ore ─────────────────────────────────────────

// Find a copper deposit cell.
const snap0Cells = snap0.ore;
const copperCell = snap0Cells.find((_c, i) => snap0.oreType[i] === 'copper');
ok(copperCell !== undefined, 'found a copper deposit cell for miner test');
if (copperCell !== undefined) {
  const wM = new World();
  wM.loadDemo();
  // Place a belt east of the copper cell, then a miner on the copper cell facing east.
  const beltCell = copperCell + 1; // east neighbor
  wM.placeRawPublic(beltCell, 'conveyor', 1);
  wM.placeRawPublic(copperCell, 'miner', 1);
  for (let i = 0; i < 10; i++) wM.advance();
  const hasCoOre = wM.packets.some((p) => p.item === 'copper_ore');
  ok(hasCoOre, 'miner on copper deposit emits copper_ore');
}

// ── Multi-input recipe (assemble_circuit) ────────────────────────────────────

// Unlock copper_basics so assemble_circuit recipe is accessible.
const wC = new World();
wC.loadDemo();
// Manually unlock via research path (fastest: set inventory + chain contributions).
['smelting', 'power', 'automation', 'copper_basics'].forEach((id) => {
  wC.inventory.ore = 999; wC.inventory.plate = 999; wC.inventory.science = 999;
  wC.selectResearch(id); wC.contributeResearch();
});
ok(wC.research.completed.has('copper_basics'), 'copper_basics researched');

// Place an assembler + belt to its east.
const aCell = wC.cell(5, 5);
const bCell = wC.cell(6, 5);
wC.placeRawPublic(bCell, 'conveyor', 1);
wC.placeRawPublic(aCell, 'assembler', 1);

// Switch assembler to circuit recipe.
const switched = wC.selectRecipe(aCell, 'assemble_circuit');
ok(switched, 'selectRecipe returns true for unlocked recipe');
ok(wC.modules.get(aCell)?.recipeId === 'assemble_circuit', 'assembler recipeId updated to assemble_circuit');

// Feed it one copper_plate and one plate.
wC.modules.get(aCell)!.inBuf.set('copper_plate', 1);
wC.modules.get(aCell)!.inBuf.set('plate', 1);

// After enough ticks (time=10), outBuf should have 1 circuit.
for (let i = 0; i < 15; i++) {
  // Give it plenty of power.
  wC.modules.forEach((m) => { if (m.type === 'generator') m; }); // generators already in demo
  wC.advance();
}
const asnap = wC.snapshot(150, false);
const asModule = asnap.modules.find((m) => m.cell === aCell);
ok((asModule?.out ?? 0) >= 1 || wC.packets.some((p) => p.item === 'circuit'), 'circuit produced from copper_plate + plate');

// Both inputs consumed (inBuf for copper_plate and plate both reduced).
const aInst = wC.modules.get(aCell)!;
ok((aInst.inBuf.get('copper_plate') ?? 0) === 0 && (aInst.inBuf.get('plate') ?? 0) === 0, 'both inputs consumed');

// ── Recipe selection gating ────────────────────────────────────────────────

// Without copper_basics, assemble_circuit should not be selectable.
const wG = new World();
wG.loadDemo();
const gCell = wG.cell(5, 5);
wG.placeRawPublic(gCell, 'assembler', 1);
const notSwitched = wG.selectRecipe(gCell, 'assemble_circuit');
ok(!notSwitched, 'assemble_circuit not selectable before copper_basics');
ok(wG.modules.get(gCell)?.recipeId === 'assemble_science', 'assembler stays on default recipe when locked');

// ── Smelter recipe switch: smelt_copper ───────────────────────────────────────

const wS = new World();
wS.loadDemo();
['smelting', 'power', 'automation', 'copper_basics'].forEach((id) => {
  wS.inventory.ore = 999; wS.inventory.plate = 999; wS.inventory.science = 999;
  wS.selectResearch(id); wS.contributeResearch();
});
// The demo smelter cell (20, 13 row, col 23 = 13*40+23 = 543).
const smeltCell = wS.cell(23, 13);
ok(wS.modules.has(smeltCell), 'demo smelter exists at expected cell');
const smSwitched = wS.selectRecipe(smeltCell, 'smelt_copper');
ok(smSwitched, 'smelter can switch to smelt_copper after copper_basics');
ok(wS.modules.get(smeltCell)?.recipeId === 'smelt_copper', 'smelter recipeId = smelt_copper');
// Feed it copper_ore and advance.
wS.modules.get(smeltCell)!.inBuf.set('copper_ore', 1);
for (let i = 0; i < 10; i++) wS.advance();
const hasCopperPlate = wS.packets.some((p) => p.item === 'copper_plate') ||
  (wS.modules.get(smeltCell)?.outBuf ?? 0) > 0;
ok(hasCopperPlate, 'smelter on smelt_copper produces copper_plate');

// ── Determinism ──────────────────────────────────────────────────────────────

const dA = new World(); dA.loadDemo();
const dB = new World(); dB.loadDemo();
for (let i = 0; i < 120; i++) { dA.advance(); dB.advance(); }
ok(
  JSON.stringify(dA.snapshot(150, false)) === JSON.stringify(dB.snapshot(150, false)),
  'deterministic with typed ore + recipes',
);

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

> **Note on `placeRawPublic`:** The test needs to call `placeRaw` on specific cells. Add a `placeRawPublic` method to `World` that delegates to the private `placeRaw` — this is the testing seam used by existing tests via `loadDemo`. Alternatively, just make `placeRaw` public (no `private` modifier). Either approach is acceptable; using a public alias is cleaner for tests.

- [ ] **Step 2: Run, expect FAIL** — `npx tsx tests/recipes.test.ts` (fails: `placeRawPublic` not found, `oreType` not on snapshot, etc.)

### 2b: Implement world.ts changes

- [ ] **Step 3: Edit `src/sim/world.ts` — imports**

  Change the import from `types.ts` to include `OreType`:
  ```ts
  import { DX, DY, type Dir, type ItemType, type ModuleType, type OreType, type ModuleView, type SaveState, type Snapshot } from './types';
  ```

  Change the import from `data.ts` to include `RECIPES`, `RecipeId`, and remove the need for separate CONVERTERS constants:
  ```ts
  import { BUILD_COSTS, START_INVENTORY, START_UNLOCKED, TECHS, RECIPES, type RecipeId, type UpgradeId } from './data';
  ```

- [ ] **Step 4: Edit `src/sim/world.ts` — delete CONVERTERS, update constants**

  Delete the entire `const CONVERTERS: Partial<Record<...>> = { ... };` block (lines 20–23 currently). It is replaced by RECIPES lookups.

  Keep all other constants (`SLOTS`, `MINER_PERIOD`, `SMELT_TIME`, `SMELT_CAP`, `LAB_CAP`, `MINER_POWER`, `SMELT_POWER`, `GEN_POWER`) for use in upgrade scaling and lab cap. Note `SMELT_TIME` and `SMELT_CAP` are now defaults that match the `smelt_iron` recipe; they remain for the upgrade computation. `SMELT_POWER` is superseded by `recipe.power` from RECIPES; it can be removed if desired, but it is safe to leave as a local constant that no longer flows into the hot path.

  Add a helper at module scope (after the constants) to look up a recipe by ID:
  ```ts
  function getRecipe(id: RecipeId | string): Recipe | undefined {
    return RECIPES.find((r) => r.id === id);
  }

  /** Default recipe ID for a machine type (first matching recipe). */
  function defaultRecipe(type: ModuleType): RecipeId | undefined {
    return RECIPES.find((r) => r.machines.includes(type))?.id;
  }
  ```

  (Import `Recipe` type at the top: add to the `data.ts` import: `type Recipe`.)

- [ ] **Step 5: Edit `src/sim/world.ts` — ModuleInst**

  Replace:
  ```ts
  interface ModuleInst {
    type: ModuleType;
    dir: Dir;
    cooldown: number;
    inBuf: number;
    progress: number;
    outBuf: number;
    busy: boolean;
  }
  ```
  With:
  ```ts
  interface ModuleInst {
    type: ModuleType;
    dir: Dir;
    cooldown: number;
    /** Input buffer: map from ItemType to integer count. Single-input recipes have one key. */
    inBuf: Map<ItemType, number>;
    progress: number;
    outBuf: number;
    busy: boolean;
    /** Active recipe for recipe-selectable machines. Undefined for non-recipe machines. */
    recipeId?: RecipeId;
  }
  ```

- [ ] **Step 6: Edit `src/sim/world.ts` — World class fields**

  Change `ore` field declaration:
  ```ts
  ore = new Map<number, OreType>();
  ```

  Change `unlocked` field declaration (widen to `Set<string>` for recipe unlock keys):
  ```ts
  unlocked = new Set<string>(START_UNLOCKED);
  ```

- [ ] **Step 7: Edit `src/sim/world.ts` — placeRaw**

  Change `placeRaw` to set `inBuf` as a `Map` and assign the default recipe:
  ```ts
  private placeRaw(c: number, type: ModuleType, dir: Dir): void {
    const recipeId = defaultRecipe(type);
    this.modules.set(c, {
      type,
      dir,
      cooldown: 0,
      inBuf: new Map<ItemType, number>(),
      progress: 0,
      outBuf: 0,
      busy: false,
      recipeId,
    });
  }

  /** Public seam for tests. */
  placeRawPublic(c: number, type: ModuleType, dir: Dir): void {
    this.placeRaw(c, type, dir);
  }
  ```

- [ ] **Step 8: Edit `src/sim/world.ts` — place method**

  The `place` method delegates to `placeRaw`; update the unlock check to `this.unlocked.has(type)` — this still works because `Set<string>` accepts `ModuleType` strings. No other change needed in `place`.

- [ ] **Step 9: Edit `src/sim/world.ts` — addOreBlob + genWorld (typed deposits)**

  Change `addOreBlob` signature:
  ```ts
  private addOreBlob(cx: number, cy: number, r: number, kind: OreType): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.ore.set(this.cell(x, y), kind);
      }
    }
  }
  ```

  Change `genWorld` to pass `kind` to `addOreBlob`. Keep the existing 8 blobs; make the fixed center blob and the first 5 random blobs iron, and the last 2 random blobs copper. This guarantees both types exist in every world deterministically:
  ```ts
  private genWorld(): void {
    this.ore.clear();
    this.modules.clear();
    this.packets = [];
    this.addOreBlob(20, 13, 3, 'iron');
    const rng = mulberry32(1337);
    for (let i = 0; i < 7; i++) {
      const x = 4 + Math.floor(rng() * (this.w - 8));
      const y = 4 + Math.floor(rng() * (this.h - 8));
      const r = 2 + Math.floor(rng() * 3);
      const kind: OreType = i < 5 ? 'iron' : 'copper';
      this.addOreBlob(x, y, r, kind);
    }
  }
  ```

  > **Determinism note:** `mulberry32(1337)` is called with the exact same sequence as before — same 3 calls per blob (x, y, r). The only change is the `kind` selection, which is non-random (index-based). The ore cells produced are identical to the existing code for indices 0–4; indices 5–6 now become copper. This is a world-gen change that will alter existing saves if loaded (saves don't persist ore, they regenerate it), which is acceptable for Horizon 2.

- [ ] **Step 10: Edit `src/sim/world.ts` — loadDemo + loadSave**

  In `loadDemo`, change `this.ore.clear()` (now handled by `genWorld`). After the inventory/research/upgrades reset, also reset the `storage` record to include new item types:
  ```ts
  this.storage = { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 };
  ```

  In `loadSave`, same — extend storage init:
  ```ts
  this.storage = { ore: s.storage.ore ?? 0, plate: s.storage.plate ?? 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 };
  ```

  In `loadSave`, also extend `inventory` to include new items (they default to 0 until Save v3 persists them properly).

- [ ] **Step 11: Edit `src/sim/world.ts` — selectResearch + completeResearch**

  `Tech.unlocks` is now `string[]` (changed in data.ts). The `completeResearch` method calls:
  ```ts
  tech.unlocks?.forEach((b) => this.unlocked.add(b));
  ```
  Since `unlocked` is `Set<string>`, this compiles without cast. No other change needed.

- [ ] **Step 12: Edit `src/sim/world.ts` — add selectRecipe method**

  Add after `contributeResearch`:
  ```ts
  selectRecipe(cell: number, recipeId: string): boolean {
    const m = this.modules.get(cell);
    if (!m) return false;
    const recipe = getRecipe(recipeId);
    if (!recipe) return false;
    if (!recipe.machines.includes(m.type)) return false;
    if (!this.unlocked.has(recipeId)) return false;
    // Clear input buffer on recipe switch to avoid cross-recipe contamination.
    m.inBuf.clear();
    m.progress = 0;
    m.outBuf = 0;
    m.recipeId = recipeId as RecipeId;
    return true;
  }
  ```

  **Default recipe availability:** `smelt_iron` and `assemble_science` must be in `unlocked` from the start (they are available without research). Add them to `START_UNLOCKED` in `data.ts`:
  ```ts
  export const START_UNLOCKED: (string)[] = ['miner', 'conveyor', 'storage', 'smelt_iron', 'assemble_science'];
  ```
  > Change the type from `ModuleType[]` to `string[]` in `data.ts` to accommodate recipe IDs. The `START_UNLOCKED` array is only used in `new Set<string>(START_UNLOCKED)` in `world.ts`, so the widening is safe. The snapshot still filters to module types for the UI unlock list.

  Also update `loadDemo` and `loadSave` to use:
  ```ts
  this.unlocked = new Set<string>(START_UNLOCKED);
  ```

- [ ] **Step 13: Edit `src/sim/world.ts` — advance() belt movement loop**

  The section that checks if an item can enter a converter changes. Replace the `CONVERTERS[tmod.type]` branch in the movement loop:

  Old pattern (now deleted with CONVERTERS):
  ```ts
  } else if (CONVERTERS[tmod.type]) {
    const cfg = CONVERTERS[tmod.type]!;
    if (p.item === cfg.in && tmod.inBuf < cfg.cap) {
      tmod.inBuf++;
      removed.add(p.id);
      occ.delete(here);
      moved = true;
    }
  }
  ```

  New pattern:
  ```ts
  } else if (tmod.recipeId) {
    const recipe = getRecipe(tmod.recipeId);
    if (recipe) {
      const inputSlot = recipe.inputs.find((inp) => inp.item === p.item);
      if (inputSlot) {
        const current = tmod.inBuf.get(p.item) ?? 0;
        if (current < recipe.bufCap) {
          tmod.inBuf.set(p.item, current + 1);
          removed.add(p.id);
          occ.delete(here);
          moved = true;
        }
      }
    }
  }
  ```

  The `lab` branch remains unchanged (labs don't have `recipeId`; they consume `'science'` directly).

- [ ] **Step 14: Edit `src/sim/world.ts` — advance() power calculation loop**

  Replace the `CONVERTERS[m.type]` branch in the power loop:

  Old:
  ```ts
  } else if (CONVERTERS[m.type]) {
    const cfgTime = m.type === 'smelter' ? smeltTime : CONVERTERS[m.type]!.time;
    if (m.inBuf > 0 && m.progress < cfgTime) {
      wants = true;
      draw = CONVERTERS[m.type]!.power;
    }
  }
  ```

  New (recipe-driven):
  ```ts
  } else if (m.recipeId) {
    const recipe = getRecipe(m.recipeId);
    if (recipe) {
      const effectiveTime = m.recipeId === 'smelt_iron' ? smeltTime : recipe.time;
      const ready = recipe.inputs.every((inp) => (m.inBuf.get(inp.item) ?? 0) >= inp.amount);
      if (ready && m.progress < effectiveTime) {
        wants = true;
        draw = recipe.power;
      }
    }
  }
  ```

  > `smeltTime` upgrade scaling still applies to `smelt_iron`. `smelt_copper` uses the recipe's own `time` (6). `smelt_copper` does not have a separate upgrade yet — add one later if desired.

- [ ] **Step 15: Edit `src/sim/world.ts` — advance() machine processing loop**

  Replace the `CONVERTERS[m.type]` branch in the processing loop:

  Old:
  ```ts
  } else if (CONVERTERS[m.type]) {
    const cfg = CONVERTERS[m.type]!;
    const time = m.type === 'smelter' ? smeltTime : cfg.time;
    if (worked.has(c)) {
      m.busy = true;
      m.progress++;
      if (m.progress >= time) {
        m.progress = 0;
        m.inBuf--;
        m.outBuf++;
      }
    }
    if (m.outBuf > 0) {
      const out = this.neighbor(c, m.dir);
      if (out >= 0 && this.modules.get(out)?.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
        this.packets.push({ id: this.nextId++, item: cfg.out, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
        occ.add(this.microKey(out, 0));
        m.outBuf--;
      }
    }
  }
  ```

  New:
  ```ts
  } else if (m.recipeId) {
    const recipe = getRecipe(m.recipeId);
    if (recipe) {
      const effectiveTime = m.recipeId === 'smelt_iron' ? smeltTime : recipe.time;
      if (worked.has(c)) {
        m.busy = true;
        m.progress++;
        if (m.progress >= effectiveTime) {
          m.progress = 0;
          // Consume all inputs.
          for (const inp of recipe.inputs) {
            const cur = m.inBuf.get(inp.item) ?? 0;
            m.inBuf.set(inp.item, Math.max(0, cur - inp.amount));
          }
          m.outBuf += recipe.outputCount;
        }
      }
      if (m.outBuf > 0) {
        const out = this.neighbor(c, m.dir);
        if (out >= 0 && this.modules.get(out)?.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
          this.packets.push({ id: this.nextId++, item: recipe.output, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
          occ.add(this.microKey(out, 0));
          m.outBuf--;
        }
      }
    }
  }
  ```

- [ ] **Step 16: Edit `src/sim/world.ts` — advance() miner emit**

  The miner emits the item corresponding to the deposit type. Replace:
  ```ts
  this.packets.push({ id: this.nextId++, item: 'ore', cell: out, slot: 0, prevCell: out, prevSlot: 0 });
  ```
  With:
  ```ts
  const oreKind = this.ore.get(c) ?? 'iron';
  const oreItem: ItemType = oreKind === 'copper' ? 'copper_ore' : 'ore';
  this.packets.push({ id: this.nextId++, item: oreItem, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
  ```

  Also update the miner power check (in the power loop) — it currently calls `this.ore.has(c)`:
  ```ts
  if (m.type === 'miner' && m.cooldown <= 0 && this.ore.has(c)) {
  ```
  `Map.has(c)` works the same as `Set.has(c)` — no change needed on this line.

- [ ] **Step 17: Edit `src/sim/world.ts` — snapshot()**

  The `ore` array now comes from the Map keys. The parallel `oreType` array comes from the Map values. Change the snapshot ore field:

  Old:
  ```ts
  ore: [...this.ore],
  ```

  New:
  ```ts
  ore: [...this.ore.keys()],
  oreType: [...this.ore.values()],
  ```

  Update `ModuleView` assembly for smelter and assembler to include `recipe` field and use the `inBuf` Map:

  Old smelter block:
  ```ts
  if (m.type === 'smelter') {
    v.progress = m.progress / smeltTime;
    v.buffer = m.inBuf;
    v.out = m.outBuf;
    v.busy = m.busy;
  }
  ```

  New smelter block:
  ```ts
  if (m.type === 'smelter') {
    const recipe = m.recipeId ? getRecipe(m.recipeId) : undefined;
    const time = m.recipeId === 'smelt_iron' ? smeltTime : (recipe?.time ?? smeltTime);
    v.progress = m.progress / time;
    v.buffer = [...m.inBuf.values()].reduce((a, b) => a + b, 0);
    v.out = m.outBuf;
    v.busy = m.busy;
    v.recipe = m.recipeId;
  }
  ```

  Old assembler block:
  ```ts
  } else if (m.type === 'assembler') {
    v.progress = m.progress / CONVERTERS.assembler!.time;
    v.buffer = m.inBuf;
    v.out = m.outBuf;
    v.busy = m.busy;
  }
  ```

  New assembler block:
  ```ts
  } else if (m.type === 'assembler') {
    const recipe = m.recipeId ? getRecipe(m.recipeId) : undefined;
    v.progress = recipe ? m.progress / recipe.time : 0;
    v.buffer = [...m.inBuf.values()].reduce((a, b) => a + b, 0);
    v.out = m.outBuf;
    v.busy = m.busy;
    v.recipe = m.recipeId;
  }
  ```

  Also update the ore-cell highlight for the miner in snapshot — the `s.ore.includes(cell)` check in main.ts still works because `ore: [...this.ore.keys()]` gives the same cell list.

  Finally: update `Snapshot.unlocked` to still be `ModuleType[]` for UI (filter the string unlocked set):
  ```ts
  unlocked: [...this.unlocked].filter((k): k is ModuleType =>
    ['miner','conveyor','smelter','storage','generator','assembler','lab'].includes(k)
  ) as ModuleType[],
  ```

- [ ] **Step 18: Edit `src/sim/world.ts` — storage record initialization**

  The `World.storage` field initializer and every place it's reset must include all `ItemType` keys:
  ```ts
  storage: Record<ItemType, number> = { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 };
  ```
  Update `loadDemo`, `loadSave`, and the field initializer.

### 2c: Worker routing

- [ ] **Step 19: Edit `src/sim/worker.ts` — route select-recipe command**

  Add a new case in the command switch (before `case 'speed':` or grouped with other game-state commands):
  ```ts
  case 'select-recipe':
    world.selectRecipe(cmd.cell, cmd.recipe);
    post();
    break;
  ```

### 2d: Green tests

- [ ] **Step 20: Run tests**
  ```
  npx tsx tests/recipes.test.ts
  npx tsx tests/economy.test.ts
  npx tsx tests/research.test.ts
  npx tsx tests/placement.test.ts
  ```
  All must pass.

  > **Known issue to resolve:** `economy.test.ts` currently tries to place a `smelter` directly but smelter is locked. It tests `w.place(w.cell(3,3), 'smelter', 1) === false` to verify the unaffordable path. That assertion checks the inventory path (ore drained to 0), not the unlock path. Since smelter is locked from the start, this assertion will still return `false` — but for the wrong reason (locked, not unaffordable). This is a pre-existing pass but check that both assertions still make logical sense. If the test now passes for the wrong reason, add `w.unlocked.add('smelter')` before the drain-and-try step to isolate the affordability check.

- [ ] **Step 21: Build**
  ```
  npm run build
  ```
  Must be green.

- [ ] **Step 22: Commit**
  ```bash
  git -C /home/martin/projects/driftworks add src/sim/world.ts src/sim/worker.ts tests/recipes.test.ts
  git -C /home/martin/projects/driftworks commit -m "sim: typed ore, RECIPES-driven converters, multi-input buffers, selectRecipe"
  ```

---

# PHASE D — Inspector recipe picker + new icons + UI wiring

## Task D1: New item icons (copper_ore, copper_plate, circuit)

**Files:** Modify `src/ui/icons.ts`.

- [ ] **Step 1: Add icons to `ICONS` in `src/ui/icons.ts`**

  Add after the existing `lock` entry:

  ```ts
  copper_ore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- rough nugget, warmer tint via shape — same structure as ore but with an inner ring -->
    <polygon points="12,3 18,7 20,14 15,20 9,20 4,14 6,7"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="3" x2="12" y2="9"/>
    <line x1="12" y1="15" x2="12" y2="20"/>
  </svg>`,

  copper_plate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- same ingot shape as plate but with a diagonal hatching mark -->
    <rect x="3" y="9" width="18" height="6" rx="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="7" y1="12" x2="17" y2="12"/>
    <line x1="5" y1="10" x2="9" y2="14"/>
  </svg>`,

  circuit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- PCB-style board with trace lines and component dots -->
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="8" y1="3" x2="8" y2="21"/>
    <line x1="16" y1="3" x2="16" y2="21"/>
    <line x1="3" y1="8" x2="21" y2="8"/>
    <line x1="3" y1="16" x2="21" y2="16"/>
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`,
  ```

- [ ] **Step 2: Build** — `npm run build` → green.

- [ ] **Step 3: Commit**
  ```bash
  git -C /home/martin/projects/driftworks add src/ui/icons.ts
  git -C /home/martin/projects/driftworks commit -m "UI: icons for copper_ore, copper_plate, circuit"
  ```

---

## Task D2: Inspector recipe picker row

**Files:** Modify `src/ui/inspector.ts`; Modify `src/main.ts`; Modify `src/ui/hud.ts`; Modify `src/style.css`.

**Goal:** When inspecting a smelter or assembler, the inspector shows the current recipe name and a `<select>` dropdown listing valid, unlocked recipes. Selecting a different recipe sends `select-recipe` to the sim.

### Inspector changes

The `InspectRow` interface currently supports `bar?: number` and `icon?: string`. We extend it with a recipe picker variant:

- [ ] **Step 1: Extend `InspectRow` in `src/ui/inspector.ts`**

  ```ts
  export interface InspectRow {
    label: string;
    value: string;
    bar?: number;
    icon?: string;
    /** If present, render a <select> with these options instead of a value span. */
    options?: { value: string; label: string }[];
    /** The currently selected option value (used when options is set). */
    selected?: string;
    /** Callback when the user picks an option. */
    onChange?: (value: string) => void;
  }
  ```

- [ ] **Step 2: Render picker rows in `buildInspector`**

  In the `show(t, rows)` method body, after the `if (r.bar != null)` block, change the row rendering to handle `options`:

  ```ts
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'dw-ins-row';
    const k = document.createElement('span');
    k.className = 'dw-ins-k';
    if (r.icon) k.append(svgEl(r.icon));
    k.append(document.createTextNode(r.label));
    row.append(k);
    if (r.options && r.options.length > 0) {
      const sel = document.createElement('select');
      sel.className = 'dw-ins-select';
      for (const opt of r.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === r.selected) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => r.onChange?.(sel.value));
      row.append(sel);
    } else {
      const v = document.createElement('span');
      v.className = 'dw-ins-v';
      v.textContent = r.value;
      row.append(v);
    }
    body.append(row);
    if (r.bar != null) {
      const bar = document.createElement('div');
      bar.className = 'dw-ins-bar';
      const fill = document.createElement('div');
      fill.className = 'dw-ins-bar-fill';
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, r.bar)) * 100)}%`;
      bar.append(fill);
      body.append(bar);
    }
  }
  ```

- [ ] **Step 3: CSS for `.dw-ins-select` — append to `src/style.css`**

  ```css
  .dw-ins-select {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border, rgba(255,255,255,0.15));
    border-radius: 4px;
    padding: 2px 4px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    flex: 1;
  }
  .dw-ins-select:focus {
    outline: 1px solid var(--accent);
  }
  ```

### main.ts changes

- [ ] **Step 4: Update `describe()` in `src/main.ts` to include recipe picker for smelter + assembler**

  Add import at top:
  ```ts
  import { RECIPES } from './sim/data';
  import type { RecipeId } from './sim/data';
  ```

  Modify the `describe` function signature to accept a callback for recipe changes:
  ```ts
  function describe(
    cell: number,
    s: Snapshot,
    onSelectRecipe: (cell: number, recipe: string) => void
  ): { title: string; rows: { label: string; value: string; bar?: number; icon?: string; options?: { value: string; label: string }[]; selected?: string; onChange?: (v: string) => void }[] } | null {
  ```

  In the `'smelter'` case, add a recipe picker row. The valid recipes for the smelter are those with `machines.includes('smelter')` that are unlocked (in `s.unlocked` — but `unlocked` in snapshot is `ModuleType[]`; recipe unlock IDs are in `s.unlocked` only if we filter them in... wait, see note below).

  > **Important:** The `Snapshot.unlocked` field is filtered to `ModuleType[]` in world.ts snapshot(). Recipe IDs are NOT in the snapshot unlocked list. We need to expose them. **Solution:** Add a `unlockedRecipes: string[]` field to `Snapshot` (parallel to `unlocked`). This is the cleanest — it separates the UI concern (which modules to show locked) from the recipe concern. See Step 4a below.

- [ ] **Step 4a: Add `unlockedRecipes: string[]` to `Snapshot` in `src/sim/types.ts`**

  ```ts
  /** Recipe IDs the player has unlocked (via research). */
  unlockedRecipes: string[];
  ```

  And in `world.ts` `snapshot()`, add:
  ```ts
  unlockedRecipes: [...this.unlocked].filter((k) => RECIPES.some((r) => r.id === k)),
  ```

- [ ] **Step 4b: Complete `describe()` smelter case with recipe picker**

  ```ts
  case 'smelter': {
    const smelterRecipes = RECIPES
      .filter((r) => r.machines.includes('smelter') && s.unlockedRecipes.includes(r.id))
      .map((r) => ({ value: r.id, label: r.name }));
    const currentRecipeId = m.recipe ?? 'smelt_iron';
    const currentRecipe = RECIPES.find((r) => r.id === currentRecipeId);
    return {
      title: 'Smelter',
      rows: [
        {
          label: 'Recipe',
          value: currentRecipe?.name ?? '?',
          options: smelterRecipes.length > 1 ? smelterRecipes : undefined,
          selected: currentRecipeId,
          onChange: (v) => onSelectRecipe(cell, v),
        },
        { label: 'Input waiting', value: String(m.buffer ?? 0) },
        { label: 'Progress', value: `${Math.round((m.progress ?? 0) * 100)}%`, bar: m.progress ?? 0 },
        { label: 'Output ready', value: String(m.out ?? 0) },
        { label: 'Status', value: m.busy ? 'smelting' : 'idle' },
      ],
    };
  }
  ```

  ```ts
  case 'assembler': {
    const assemblerRecipes = RECIPES
      .filter((r) => r.machines.includes('assembler') && s.unlockedRecipes.includes(r.id))
      .map((r) => ({ value: r.id, label: r.name }));
    const currentRecipeId = m.recipe ?? 'assemble_science';
    const currentRecipe = RECIPES.find((r) => r.id === currentRecipeId);
    return {
      title: 'Assembler',
      rows: [
        {
          label: 'Recipe',
          value: currentRecipe?.name ?? '?',
          options: assemblerRecipes.length > 1 ? assemblerRecipes : undefined,
          selected: currentRecipeId,
          onChange: (v) => onSelectRecipe(cell, v),
        },
        { label: 'Input waiting', value: String(m.buffer ?? 0) },
        { label: 'Progress', value: `${Math.round((m.progress ?? 0) * 100)}%`, bar: m.progress ?? 0 },
        { label: 'Output ready', value: String(m.out ?? 0) },
        { label: 'Status', value: m.busy ? 'assembling' : 'idle' },
      ],
    };
  }
  ```

  Update the existing `miner` case to use `s.ore.includes(cell)` → no change needed (still works as `ore: number[]` from the Map keys).

- [ ] **Step 5: Wire `selectRecipe` command in `main.ts`**

  Add near other `send` helpers:
  ```ts
  const selectRecipeCmd = (cell: number, recipe: string) =>
    send({ type: 'select-recipe', cell, recipe });
  ```

  Update the call to `describe`:
  ```ts
  const info = describe(inspectCell, latest, selectRecipeCmd);
  ```

  And in `refreshInspect`:
  ```ts
  const info = describe(inspectCell, latest, selectRecipeCmd);
  ```

- [ ] **Step 6: Update `hud.ts` `HudCallbacks`**

  Add to `HudCallbacks` in `src/ui/hud.ts`:
  ```ts
  selectRecipe: (cell: number, recipe: string) => void;
  ```

  Pass through in `buildHud`. Since `describe()` takes it directly from `main.ts` scope, no HUD wiring is strictly needed for MVP — the `onChange` callbacks in `InspectRow` close over `selectRecipeCmd` in `main.ts`. The `HudCallbacks` addition is for forward-compat but optional in this phase.

- [ ] **Step 7: Update `src/ui/statusbar.ts` to handle new item types in inventory**

  The status bar shows `ore`, `plate`, `science`. Add `copper_ore`, `copper_plate`, `circuit` only when non-zero (to keep the bar uncluttered). Check the existing `statusbar.ts` implementation — if it iterates a hardcoded list, extend that list. If the counts are all zero (which they are initially), they should not take up space. The simplest approach: show counts for all 6 item types but hide chips whose count is 0.

  This keeps the implementation minimal. Only touch `statusbar.ts` if needed; if it already reads `s.inventory` as a whole record (it does: it reads `s.inventory.ore`, `s.inventory.plate`, `s.inventory.science` by name), add similar entries for the new items.

- [ ] **Step 8: Build + tests**
  ```
  npm run build
  npx tsx tests/recipes.test.ts tests/economy.test.ts tests/research.test.ts tests/placement.test.ts
  ```

- [ ] **Step 9: Commit**
  ```bash
  git -C /home/martin/projects/driftworks add src/ui/inspector.ts src/ui/hud.ts src/main.ts src/style.css src/sim/types.ts
  git -C /home/martin/projects/driftworks commit -m "UI: inspector recipe picker for smelter + assembler; unlockedRecipes in snapshot"
  ```

---

## Task D3: Status bar + toast wiring for new items

**Files:** Modify `src/ui/statusbar.ts`; Modify `src/main.ts`.

- [ ] **Step 1: Extend status bar to show copper_plate + circuit when non-zero**

  Open `src/ui/statusbar.ts` and read the `update(s)` implementation. Wherever plate and science chips are created/updated, add parallel chips for `copper_ore`, `copper_plate`, and `circuit`. Show them only when `> 0` (use `style.display = count > 0 ? '' : 'none'`).

  The icons `copper_ore`, `copper_plate`, `circuit` were added in Task D1.

- [ ] **Step 2: Extend toast triggers in `src/main.ts`**

  In the `prevSnap` diff section, add toast for copper_plate production:
  ```ts
  const dCopperPlate = snap.storage.copper_plate - prevSnap.storage.copper_plate;
  if (dCopperPlate > 0 && now - lastPlateToast > 1500) {
    lastPlateToast = now;
    hud.pushToast(`+${dCopperPlate} copper plate`, 'info');
  }
  ```

- [ ] **Step 3: Build** → green.

- [ ] **Step 4: Commit**
  ```bash
  git -C /home/martin/projects/driftworks add src/ui/statusbar.ts src/main.ts
  git -C /home/martin/projects/driftworks commit -m "UI: copper/circuit items in status bar + toasts"
  ```

---

## Task D4: Research panel — show copper_basics + circuits techs

No code change needed: the research panel in `src/ui/research.ts` iterates `TECHS` dynamically. The two new techs will automatically appear once they are in `TECHS` (added in Task C1). Verify visually.

- [ ] **Step 1: Build** → green.
- [ ] **Step 2: Visual spot-check** — open the Research panel; confirm `Copper Processing` (locked until Automation done) and `Circuits` (locked until Copper Processing done) appear with correct statuses.

---

# PHASE E — Final wiring, push, deploy

## Task E1: Placement validation for new items

**Files:** Modify `src/ui/placement.ts` (if needed).

The current `placementValid` checks `s.unlocked.includes(tool)`. Since `s.unlocked` is now `ModuleType[]` (we filter recipe IDs out in the snapshot), this still works correctly. No change needed to placement.ts — verify by reading it.

- [ ] **Step 1: Read `src/ui/placement.ts`** and confirm `s.unlocked.includes(tool)` works for `ModuleType` tools. (It will — `s.unlocked: ModuleType[]` is correct.)
- [ ] **Step 2: Build** → green.

---

## Task E2: Final test run + push + deploy

- [ ] **Step 1: Full test suite**
  ```
  npx tsx tests/recipes.test.ts
  npx tsx tests/economy.test.ts
  npx tsx tests/research.test.ts
  npx tsx tests/placement.test.ts
  ```
  All four must output `PASS`.

- [ ] **Step 2: Build gate**
  ```
  npm run build
  ```
  Must complete clean.

- [ ] **Step 3: Push**
  ```bash
  git -C /home/martin/projects/driftworks push origin main
  ```
  Watch the GitHub Actions deploy workflow. Confirm Pages bundle hash updates on the live URL.

- [ ] **Step 4: Visual smoke test** (headless or manual) — confirm:
  - Iron ore deposits highlighted in orange when Miner is selected tool; copper deposits are also in the ore highlight (since all ore cells are in `snap.ore`).
  - The demo chain (miner → belt → smelter → belt → storage) still works and produces iron plates.
  - After researching `Copper Processing`, inspecting the smelter shows a recipe dropdown with "Smelt Iron" / "Smelt Copper".
  - Switching the smelter to "Smelt Copper" and placing it on a copper deposit produces copper plates.
  - Switching the assembler to "Assemble Circuit" and feeding both copper plates + iron plates produces circuits.
  - Research panel shows all 8 techs (6 existing + `Copper Processing` + `Circuits`).

---

## Self-review notes

### Coverage map

| Spec requirement | Covered by |
|-----------------|-----------|
| Typed ore deposits (iron/copper) | C2 Steps 9, 16 |
| `ore` → `Map<cell, OreType>` | C2 Step 6 |
| Snapshot `oreType[]` parallel array | C2 Step 17 |
| Miner emits deposit-appropriate item | C2 Step 16 |
| `copper_ore`, `copper_plate`, `circuit` ItemTypes | C1 Step 1 |
| RECIPES data table in data.ts | C1 Step 2 |
| CONVERTERS deleted, replaced by RECIPES | C2 Steps 4, 13, 14, 15 |
| Multi-input buffer (`Map<ItemType,number>`) | C2 Steps 5, 13, 15 |
| All inputs consumed on craft | C2 Step 15 |
| Recipe default per machine type | C2 Steps 7, 12 |
| `selectRecipe` sim method | C2 Step 12 |
| `select-recipe` Command + worker routing | C1 Step 1, C2 Step 19 |
| Recipe gating via `unlocked` set | C2 Step 12 |
| `copper_basics` + `circuits` techs | C1 Step 2 |
| Default recipes unlocked from start | C2 Step 12 |
| Inspector recipe picker (smelter + assembler) | D2 Steps 1–5 |
| `unlockedRecipes` in Snapshot | D2 Step 4a |
| New icons (copper_ore, copper_plate, circuit) | D1 |
| Status bar + toasts for new items | D3 |
| Research panel auto-shows new techs | D4 |
| Tests: multi-input recipe consumes both inputs | C2 Step 1 (circuit test) |
| Tests: recipe switch changes output | C2 Step 1 (smelt_copper test) |
| Tests: copper deposits generate | C2 Step 1 (genWorld test) |
| Tests: miner on copper → copper_ore | C2 Step 1 |
| Tests: determinism | C2 Step 1 |
| Build gate green at each task end | Each task's build step |
| No AI attribution in commits | All commit messages |

### Architectural decisions worth flagging at review

1. **`unlocked` widened to `Set<string>`** — cleanest way to gate both machine types and recipe IDs through one set without a separate data structure. The snapshot filters to `ModuleType[]` for the UI `locked` display; `unlockedRecipes: string[]` carries the recipe IDs for the inspector. This is a small internal widening and does not touch the public snapshot contract for render/hotbar.

2. **`inBuf` as `Map<ItemType, number>` instead of separate arrays** — the most future-proof representation. JSON serialization for determinism tests uses `Map` entries order-stably because we always iterate recipe.inputs in a fixed order (from the RECIPES table). If `JSON.stringify(Map)` produces `{}`, convert to a plain object for snapshot purposes — in the `snapshot()` call, `buffer` is already reduced to a sum integer so the Map itself does not appear in the Snapshot. The internal `inBuf` Map never enters `JSON.stringify` directly (the snapshot representation is the sum integer `buffer`). Determinism is preserved.

3. **`smelt_copper` time = 6** (same as iron) — keeping it equal for balance simplicity at Horizon 2 start. Can be tuned in the data table later.

4. **`SMELT_TIME` / `smeltTime` upgrade applies only to `smelt_iron`** — `smelt_copper` uses `recipe.time` directly. This keeps the upgrade model simple. A `copper_smelt_speed` upgrade can be added later.

5. **`genWorld` assigns ore types by blob index** (i < 5 → iron, i >= 5 → copper) — fully deterministic, no additional RNG calls, and gives a predictable 2-blob copper distribution useful for early testing.

6. **Default assembler recipe is `assemble_science`** — the existing science chain is preserved. Players on existing saves who reload get a world where the assembler still produces science (default recipe). No regression.

7. **`circuits` tech has no `unlocks` field** — it is a research milestone (costs science, blocks further research extensions if any) but the actual circuit recipe is unlocked by `copper_basics`. The `circuits` tech is a prerequisite node for any future tech that requires deep circuit production (e.g., advanced circuits). Its presence in the tree does not gate gameplay — it serves as a "you've done the circuit research" checkpoint.

8. **Save v2 compatibility** — `loadSave` re-seeds inventory and does not persist recipe selections (SaveState v2 has no recipe or inventory fields). Players who reload lose recipe customization (assembler reverts to default) until Save v3 is implemented. This is an acceptable gap documented in the known backlog.
