import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// ── Test 1 & 2: demo world produces ore and plate after sufficient ticks ────
const WARM_TICKS = 60; // enough for ore packets to reach smelter and complete
const w = new World();
w.loadDemo();
for (let i = 0; i < WARM_TICKS; i++) w.advance();
const s1 = w.snapshot(150, false);

ok(s1.rates.ore.produced > 0, `ore produced > 0 after ${WARM_TICKS} ticks (got ${s1.rates.ore.produced})`);
ok(s1.rates.plate.produced > 0, `plate produced > 0 after ${WARM_TICKS} ticks (got ${s1.rates.plate.produced})`);

// ── Test 3: order of magnitude + consumption ────────────────────────────────
// Demo: 1 generator powers 1 miner (period 2 → emits ~every 3 ticks) + 1 smelter.
// Over RATE_WINDOW=30 ticks ≈ 10 ore; relaxed range for belt travel delays.
ok(s1.rates.ore.produced > 5,  `ore produced > 5 (got ${s1.rates.ore.produced})`);
ok(s1.rates.ore.produced < 30, `ore produced < 30 / window (got ${s1.rates.ore.produced})`);
ok(s1.rates.ore.consumed > 0,  `ore consumed > 0 (smelter) (got ${s1.rates.ore.consumed})`);

// ── Test 3b: all item keys present (rates covers every ItemType) ─────────────
for (const it of ['ore', 'plate', 'science', 'copper_ore', 'copper_plate', 'circuit'] as const) {
  ok(typeof s1.rates[it]?.produced === 'number', `rates has key ${it}`);
}

// ── Test 4: determinism ─────────────────────────────────────────────────────
const a = new World(); a.loadDemo();
const b = new World(); b.loadDemo();
const TICKS = 90;
for (let i = 0; i < TICKS; i++) { a.advance(); b.advance(); }
const sa = a.snapshot(150, false);
const sb = b.snapshot(150, false);
ok(JSON.stringify(sa.rates) === JSON.stringify(sb.rates), `rates deterministic after ${TICKS} ticks`);

// ── Test 5: window rolls — old production rotates out after RATE_WINDOW ticks ─
const w2 = new World();
w2.loadDemo();
for (let i = 0; i < WARM_TICKS; i++) w2.advance();
const ratesBefore = w2.snapshot(150, false).rates.ore.produced;
ok(ratesBefore > 0, `pre-roll: ore produced > 0 (got ${ratesBefore})`);

// Remove all modules to stop all production.
w2.modules.clear();

// Advance exactly RATE_WINDOW ticks (each one zeroes and replaces the old bucket).
const RATE_WINDOW = 30; // mirror the sim constant; update if world.ts changes it
for (let i = 0; i < RATE_WINDOW; i++) w2.advance();
const ratesAfter = w2.snapshot(150, false).rates.ore.produced;
ok(ratesAfter === 0, `post-roll: ore produced === 0 after window rotates (got ${ratesAfter})`);

// ── Test 6: minimap layer encodes ore + machines ────────────────────────────
const s6 = w.snapshot(150, false);
ok(s6.minimap.length === s6.w * s6.h, `minimap layer length = w*h (got ${s6.minimap.length})`);
ok(s6.minimap.some((v) => v === 1), 'minimap has at least one ore tile (value 1)');
ok(s6.minimap.some((v) => v >= 2), 'minimap has at least one machine tile (value >= 2)');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
