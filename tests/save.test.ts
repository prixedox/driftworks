import { World } from '../src/sim/world';
import { START_INVENTORY, START_UNLOCKED } from '../src/sim/data';
import type { SaveState } from '../src/sim/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// ---------------------------------------------------------------------------
// Helper: build a SaveState v3 from a World's current snapshot
// (mirrors what main.ts writeSave does, but without the DOM).
// ---------------------------------------------------------------------------
function snapshotToSave(w: World): SaveState {
  const s = w.snapshot(150, false);
  return {
    version: 3,
    modules: s.modules.map((m) => ({ cell: m.cell, type: m.type, dir: m.dir })),
    storage: s.storage,
    pulse: s.pulse,
    player: { x: 20.5, y: 13.5 },
    inventory: s.inventory,
    unlocked: s.unlocked,
    research: s.research,
    upgrades: s.upgrades,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Round-trip — inventory preserved
// ---------------------------------------------------------------------------
{
  const w1 = new World();
  w1.loadDemo();
  // Give the world some non-default inventory state.
  w1.inventory.ore = 77;
  w1.inventory.plate = 42;
  w1.inventory.science = 11;
  // Earn the smelting tech so unlocked set is non-trivial.
  w1.selectResearch('smelting');
  w1.contributeResearch(); // costs 20 ore → ore = 57
  ok(w1.research.completed.has('smelting'), 'rt: smelting completed');
  ok(w1.unlocked.has('smelter'), 'rt: smelter unlocked after smelting');
  // Advance a few ticks to get a non-zero pulse.
  for (let i = 0; i < 10; i++) w1.advance();
  ok(w1.pulse === 10, 'rt: pulse is 10 after 10 advances');

  const save = snapshotToSave(w1);
  ok(save.version === 3, 'rt: save is version 3');
  ok(save.inventory.ore === 57, `rt: inventory.ore serialized (got ${save.inventory.ore})`);
  ok(save.inventory.plate === 42, `rt: inventory.plate serialized (got ${save.inventory.plate})`);
  ok(save.inventory.science === 11, `rt: inventory.science serialized (got ${save.inventory.science})`);
  ok(save.unlocked.includes('smelter'), 'rt: unlocked includes smelter');
  ok(save.research.completed.includes('smelting'), 'rt: research.completed includes smelting');
  ok(save.pulse === 10, `rt: pulse serialized (got ${save.pulse})`);

  const w2 = new World();
  w2.loadSave(save);
  ok(w2.inventory.ore === 57, `rt: loaded inventory.ore (got ${w2.inventory.ore})`);
  ok(w2.inventory.plate === 42, `rt: loaded inventory.plate (got ${w2.inventory.plate})`);
  ok(w2.inventory.science === 11, `rt: loaded inventory.science (got ${w2.inventory.science})`);
  ok(w2.unlocked.has('smelter'), 'rt: loaded unlocked has smelter');
  ok(w2.research.completed.has('smelting'), 'rt: loaded research.completed has smelting');
  ok(w2.pulse === 10, `rt: loaded pulse (got ${w2.pulse})`);
}

// ---------------------------------------------------------------------------
// Test 2: Round-trip — research active + progress preserved
// ---------------------------------------------------------------------------
{
  const w1 = new World();
  w1.loadDemo();
  // Manually complete smelting prereq then start but don't finish power.
  w1.inventory.ore = 999;
  w1.selectResearch('smelting');
  w1.contributeResearch(); // completes smelting
  w1.selectResearch('power');
  // Contribute only 10 of 30 cost.
  w1.inventory.ore = 10;
  w1.contributeResearch();
  ok(w1.research.active === 'power', `rp: active is power (got ${w1.research.active})`);
  ok(w1.research.progress === 10, `rp: progress is 10 (got ${w1.research.progress})`);

  const save = snapshotToSave(w1);
  const w2 = new World();
  w2.loadSave(save);
  ok(w2.research.active === 'power', `rp: loaded active is power (got ${w2.research.active})`);
  ok(w2.research.progress === 10, `rp: loaded progress is 10 (got ${w2.research.progress})`);
}

// ---------------------------------------------------------------------------
// Test 3: Round-trip — upgrades preserved
// ---------------------------------------------------------------------------
{
  const w1 = new World();
  w1.loadDemo();
  // Complete the full chain to power_grid to earn gen_output upgrade.
  (['smelting', 'power', 'automation', 'power_grid'] as const).forEach((id) => {
    w1.inventory.ore = 999; w1.inventory.plate = 999; w1.inventory.science = 999;
    w1.selectResearch(id);
    w1.contributeResearch();
  });
  ok(w1.upgrades.has('gen_output'), 'upg: gen_output upgrade earned');

  const save = snapshotToSave(w1);
  ok(save.upgrades.includes('gen_output'), 'upg: upgrades serialized');
  const w2 = new World();
  w2.loadSave(save);
  ok(w2.upgrades.has('gen_output'), 'upg: loaded upgrades has gen_output');
  // Verify the upgrade is active: advance one tick and check power output.
  w2.advance();
  const snap = w2.snapshot(150, false);
  // The demo world has a generator at cell 20*40+11=831; check produced > 12.
  ok(snap.power.produced === 18, `upg: generator produces 18 with power_grid upgrade (got ${snap.power.produced})`);
}

// ---------------------------------------------------------------------------
// Test 4: v2 migration — defaults applied correctly
// ---------------------------------------------------------------------------
{
  // Inline the migration logic (mirrors main.ts migrateToV3) to avoid DOM deps.
  function migrateToV3(raw: unknown): SaveState | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (s['version'] !== 2 || !Array.isArray(s['modules'])) return null;
    return {
      version: 3,
      modules: s['modules'] as SaveState['modules'],
      storage: (s['storage'] as SaveState['storage']) ?? { ore: 0, plate: 0, science: 0 },
      pulse: typeof s['pulse'] === 'number' ? s['pulse'] : 0,
      player: s['player'] as SaveState['player'],
      inventory: { ...START_INVENTORY },
      unlocked: [...START_UNLOCKED],
      research: { active: null, progress: 0, completed: [] },
      upgrades: [],
    };
  }

  const v2Raw = {
    version: 2,
    modules: [{ cell: 800, type: 'miner', dir: 1 }, { cell: 801, type: 'conveyor', dir: 1 }],
    storage: { ore: 5, plate: 2 },
    pulse: 42,
    player: { x: 21, y: 13 },
  };

  const migrated = migrateToV3(v2Raw);
  ok(migrated !== null, 'v2m: migration returns non-null');
  ok(migrated!.version === 3, 'v2m: migrated version is 3');
  ok(migrated!.pulse === 42, `v2m: pulse preserved (got ${migrated!.pulse})`);
  ok(migrated!.modules.length === 2, `v2m: modules preserved (got ${migrated!.modules.length})`);
  ok(migrated!.inventory.ore === START_INVENTORY.ore, `v2m: inventory defaults to START_INVENTORY (got ${migrated!.inventory.ore})`);
  ok(migrated!.unlocked[0] === START_UNLOCKED[0], 'v2m: unlocked defaults to START_UNLOCKED');
  ok(migrated!.research.active === null, 'v2m: research.active is null');
  ok(migrated!.research.completed.length === 0, 'v2m: research.completed is empty');
  ok(migrated!.upgrades.length === 0, 'v2m: upgrades is empty');

  // Load into a World — must not crash, and state must reflect defaults.
  const w = new World();
  w.loadSave(migrated!);
  ok(w.inventory.ore === START_INVENTORY.ore, `v2m: world inventory.ore after load (got ${w.inventory.ore})`);
  ok(w.pulse === 42, `v2m: world pulse after load (got ${w.pulse})`);
  ok(w.modules.size === 2, `v2m: world modules after load (got ${w.modules.size})`);
  ok(w.research.completed.size === 0, 'v2m: world research.completed is empty after load');
  ok(w.upgrades.size === 0, 'v2m: world upgrades is empty after load');
  // Advance a few ticks — must not throw.
  for (let i = 0; i < 5; i++) w.advance();
  ok(w.pulse === 47, `v2m: world advances correctly after migration load (got ${w.pulse})`);
}

// ---------------------------------------------------------------------------
// Test 5: v2 migration — rejects non-v2 garbage
// ---------------------------------------------------------------------------
{
  function migrateToV3(raw: unknown): SaveState | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (s['version'] !== 2 || !Array.isArray(s['modules'])) return null;
    return {
      version: 3,
      modules: s['modules'] as SaveState['modules'],
      storage: (s['storage'] as SaveState['storage']) ?? { ore: 0, plate: 0, science: 0 },
      pulse: typeof s['pulse'] === 'number' ? s['pulse'] : 0,
      player: undefined,
      inventory: { ...START_INVENTORY },
      unlocked: [...START_UNLOCKED],
      research: { active: null, progress: 0, completed: [] },
      upgrades: [],
    };
  }

  ok(migrateToV3(null) === null, 'rej: null → null');
  ok(migrateToV3('string') === null, 'rej: string → null');
  ok(migrateToV3({ version: 1, modules: [] }) === null, 'rej: v1 → null');
  ok(migrateToV3({ version: 3, modules: [] }) === null, 'rej: v3 passthrough not accepted as v2');
  ok(migrateToV3({ version: 2, modules: 'notanarray' }) === null, 'rej: bad modules → null');
}

// ---------------------------------------------------------------------------
// Test 6: Determinism preserved after load
// ---------------------------------------------------------------------------
{
  // Two worlds loaded from the same save must produce identical snapshots after N advances.
  const w1 = new World();
  w1.loadDemo();
  w1.inventory.ore = 999; w1.inventory.plate = 999; w1.inventory.science = 999;
  w1.selectResearch('smelting'); w1.contributeResearch();
  for (let i = 0; i < 20; i++) w1.advance();

  const save = snapshotToSave(w1);

  const wa = new World(); wa.loadSave(save);
  const wb = new World(); wb.loadSave(save);
  for (let i = 0; i < 30; i++) { wa.advance(); wb.advance(); }

  const snapA = wa.snapshot(150, false);
  const snapB = wb.snapshot(150, false);
  ok(JSON.stringify(snapA) === JSON.stringify(snapB), 'det: two worlds loaded from same save are deterministically identical after 30 advances');
}

// ---------------------------------------------------------------------------
console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
