// Determinism replay harness — test-only helper. Never imported by src/.
// Runs a World for N ticks and returns a stable hash of the final snapshot.

import { World } from '../src/sim/world';
import type { Snapshot } from '../src/sim/types';

export type CommandFn = (world: World) => void;

export interface ReplayOpts {
  /** Number of ticks to advance. */
  ticks: number;
  /**
   * Called once after loadDemo(), before tick 0.
   * Use to set up initial state (inventory, unlocks, etc.) without going through commands.
   */
  setup?: (world: World) => void;
  /**
   * Map from tick index (0-based) to an array of CommandFns to call before that tick's advance().
   * Keys outside [0, ticks) are ignored.
   */
  commands?: Map<number, CommandFn[]>;
}

/** Sorted-keys JSON replacer. Objects → keys sorted; arrays → unchanged. */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  }
  return value;
}

/**
 * DJB2 hash over the UTF-16 code units of a string.
 * Returns an 8-character lowercase hex string (32-bit unsigned, zero-padded).
 * Deterministic across Node versions and platforms.
 */
export function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Returns a stable, sorted-key hash of a snapshot.
 * Any integer change in any snapshot field produces a different hash.
 */
export function snapshotHash(snap: Snapshot): string {
  return djb2Hex(JSON.stringify(snap, sortedReplacer));
}

/**
 * Run a fresh World through `opts.ticks` ticks and return the hash of the final snapshot.
 * The snapshot is taken with pulseMs=150 and paused=false (fixed values for determinism).
 */
export function replayHash(opts: ReplayOpts): string {
  const world = new World();
  world.loadDemo();
  if (opts.setup) opts.setup(world);
  for (let tick = 0; tick < opts.ticks; tick++) {
    const fns = opts.commands?.get(tick);
    if (fns) for (const fn of fns) fn(world);
    world.advance();
  }
  return snapshotHash(world.snapshot(150, false));
}
