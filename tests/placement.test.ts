import { placementValid } from '../src/ui/placement';
import type { Snapshot } from '../src/sim/types';

const base = (over: Partial<Snapshot>): Snapshot => ({
  w: 4, h: 4, pulse: 0, pulseMs: 150, paused: false,
  modules: [], packets: [], storage: { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 },
  power: { produced: 0, used: 0, deficit: false }, ore: [], oreType: [],
  inventory: { ore: 100, plate: 100, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 },
  unlocked: ['miner', 'conveyor', 'storage', 'smelter', 'generator'],
  unlockedRecipes: ['smelt_iron', 'assemble_science'],
  research: { active: null, progress: 0, completed: [] },
  ...over,
});

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

ok(placementValid(5, 'conveyor', base({})) === true, 'belt on empty (unlocked+affordable)');
ok(placementValid(5, 'miner', base({ ore: [5] })) === true, 'miner on ore');
ok(placementValid(5, 'miner', base({ ore: [] })) === false, 'miner off ore');
ok(placementValid(5, 'conveyor', base({ modules: [{ cell: 5, type: 'conveyor', dir: 1 }] })) === false, 'occupied');
ok(placementValid(5, 'smelter', base({ unlocked: ['miner', 'conveyor', 'storage'] })) === false, 'locked tool rejected');
ok(placementValid(5, 'smelter', base({ inventory: { ore: 0, plate: 0, science: 0 } })) === false, 'unaffordable rejected');
ok(placementValid(5, 'inspect', base({})) === false, 'inspect not a placement');
ok(placementValid(5, 'erase', base({})) === false, 'erase not a placement');
console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
