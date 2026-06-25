import type { Snapshot } from '../sim/types';
import type { Tool } from './hotbar';

export function placementValid(cell: number, tool: Tool, s: Snapshot): boolean {
  if (tool === 'inspect' || tool === 'erase') return false;
  if (s.modules.some((m) => m.cell === cell)) return false;
  if (tool === 'miner') return s.ore.includes(cell);
  return true;
}
