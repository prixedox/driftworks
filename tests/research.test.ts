import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// Smelter starts locked; researching Smelting with ore unlocks it.
const w = new World();
w.loadDemo();
ok(!w.unlocked.has('smelter'), 'smelter starts locked');
w.inventory.ore = 100;
w.selectResearch('smelting');
w.contributeResearch();
ok(w.research.completed.has('smelting'), 'smelting completes when ore paid');
ok(w.unlocked.has('smelter'), 'smelting unlocks smelter');
ok(w.inventory.ore === 80, `smelting cost 20 ore (got ${w.inventory.ore})`);

// Prereqs enforced: cannot select automation before power.
const w2 = new World();
w2.loadDemo();
w2.selectResearch('automation');
ok(w2.research.active === null, 'cannot select tech with unmet prereqs');

// Upgrade applies: completing power_grid raises generator output (deterministic check via snapshot power with a generator present).
const w3 = new World();
w3.loadDemo();
['smelting', 'power', 'automation', 'power_grid'].forEach((id) => { w3.inventory.ore = 999; w3.inventory.plate = 999; w3.inventory.science = 999; w3.selectResearch(id); w3.contributeResearch(); });
ok(w3.research.completed.has('power_grid'), 'power_grid completes via science from inventory');
w3.advance();
ok(w3.snapshot(150, false).power.produced === 18, `power_grid raises generator output to 18 (got ${w3.snapshot(150, false).power.produced})`);

// Determinism with the new systems.
const a = new World(); a.loadDemo();
const b = new World(); b.loadDemo();
for (let i = 0; i < 60; i++) { a.advance(); b.advance(); }
ok(JSON.stringify(a.snapshot(150, false)) === JSON.stringify(b.snapshot(150, false)), 'deterministic');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
