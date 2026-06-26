import type { ItemType, ModuleType } from './types';

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

export const START_INVENTORY: Record<ItemType, number> = { ore: 40, plate: 0, science: 0 };

export const START_UNLOCKED: ModuleType[] = ['miner', 'conveyor', 'storage'];

export type UpgradeId = 'miner_speed' | 'smelter_speed' | 'gen_output';

export interface Tech {
  id: string;
  name: string;
  desc: string;
  costItem: ItemType;
  cost: number;
  prereqs: string[];
  unlocks?: ModuleType[];
  upgrade?: UpgradeId;
}

export const TECHS: Tech[] = [
  { id: 'smelting', name: 'Smelting', desc: 'Refine ore into plates.', costItem: 'ore', cost: 20, prereqs: [], unlocks: ['smelter'] },
  { id: 'power', name: 'Power', desc: 'Generate electricity.', costItem: 'ore', cost: 30, prereqs: ['smelting'], unlocks: ['generator'] },
  { id: 'automation', name: 'Automation Science', desc: 'Assemblers + Labs; automate research.', costItem: 'plate', cost: 30, prereqs: ['power'], unlocks: ['assembler', 'lab'] },
  { id: 'mining_prod', name: 'Mining Productivity', desc: 'Miners work 50% faster.', costItem: 'science', cost: 40, prereqs: ['automation'], upgrade: 'miner_speed' },
  { id: 'smelt_eff', name: 'Smelting Efficiency', desc: 'Smelters work 50% faster.', costItem: 'science', cost: 50, prereqs: ['automation'], upgrade: 'smelter_speed' },
  { id: 'power_grid', name: 'Power Grid', desc: 'Generators output 50% more.', costItem: 'science', cost: 60, prereqs: ['automation'], upgrade: 'gen_output' },
];
