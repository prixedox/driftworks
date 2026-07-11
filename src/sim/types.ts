// Shared contract between the main thread (render/UI) and the sim worker.
// Keep this file dependency-free so both sides can import it cheaply.

export type ItemType = 'ore' | 'plate' | 'science' | 'copper_ore' | 'copper_plate' | 'circuit';
/** The type of resource in a deposit cell. */
export type OreType = 'iron' | 'copper';
export type ModuleType = 'miner' | 'conveyor' | 'smelter' | 'storage' | 'generator' | 'assembler' | 'lab';

/** 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;

export type UpgradeId = 'miner_speed' | 'smelter_speed' | 'gen_output';

/** Direction deltas, indexed by Dir. Shared by sim and renderer. */
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export interface ModuleView {
  cell: number;
  type: ModuleType;
  dir: Dir;
  /** Actively doing work this pulse (for beat/flash effects). */
  busy?: boolean;
  /** Smelter cook progress, 0..1. */
  progress?: number;
  /** Items held internally (smelter ore input buffer). */
  buffer?: number;
  /** Finished items waiting to be emitted (smelter plate output). */
  out?: number;
  /** Current recipe ID for recipe-selectable machines (smelter, assembler). */
  recipe?: string;
}

export interface PacketView {
  id: number;
  item: ItemType;
  /** Continuous tile coordinates this tick (x = column, y = row). */
  x: number;
  y: number;
  /** Previous tick's coordinates, for smooth render interpolation. */
  px: number;
  py: number;
}

/** Immutable view of the world the worker ships to the renderer each pulse. */
export interface Snapshot {
  w: number;
  h: number;
  pulse: number;
  /** Current pulse interval in ms, so the renderer knows how long to interpolate over. */
  pulseMs: number;
  paused: boolean;
  modules: ModuleView[];
  packets: PacketView[];
  storage: Record<ItemType, number>;
  power: { produced: number; used: number; deficit: boolean };
  /** Cells of the world that contain an ore deposit (miners only work on these). */
  ore: number[];
  /** Parallel to `ore`; index i gives the OreType of ore[i]. */
  oreType: OreType[];
  inventory: Record<ItemType, number>;
  unlocked: ModuleType[];
  /** Recipe IDs the player has unlocked (via research). */
  unlockedRecipes: string[];
  research: { active: string | null; progress: number; completed: string[] };
  upgrades: UpgradeId[];
  /** Copied blueprint stamp (relative offsets); empty when nothing is copied. */
  clipboard: { relCol: number; relRow: number; type: ModuleType; dir: Dir }[];
}

/** Persistent save (written by the main thread; workers can't use localStorage). */
export interface SaveState {
  version: 3;
  modules: { cell: number; type: ModuleType; dir: Dir }[];
  storage: Record<ItemType, number>;
  pulse: number;
  /** Player position in tile coordinates. */
  player?: { x: number; y: number };
  inventory: Record<ItemType, number>;
  /** Unlocked module types AND recipe IDs (the world's unlocked set is `string[]`). */
  unlocked: string[];
  research: { active: string | null; progress: number; completed: string[] };
  upgrades: UpgradeId[];
}

/** Commands: main thread -> worker. */
export type Command =
  | { type: 'init' }
  | { type: 'reset' }
  | { type: 'load'; save: SaveState }
  | { type: 'place'; cell: number; module: ModuleType; dir: Dir }
  | { type: 'remove'; cell: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'speed'; pulseMs: number }
  | { type: 'collect' }
  | { type: 'research'; action: 'select'; tech: string }
  | { type: 'research'; action: 'contribute' }
  | { type: 'undo' }
  | { type: 'blueprint'; action: 'copy'; cells: number[] }
  | { type: 'blueprint'; action: 'paste'; originCell: number }
  | { type: 'select-recipe'; cell: number; recipe: string };

/** Messages: worker -> main thread. */
export type WorkerMessage = { type: 'snapshot'; snapshot: Snapshot };

export interface ModuleDef {
  label: string;
  short: string;
  color: number;
}

export const DEFS: Record<ModuleType, ModuleDef> = {
  miner: { label: 'Miner', short: 'MINE', color: 0xb8732e },
  conveyor: { label: 'Belt', short: 'BELT', color: 0x37424f },
  smelter: { label: 'Smelter', short: 'MELT', color: 0xc0392b },
  storage: { label: 'Storage', short: 'BOX', color: 0x2e7d57 },
  generator: { label: 'Generator', short: 'PWR', color: 0xb59a2e },
  assembler: { label: 'Assembler', short: 'ASM', color: 0x7b5cc0 },
  lab: { label: 'Lab', short: 'LAB', color: 0x3f7fd0 },
};

export const ITEM_COLOR: Record<ItemType, number> = {
  ore: 0xe8a35a,
  plate: 0x8fd0ff,
  science: 0xc55cff,
  copper_ore: 0xe07840,
  copper_plate: 0xf09030,
  circuit: 0x44cc66,
};

export const ITEM_LABEL: Record<ItemType, string> = {
  ore: 'Ore',
  plate: 'Plate',
  science: 'Science',
  copper_ore: 'Copper Ore',
  copper_plate: 'Copper Plate',
  circuit: 'Circuit',
};

/** Short plain-language caption shown under each machine in "Explain" mode. */
export const EXPLAIN: Record<ModuleType, string> = {
  generator: 'Power',
  miner: 'Digs ore',
  conveyor: 'Carries',
  smelter: 'Ore → Plate',
  storage: 'Stores',
  assembler: 'Plate → Science',
  lab: 'Research',
};
