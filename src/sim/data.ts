import type { ItemType, ModuleType, UpgradeId } from './types';
export type { UpgradeId } from './types';

export interface BuildCost {
  item: ItemType;
  amount: number;
}

export const BUILD_COSTS: Record<ModuleType, BuildCost> = {
  miner: { item: 'ore', amount: 5 },
  conveyor: { item: 'ore', amount: 1 },
  storage: { item: 'ore', amount: 5 },
  smelter: { item: 'ore', amount: 10 },
  generator: { item: 'ore', amount: 10 },
  assembler: { item: 'plate', amount: 10 },
  lab: { item: 'plate', amount: 15 },
};

export const START_INVENTORY: Record<ItemType, number> = {
  ore: 40, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0,
};

// Includes default recipe IDs (smelt_iron, assemble_science) so recipe-selectable
// machines have a valid recipe available from the start without research.
export const START_UNLOCKED: string[] = ['miner', 'conveyor', 'storage', 'smelt_iron', 'assemble_science'];

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

export interface Tech {
  id: string;
  name: string;
  desc: string;
  costItem: ItemType;
  cost: number;
  prereqs: string[];
  /** Module types and/or recipe IDs unlocked when this tech completes. */
  unlocks?: string[];
  upgrade?: UpgradeId;
}

export const TECHS: Tech[] = [
  { id: 'smelting', name: 'Smelting', desc: 'Refine ore into plates.', costItem: 'ore', cost: 20, prereqs: [], unlocks: ['smelter'] },
  { id: 'power', name: 'Power', desc: 'Generate electricity.', costItem: 'ore', cost: 30, prereqs: ['smelting'], unlocks: ['generator'] },
  { id: 'automation', name: 'Automation Science', desc: 'Assemblers + Labs; automate research.', costItem: 'plate', cost: 30, prereqs: ['power'], unlocks: ['assembler', 'lab'] },
  { id: 'mining_prod', name: 'Mining Productivity', desc: 'Miners work 50% faster.', costItem: 'science', cost: 40, prereqs: ['automation'], upgrade: 'miner_speed' },
  { id: 'smelt_eff', name: 'Smelting Efficiency', desc: 'Smelters work 50% faster.', costItem: 'science', cost: 50, prereqs: ['automation'], upgrade: 'smelter_speed' },
  { id: 'power_grid', name: 'Power Grid', desc: 'Generators output 50% more.', costItem: 'science', cost: 60, prereqs: ['automation'], upgrade: 'gen_output' },
  {
    id: 'copper_basics',
    name: 'Copper Processing',
    desc: 'Unlock copper smelting and circuit assembly.',
    costItem: 'plate',
    cost: 40,
    prereqs: ['automation'],
    unlocks: ['smelt_copper', 'assemble_circuit'],
  },
  {
    id: 'circuits',
    name: 'Circuits',
    desc: 'Advanced circuit boards from copper and iron plates.',
    costItem: 'science',
    cost: 60,
    prereqs: ['copper_basics'],
  },
];
