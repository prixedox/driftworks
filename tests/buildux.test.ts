import { World } from '../src/sim/world';
import type { ModuleType } from '../src/sim/types';
import { BUILD_COSTS } from '../src/sim/data';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// ── Erase Refund ─────────────────────────────────────────────────────────────

const rw = new World();
rw.loadDemo();
// Unlock smelter to place one
rw.unlocked.add('smelter');
rw.inventory.ore = 50;
const smelterCost = BUILD_COSTS['smelter'].amount; // 10
const placedCell = rw.cell(5, 5);
ok(rw.place(placedCell, 'smelter', 1) === true, 'refund/place: place smelter');
const oreAfterPlace = rw.inventory.ore;
rw.remove(placedCell);
ok(rw.inventory.ore === oreAfterPlace + smelterCost, `refund: ore restored by ${smelterCost} (got ${rw.inventory.ore - oreAfterPlace})`);
ok(!rw.modules.has(placedCell), 'refund: module removed from map');

// Refund of a conveyor (cost 1 ore)
rw.unlocked.add('conveyor');
rw.inventory.ore = 10;
const beltCell = rw.cell(6, 6);
ok(rw.place(beltCell, 'conveyor', 1) === true, 'refund/conveyor: place');
const oreAfterBelt = rw.inventory.ore;
rw.remove(beltCell);
ok(rw.inventory.ore === oreAfterBelt + BUILD_COSTS['conveyor'].amount, 'refund/conveyor: 1 ore returned');

// ── Undo ─────────────────────────────────────────────────────────────────────

// Undo reverses a place: module gone, cost returned
const uw = new World();
uw.loadDemo();
uw.unlocked.add('smelter');
uw.inventory.ore = 50;
const uc1 = uw.cell(7, 7);
ok(uw.place(uc1, 'smelter', 1) === true, 'undo/place: place smelter');
const oreBeforeUndo = uw.inventory.ore;
uw.undo();
ok(!uw.modules.has(uc1), 'undo/place: module removed');
ok(uw.inventory.ore === oreBeforeUndo + BUILD_COSTS['smelter'].amount, 'undo/place: ore refunded on undo');

// Undo reverses a remove: module restored at zero extra cost, and inventory decremented by cost (place cost)
const uw2 = new World();
uw2.loadDemo();
uw2.unlocked.add('smelter');
uw2.inventory.ore = 50;
const uc2 = uw2.cell(8, 8);
uw2.place(uc2, 'smelter', 1);
const oreAfterPlace2 = uw2.inventory.ore;
uw2.remove(uc2);                                // refund given: ore goes up by 10
const oreAfterRemove = uw2.inventory.ore;
ok(oreAfterRemove === oreAfterPlace2 + BUILD_COSTS['smelter'].amount, 'undo/remove: refund was given on remove');
uw2.undo();                                     // undo the remove: module restored, refund taken back
ok(uw2.modules.has(uc2), 'undo/remove: module restored');
ok(uw2.inventory.ore === oreAfterPlace2, 'undo/remove: refund reversed on undo');

// Undo on empty log is a no-op
const uw3 = new World();
uw3.loadDemo();
const snapBefore = JSON.stringify(uw3.snapshot(150, false));
uw3.undo();
const snapAfter = JSON.stringify(uw3.snapshot(150, false));
ok(snapBefore === snapAfter, 'undo: no-op on empty log');

// ── Blueprint paste ───────────────────────────────────────────────────────────

const pw = new World();
pw.loadDemo();
// Set up a small pattern: conveyor at (10,10), conveyor at (11,10), miner at (10,11) [on ore]
pw.unlocked.add('conveyor');
pw.unlocked.add('miner');
pw.ore.set(pw.cell(10, 11), 'iron'); // add fake ore so miner is valid to copy (copy does not validate)
pw.inventory.ore = 200;
pw.place(pw.cell(10, 10), 'conveyor', 1);
pw.place(pw.cell(11, 10), 'conveyor', 1);
pw.place(pw.cell(10, 11), 'miner', 2);
// Copy the 2×2 bounding box
const copyCells = [pw.cell(10, 10), pw.cell(11, 10), pw.cell(10, 11), pw.cell(11, 11)];
pw.copyBlueprint(copyCells);
ok(pw.clipboard.length === 3, `paste: clipboard has 3 entries (got ${pw.clipboard.length})`);
ok(pw.clipboard.some((e) => e.type === 'conveyor' && e.relCol === 0 && e.relRow === 0), 'paste: first belt at (0,0)');
ok(pw.clipboard.some((e) => e.type === 'conveyor' && e.relCol === 1 && e.relRow === 0), 'paste: second belt at (1,0)');
ok(pw.clipboard.some((e) => e.type === 'miner' && e.relCol === 0 && e.relRow === 1), 'paste: miner at (0,1)');

// Paste at a clean region (30,5): conveyor costs 1 ore each, miner costs 5 ore
const oreBeforePaste = pw.inventory.ore;
pw.ore.set(pw.cell(30, 6), 'iron'); // add ore under paste target so miner can land
pw.paste(pw.cell(30, 5));   // origin = top-left of stamp
// Two conveyors placed (cost 1 each = 2 ore), miner placed (5 ore) = 7 ore total
ok(pw.modules.has(pw.cell(30, 5)), 'paste: belt at (30,5)');
ok(pw.modules.has(pw.cell(31, 5)), 'paste: belt at (31,5)');
ok(pw.modules.has(pw.cell(30, 6)), 'paste: miner at (30,6)');
ok(pw.inventory.ore === oreBeforePaste - (BUILD_COSTS['conveyor'].amount * 2 + BUILD_COSTS['miner'].amount),
  `paste: correct ore deducted (expected ${BUILD_COSTS['conveyor'].amount * 2 + BUILD_COSTS['miner'].amount}, got ${oreBeforePaste - pw.inventory.ore})`);

// Paste skips occupied cells
const pw2 = new World();
pw2.loadDemo();
pw2.unlocked.add('conveyor');
pw2.inventory.ore = 200;
pw2.place(pw2.cell(10, 10), 'conveyor', 1);
pw2.copyBlueprint([pw2.cell(10, 10)]);
// Place a blocker at paste target
pw2.placeRawPublic(pw2.cell(15, 15), 'conveyor', 1);
pw2.paste(pw2.cell(15, 15)); // target occupied → skip
ok(pw2.modules.get(pw2.cell(15, 15))?.dir === 1, 'paste: occupied cell not overwritten');
// inventory unchanged (belt skipped, no cost deducted beyond what was there before)
// (the cell was placed via placeRawPublic so no inventory was spent on the blocker)

// Paste skips unaffordable cells (insufficient inventory mid-paste)
const pw3 = new World();
pw3.loadDemo();
pw3.unlocked.add('smelter');
pw3.unlocked.add('conveyor');
pw3.inventory.ore = 0;
pw3.inventory.plate = 0;
// Build a clipboard with two smelters side by side (cost 10 ore each)
// Force clipboard directly to avoid spending inventory:
pw3.clipboard = [
  { relCol: 0, relRow: 0, type: 'smelter' as ModuleType, dir: 1 },
  { relCol: 1, relRow: 0, type: 'smelter' as ModuleType, dir: 1 },
];
pw3.paste(pw3.cell(5, 5)); // 0 ore → both skipped
ok(!pw3.modules.has(pw3.cell(5, 5)), 'paste: skips when unaffordable (first)');
ok(!pw3.modules.has(pw3.cell(6, 5)), 'paste: skips when unaffordable (second)');
pw3.inventory.ore = 10; // enough for exactly one smelter
pw3.clipboard = [
  { relCol: 0, relRow: 0, type: 'smelter' as ModuleType, dir: 1 },
  { relCol: 1, relRow: 0, type: 'smelter' as ModuleType, dir: 1 },
];
pw3.paste(pw3.cell(5, 5));
ok(pw3.modules.has(pw3.cell(5, 5)), 'paste: first smelter placed when 10 ore');
ok(!pw3.modules.has(pw3.cell(6, 5)), 'paste: second smelter skipped when ore depleted');
ok(pw3.inventory.ore === 0, 'paste: exactly 10 ore spent');

// ── Snapshot includes clipboard ───────────────────────────────────────────────
const sw = new World();
sw.loadDemo();
sw.unlocked.add('conveyor');
sw.inventory.ore = 10;
sw.place(sw.cell(2, 2), 'conveyor', 1);
sw.copyBlueprint([sw.cell(2, 2)]);
const snap = sw.snapshot(150, false);
ok(Array.isArray(snap.clipboard) && snap.clipboard.length === 1, 'snapshot: clipboard in snapshot');
ok(snap.clipboard[0].type === 'conveyor' && snap.clipboard[0].relCol === 0 && snap.clipboard[0].relRow === 0, 'snapshot: clipboard entry correct');

// ── Determinism ───────────────────────────────────────────────────────────────
const da = new World();
da.loadDemo();
const db = new World();
db.loadDemo();
for (let i = 0; i < 60; i++) { da.advance(); db.advance(); }
ok(
  JSON.stringify(da.snapshot(150, false)) === JSON.stringify(db.snapshot(150, false)),
  'determinism: two identical worlds match after 60 ticks'
);

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
