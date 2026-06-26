// Determinism replay + golden-hash regression test.
//
// HOW TO UPDATE THE GOLDEN HASH after an intentional sim change:
//   1. Run this test — it will fail and print the actual hash.
//   2. Replace the GOLDEN constant with the printed hash.
//   3. Run again to confirm PASS.
//   4. Commit the new golden hash together with the sim change that caused it.

import { replayHash, snapshotHash, djb2Hex } from './_harness';
import { World } from '../src/sim/world';

// ─── Golden hash constant ──────────────────────────────────────────────────
// Set to 'COMPUTE_ME' on first run; replace with the printed actual hash,
// then commit both the harness and this file together.
const GOLDEN = '9fe103b7';

// ─── Command stream ─────────────────────────────────────────────────────────
// A fixed sequence of operations that exercises inventory, modules, belts,
// converters, storage, collect, and research — the most determinism-sensitive paths.
//
// The setup callback unlocks smelter (requires completing 'smelting' research)
// and loads enough inventory to place additional modules without running dry.
// All placements use absolute cell indices on the 40×26 grid; we place in a
// region away from the demo base (row 5) to avoid collisions.

import { World as W } from '../src/sim/world';

type CmdMap = Map<number, Array<(w: W) => void>>;

function buildCommandStream(): CmdMap {
  const cmds: CmdMap = new Map();
  const at = (tick: number, fn: (w: W) => void) => {
    if (!cmds.has(tick)) cmds.set(tick, []);
    cmds.get(tick)!.push(fn);
  };

  // tick 0: place an extra conveyor at cell (5,5)=(5*40+5=205)
  at(0, (w) => {
    w.inventory.ore = 100; // ensure affordable
    w.place(w.cell(5, 5), 'conveyor', 1);
  });

  // tick 10: collect whatever has arrived in storage by now
  at(10, (w) => w.collect());

  // tick 20: select 'smelting' research and contribute from inventory
  at(20, (w) => {
    w.inventory.ore = 200;
    w.selectResearch('smelting');
    w.contributeResearch(); // pays 20 ore → completes smelting
  });

  // tick 30: collect again
  at(30, (w) => w.collect());

  // tick 50: select next research ('power') and contribute
  at(50, (w) => {
    w.inventory.ore = 200;
    w.selectResearch('power');
    w.contributeResearch(); // pays 30 ore → completes power
  });

  return cmds;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    console.error('FAIL', m);
    fails++;
  }
};

const TICKS = 100;
const commands = buildCommandStream();
const setup = (_w: W) => {
  // No extra setup beyond what buildCommandStream injects at tick 0.
  // loadDemo() already fires before tick 0 in replayHash.
};

// Test 1: Two independent Worlds with the same command stream produce the same hash.
const hashA = replayHash({ ticks: TICKS, setup, commands });
const hashB = replayHash({ ticks: TICKS, setup, commands });
ok(hashA === hashB, `two-world identity: A=${hashA} B=${hashB}`);

// Test 2: A different tick count produces a different hash (hash sensitivity check).
const hashShort = replayHash({ ticks: TICKS - 1, setup, commands });
ok(hashA !== hashShort, `hash changes with different tick count: ${TICKS} ticks vs ${TICKS - 1} ticks`);

// Test 3: No commands vs commands produces different hashes (commands affect state).
const hashNoCommands = replayHash({ ticks: TICKS });
ok(hashA !== hashNoCommands, 'command stream changes final hash vs no-commands baseline');

// Test 4: Golden hash regression — catches accidental sim changes.
// If GOLDEN === 'COMPUTE_ME', print the actual hash and fail with instructions.
if (GOLDEN === 'COMPUTE_ME') {
  console.error(`FAIL golden hash not set. Actual hash for TICKS=${TICKS} with command stream: ${hashA}`);
  console.error('Replace GOLDEN = \'COMPUTE_ME\' with GOLDEN = \'' + hashA + '\' and re-run.');
  fails++;
} else {
  ok(hashA === GOLDEN, `golden hash: expected ${GOLDEN} got ${hashA}`);
}

// Test 5: djb2Hex produces consistent output for a known input (unit-test the hasher).
const knownHash = djb2Hex('driftworks');
ok(knownHash === djb2Hex('driftworks'), 'djb2Hex is idempotent');
ok(knownHash.length === 8, `djb2Hex output is 8 chars (got ${knownHash.length})`);
ok(/^[0-9a-f]{8}$/.test(knownHash), `djb2Hex output is lowercase hex (got ${knownHash})`);

// Test 6: snapshotHash is stable for a fixed snapshot (not just in replayHash).
const world = new World();
world.loadDemo();
for (let i = 0; i < 20; i++) world.advance();
const snap = world.snapshot(150, false);
const h1 = snapshotHash(snap);
const h2 = snapshotHash(snap);
ok(h1 === h2, 'snapshotHash is stable for same snapshot object');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
