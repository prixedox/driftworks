import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// fresh world seeded with 40 ore
const w = new World();
w.loadDemo();
ok(w.inventory.ore === 40, `seed 40 ore (got ${w.inventory.ore})`);

// placing a miner (5 ore) on an empty non-demo cell deducts 5 and succeeds
const empty = w.cell(2, 2);
ok(w.place(empty, 'miner', 1) === true, 'place miner returns true');
ok(w.inventory.ore === 35, `miner cost 5 ore (got ${w.inventory.ore})`);

// can't afford: drain ore, then placing fails and does not deduct below 0
w.inventory.ore = 0;
ok(w.place(w.cell(3, 3), 'smelter', 1) === false, 'cannot place when unaffordable');
ok(w.inventory.ore === 0, 'no deduction on failed place');

// collect moves the shared storage pool into inventory
const w2 = new World();
w2.loadDemo();
w2.storage.plate = 7;
w2.inventory.ore = 0;
w2.collect();
ok(w2.inventory.plate === 7 && w2.storage.plate === 0, 'collect moves storage->inventory');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
