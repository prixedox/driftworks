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
