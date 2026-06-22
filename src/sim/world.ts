import { DX, DY, type Dir, type ItemType, type ModuleType, type ModuleView, type SaveState, type Snapshot } from './types';

// The simulation is a deterministic, integer-only, tick-based state machine.
// Given the same sequence of commands and the same number of advance() calls it
// always produces the same state — enabling replays, blueprint validation, and
// future lockstep co-op. NOTHING here touches the DOM, PixiJS, or wall time.

export const GRID_W = 40;
export const GRID_H = 26;

const MINER_PERIOD = 1; // pulses of cooldown after emitting -> a packet every 2 pulses
const SMELT_TIME = 3; // pulses to turn one ore into one plate
const SMELT_CAP = 3; // ore buffer capacity of a smelter
const MINER_POWER = 2;
const SMELT_POWER = 3;
const GEN_POWER = 12;

/** Small deterministic PRNG so world generation is reproducible without state. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ModuleInst {
  type: ModuleType;
  dir: Dir;
  cooldown: number; // miner
  inBuf: number; // smelter input buffer
  progress: number; // smelter processing progress
  outBuf: number; // smelter finished plates awaiting emission
  busy: boolean; // did real work during the last pulse (for animation)
}

interface Packet {
  id: number;
  item: ItemType;
  cell: number;
  prevCell: number;
}

export class World {
  readonly w = GRID_W;
  readonly h = GRID_H;
  modules = new Map<number, ModuleInst>();
  ore = new Set<number>(); // cells with an ore deposit
  packets: Packet[] = [];
  private nextId = 1;
  pulse = 0;
  storage: Record<ItemType, number> = { ore: 0, plate: 0 };
  power = { produced: 0, used: 0, deficit: false };

  cell(x: number, y: number): number {
    return y * this.w + x;
  }

  private neighbor(c: number, d: Dir): number {
    const x = (c % this.w) + DX[d];
    const y = Math.floor(c / this.w) + DY[d];
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  place(c: number, type: ModuleType, dir: Dir): void {
    this.modules.set(c, { type, dir, cooldown: 0, inBuf: 0, progress: 0, outBuf: 0, busy: false });
  }

  remove(c: number): void {
    this.modules.delete(c);
    this.packets = this.packets.filter((p) => p.cell !== c);
  }

  private addOreBlob(cx: number, cy: number, r: number): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.ore.add(this.cell(x, y));
      }
    }
  }

  /** Deterministically scatter ore deposits across the map. */
  private genWorld(): void {
    this.ore.clear();
    this.modules.clear();
    this.packets = [];
    this.addOreBlob(20, 13, 3); // guaranteed patch under the starter base
    const rng = mulberry32(1337);
    for (let i = 0; i < 7; i++) {
      const x = 4 + Math.floor(rng() * (this.w - 8));
      const y = 4 + Math.floor(rng() * (this.h - 8));
      this.addOreBlob(x, y, 2 + Math.floor(rng() * 3));
    }
  }

  /** A small pre-built base near the centre so the first frame already shows flow. */
  loadDemo(): void {
    this.genWorld();
    this.storage = { ore: 0, plate: 0 };
    this.power = { produced: 0, used: 0, deficit: false };
    this.pulse = 0;
    this.nextId = 1;
    const y = 13;
    this.place(this.cell(20, 11), 'generator', 1);
    this.place(this.cell(20, y), 'miner', 1); // sits on the central ore patch
    this.place(this.cell(21, y), 'conveyor', 1);
    this.place(this.cell(22, y), 'conveyor', 1);
    this.place(this.cell(23, y), 'smelter', 1);
    this.place(this.cell(24, y), 'conveyor', 1);
    this.place(this.cell(25, y), 'conveyor', 1);
    this.place(this.cell(26, y), 'storage', 1);
  }

  /** Restore a saved game. In-flight packets and machine buffers are not saved. */
  loadSave(s: SaveState): void {
    this.genWorld(); // ore is deterministic, so regenerate rather than store it
    this.nextId = 1;
    this.storage = { ore: s.storage.ore ?? 0, plate: s.storage.plate ?? 0 };
    this.pulse = s.pulse ?? 0;
    this.power = { produced: 0, used: 0, deficit: false };
    for (const m of s.modules) this.place(m.cell, m.type, m.dir);
  }

  /** Advance the world by exactly one pulse. */
  advance(): void {
    // 1. Remember where every packet was, so the renderer can interpolate.
    for (const p of this.packets) p.prevCell = p.cell;
    for (const m of this.modules.values()) m.busy = false;

    // 2. Occupancy of conveyor cells (packets only ever ride conveyors).
    const occ = new Set<number>();
    for (const p of this.packets) occ.add(p.cell);

    // 3. Move packets along belts; consumers absorb. Repeat passes so a full
    //    chain advances in one pulse (the front moves first, freeing space).
    const removed = new Set<number>();
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of this.packets) {
        if (removed.has(p.id)) continue;
        const mod = this.modules.get(p.cell);
        if (!mod || mod.type !== 'conveyor') continue;
        const t = this.neighbor(p.cell, mod.dir);
        if (t < 0) continue;
        const tmod = this.modules.get(t);
        if (!tmod) continue;
        if (tmod.type === 'conveyor') {
          if (!occ.has(t)) {
            occ.delete(p.cell);
            occ.add(t);
            p.cell = t;
            moved = true;
          }
        } else if (tmod.type === 'smelter') {
          if (p.item === 'ore' && tmod.inBuf < SMELT_CAP) {
            tmod.inBuf++;
            removed.add(p.id);
            occ.delete(p.cell);
            moved = true;
          }
        } else if (tmod.type === 'storage') {
          this.storage[p.item]++;
          removed.add(p.id);
          occ.delete(p.cell);
          moved = true;
        }
      }
    }
    if (removed.size) this.packets = this.packets.filter((p) => !removed.has(p.id));

    // 4. Power: generators produce; miners (only on ore) and smelters draw.
    //    Allocated greedily in cell order so a deficit causes a deterministic
    //    brown-out.
    let produced = 0;
    for (const m of this.modules.values()) if (m.type === 'generator') produced += GEN_POWER;
    let budget = produced;
    let desired = 0;
    const cells = [...this.modules.keys()].sort((a, b) => a - b);
    const worked = new Set<number>();
    for (const c of cells) {
      const m = this.modules.get(c)!;
      let draw = 0;
      let wants = false;
      if (m.type === 'miner' && m.cooldown <= 0 && this.ore.has(c)) {
        const out = this.neighbor(c, m.dir);
        const omod = out >= 0 ? this.modules.get(out) : undefined;
        if (omod && omod.type === 'conveyor' && !occ.has(out)) {
          wants = true;
          draw = MINER_POWER;
        }
      } else if (m.type === 'smelter' && m.inBuf > 0 && m.progress < SMELT_TIME) {
        wants = true;
        draw = SMELT_POWER;
      }
      if (wants) {
        desired += draw;
        if (budget >= draw) {
          budget -= draw;
          worked.add(c);
        }
      }
    }
    this.power = { produced, used: produced - budget, deficit: desired > produced };

    // 5. Process machines and emit new packets onto free output conveyors.
    for (const c of cells) {
      const m = this.modules.get(c)!;
      if (m.type === 'miner') {
        if (m.cooldown > 0) m.cooldown--;
        if (worked.has(c)) {
          const out = this.neighbor(c, m.dir);
          if (out >= 0 && !occ.has(out) && this.modules.get(out)?.type === 'conveyor') {
            this.packets.push({ id: this.nextId++, item: 'ore', cell: out, prevCell: out });
            occ.add(out);
            m.cooldown = MINER_PERIOD;
            m.busy = true;
          }
        }
      } else if (m.type === 'smelter') {
        if (worked.has(c)) {
          m.busy = true;
          m.progress++;
          if (m.progress >= SMELT_TIME) {
            m.progress = 0;
            m.inBuf--;
            m.outBuf++;
          }
        }
        if (m.outBuf > 0) {
          const out = this.neighbor(c, m.dir);
          if (out >= 0 && !occ.has(out) && this.modules.get(out)?.type === 'conveyor') {
            this.packets.push({ id: this.nextId++, item: 'plate', cell: out, prevCell: out });
            occ.add(out);
            m.outBuf--;
          }
        }
      }
    }

    this.pulse++;
  }

  snapshot(pulseMs: number, paused: boolean): Snapshot {
    return {
      w: this.w,
      h: this.h,
      pulse: this.pulse,
      pulseMs,
      paused,
      modules: [...this.modules.entries()].map(([cell, m]) => {
        const v: ModuleView = { cell, type: m.type, dir: m.dir };
        if (m.type === 'smelter') {
          v.progress = m.progress / SMELT_TIME;
          v.buffer = m.inBuf;
          v.busy = m.busy;
        } else if (m.type === 'miner') {
          v.busy = m.busy;
        } else if (m.type === 'generator') {
          v.busy = true;
        }
        return v;
      }),
      packets: this.packets.map((p) => ({ id: p.id, item: p.item, prevCell: p.prevCell, cell: p.cell })),
      storage: { ...this.storage },
      power: { ...this.power },
      ore: [...this.ore],
    };
  }
}
