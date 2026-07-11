import type { Snapshot } from '../sim/types';
import type { Tool } from './hotbar';
import { BUILD_COSTS } from '../sim/data';

export function placementValid(cell: number, tool: Tool, s: Snapshot): boolean {
  if (tool === 'inspect' || tool === 'erase' || tool === 'blueprint') return false;
  if (s.modules.some((m) => m.cell === cell)) return false;
  if (tool === 'miner' && !s.ore.includes(cell)) return false;
  if (!s.unlocked.includes(tool)) return false;
  const cost = BUILD_COSTS[tool];
  if ((s.inventory[cost.item] ?? 0) < cost.amount) return false;
  return true;
}
