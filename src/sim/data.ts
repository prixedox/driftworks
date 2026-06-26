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
};

export const START_INVENTORY: Record<ItemType, number> = { ore: 30, plate: 0 };

export const START_UNLOCKED: ModuleType[] = ['miner', 'conveyor', 'storage', 'smelter', 'generator'];
