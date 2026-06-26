import { DX, DY, type Dir, type ItemType, type ModuleType, type OreType, type ModuleView, type SaveState, type Snapshot } from './types';
import { BUILD_COSTS, START_INVENTORY, START_UNLOCKED, TECHS, RECIPES, type Recipe, type RecipeId, type UpgradeId } from './data';

// Deterministic, integer-only, tick-based simulation. Belts use sub-tile
// "slots" so items flow continuously and pack densely against each other
// (Factorio-style), while the model stays discrete and reproducible.

export const GRID_W = 40;
export const GRID_H = 26;

const SLOTS = 4; // sub-tile positions per belt cell (items move 1 slot/tick)
const MINER_PERIOD = 2; // cooldown ticks after emitting -> an item every 3 ticks; the miner_speed upgrade brings it to every 2
const SMELT_TIME = 6; // ticks to turn one ore into one plate (smelt_iron default; scaled by smelter_speed upgrade)
const LAB_CAP = 6; // max science flasks buffered in a lab
const MINER_POWER = 2;
const GEN_POWER = 12;

function getRecipe(id: RecipeId | string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** Default recipe ID for a machine type (first matching recipe). */
function defaultRecipe(type: ModuleType): RecipeId | undefined {
  return RECIPES.find((r) => r.machines.includes(type))?.id;
}

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
  cooldown: number;
  /** Input buffer: map from ItemType to integer count. Single-input recipes have one key. */
  inBuf: Map<ItemType, number>;
  progress: number;
  outBuf: number;
  busy: boolean;
  /** Active recipe for recipe-selectable machines. Undefined for non-recipe machines. */
  recipeId?: RecipeId;
}

interface Packet {
  id: number;
  item: ItemType;
  cell: number;
  slot: number; // 0..SLOTS-1 along the belt's direction
  prevCell: number;
  prevSlot: number;
}

export class World {
  readonly w = GRID_W;
  readonly h = GRID_H;
  modules = new Map<number, ModuleInst>();
  ore = new Map<number, OreType>();
  packets: Packet[] = [];
  private nextId = 1;
  pulse = 0;
  storage: Record<ItemType, number> = { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 };
  power = { produced: 0, used: 0, deficit: false };
  inventory: Record<ItemType, number> = { ...START_INVENTORY };
  unlocked = new Set<string>(START_UNLOCKED);
  research: { active: string | null; progress: number; completed: Set<string> } = { active: null, progress: 0, completed: new Set() };
  upgrades = new Set<UpgradeId>();

  cell(x: number, y: number): number {
    return y * this.w + x;
  }

  private neighbor(c: number, d: Dir): number {
    const x = (c % this.w) + DX[d];
    const y = Math.floor(c / this.w) + DY[d];
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  private placeRaw(c: number, type: ModuleType, dir: Dir): void {
    const recipeId = defaultRecipe(type);
    this.modules.set(c, {
      type,
      dir,
      cooldown: 0,
      inBuf: new Map<ItemType, number>(),
      progress: 0,
      outBuf: 0,
      busy: false,
      recipeId,
    });
  }

  /** Public seam for tests. */
  placeRawPublic(c: number, type: ModuleType, dir: Dir): void {
    this.placeRaw(c, type, dir);
  }

  place(c: number, type: ModuleType, dir: Dir): boolean {
    if (!this.unlocked.has(type)) return false;
    const cost = BUILD_COSTS[type];
    if ((this.inventory[cost.item] ?? 0) < cost.amount) return false;
    this.inventory[cost.item] -= cost.amount;
    this.placeRaw(c, type, dir);
    return true;
  }

  collect(): void {
    (Object.keys(this.storage) as ItemType[]).forEach((k) => {
      this.inventory[k] = (this.inventory[k] ?? 0) + this.storage[k];
      this.storage[k] = 0;
    });
  }

  selectResearch(id: string): void {
    if (this.research.active === id) return;
    const tech = TECHS.find((t) => t.id === id);
    if (!tech || this.research.completed.has(id)) return;
    if (!tech.prereqs.every((p) => this.research.completed.has(p))) return;
    this.research.active = id;
    this.research.progress = 0;
  }

  contributeResearch(): void {
    const id = this.research.active;
    if (!id) return;
    const tech = TECHS.find((t) => t.id === id)!;
    const have = this.inventory[tech.costItem] ?? 0;
    const need = tech.cost - this.research.progress;
    const take = Math.min(have, need);
    this.inventory[tech.costItem] -= take;
    this.research.progress += take;
    if (this.research.progress >= tech.cost) this.completeResearch(tech.id);
  }

  selectRecipe(cell: number, recipeId: string): boolean {
    const m = this.modules.get(cell);
    if (!m) return false;
    const recipe = getRecipe(recipeId);
    if (!recipe) return false;
    if (!recipe.machines.includes(m.type)) return false;
    if (!this.unlocked.has(recipeId)) return false;
    // Clear input buffer on recipe switch to avoid cross-recipe contamination.
    m.inBuf.clear();
    m.progress = 0;
    m.outBuf = 0;
    m.recipeId = recipe.id;
    return true;
  }

  private completeResearch(id: string): void {
    const tech = TECHS.find((t) => t.id === id)!;
    this.research.completed.add(id);
    tech.unlocks?.forEach((b) => this.unlocked.add(b));
    if (tech.upgrade) this.upgrades.add(tech.upgrade);
    this.research.active = null;
    this.research.progress = 0;
  }

  remove(c: number): void {
    this.modules.delete(c);
    this.packets = this.packets.filter((p) => p.cell !== c);
  }

  private addOreBlob(cx: number, cy: number, r: number, kind: OreType): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.ore.set(this.cell(x, y), kind);
      }
    }
  }

  private genWorld(): void {
    this.ore.clear();
    this.modules.clear();
    this.packets = [];
    this.addOreBlob(20, 13, 3, 'iron');
    const rng = mulberry32(1337);
    for (let i = 0; i < 7; i++) {
      const x = 4 + Math.floor(rng() * (this.w - 8));
      const y = 4 + Math.floor(rng() * (this.h - 8));
      const r = 2 + Math.floor(rng() * 3);
      const kind: OreType = i < 5 ? 'iron' : 'copper';
      this.addOreBlob(x, y, r, kind);
    }
  }

  loadDemo(): void {
    this.genWorld();
    this.storage = { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 };
    this.power = { produced: 0, used: 0, deficit: false };
    this.pulse = 0;
    this.nextId = 1;
    this.inventory = { ...START_INVENTORY };
    this.unlocked = new Set<string>(START_UNLOCKED);
    this.research = { active: null, progress: 0, completed: new Set() };
    this.upgrades = new Set();
    const y = 13;
    this.placeRaw(this.cell(20, 11), 'generator', 1);
    this.placeRaw(this.cell(20, y), 'miner', 1);
    this.placeRaw(this.cell(21, y), 'conveyor', 1);
    this.placeRaw(this.cell(22, y), 'conveyor', 1);
    this.placeRaw(this.cell(23, y), 'smelter', 1);
    this.placeRaw(this.cell(24, y), 'conveyor', 1);
    this.placeRaw(this.cell(25, y), 'conveyor', 1);
    this.placeRaw(this.cell(26, y), 'storage', 1);
  }

  loadSave(s: SaveState): void {
    this.genWorld();
    this.nextId = 1;
    this.storage = {
      ore: s.storage.ore ?? 0, plate: s.storage.plate ?? 0, science: 0,
      copper_ore: 0, copper_plate: 0, circuit: 0,
    };
    this.pulse = s.pulse ?? 0;
    this.power = { produced: 0, used: 0, deficit: false };
    this.inventory = { ...START_INVENTORY };
    this.unlocked = new Set<string>(START_UNLOCKED);
    this.research = { active: null, progress: 0, completed: new Set() };
    this.upgrades = new Set();
    for (const m of s.modules) this.placeRaw(m.cell, m.type, m.dir);
  }

  private microKey(cell: number, slot: number): number {
    return cell * SLOTS + slot;
  }

  advance(): void {
    for (const p of this.packets) {
      p.prevCell = p.cell;
      p.prevSlot = p.slot;
    }
    for (const m of this.modules.values()) m.busy = false;

    // Occupancy of belt slots; items move one slot/tick and can't overlap, so
    // they pack and back up against whatever is ahead.
    const occ = new Set<number>();
    for (const p of this.packets) occ.add(this.microKey(p.cell, p.slot));

    const removed = new Set<number>();
    const movedThisTick = new Set<number>(); // each item advances at most ONE slot/tick
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of this.packets) {
        if (removed.has(p.id) || movedThisTick.has(p.id)) continue;
        const mod = this.modules.get(p.cell);
        if (!mod || mod.type !== 'conveyor') continue;
        const here = this.microKey(p.cell, p.slot);
        if (p.slot < SLOTS - 1) {
          const next = this.microKey(p.cell, p.slot + 1);
          if (!occ.has(next)) {
            occ.delete(here);
            occ.add(next);
            p.slot++;
            movedThisTick.add(p.id);
            moved = true;
          }
        } else {
          const t = this.neighbor(p.cell, mod.dir);
          if (t < 0) continue;
          const tmod = this.modules.get(t);
          if (!tmod) continue;
          if (tmod.type === 'conveyor') {
            const next = this.microKey(t, 0);
            if (!occ.has(next)) {
              occ.delete(here);
              occ.add(next);
              p.cell = t;
              p.slot = 0;
              movedThisTick.add(p.id);
              moved = true;
            }
          } else if (tmod.recipeId) {
            const recipe = getRecipe(tmod.recipeId);
            if (recipe) {
              const inputSlot = recipe.inputs.find((inp) => inp.item === p.item);
              if (inputSlot) {
                const current = tmod.inBuf.get(p.item) ?? 0;
                if (current < recipe.bufCap) {
                  tmod.inBuf.set(p.item, current + 1);
                  removed.add(p.id);
                  occ.delete(here);
                  moved = true;
                }
              }
            }
          } else if (tmod.type === 'lab') {
            if (p.item === 'science' && (tmod.inBuf.get('science') ?? 0) < LAB_CAP) {
              tmod.inBuf.set('science', (tmod.inBuf.get('science') ?? 0) + 1);
              removed.add(p.id);
              occ.delete(here);
              moved = true;
            }
          } else if (tmod.type === 'storage') {
            this.storage[p.item]++;
            removed.add(p.id);
            occ.delete(here);
            moved = true;
          }
        }
      }
    }
    if (removed.size) this.packets = this.packets.filter((p) => !removed.has(p.id));

    // Upgrade-aware rate locals.
    const minerPeriod = this.upgrades.has('miner_speed') ? 1 : MINER_PERIOD;
    const genPower = this.upgrades.has('gen_output') ? Math.round(GEN_POWER * 1.5) : GEN_POWER;
    const smeltTime = this.upgrades.has('smelter_speed') ? Math.max(1, Math.round(SMELT_TIME / 1.5)) : SMELT_TIME;

    // Power: generators produce; miners (only on ore) and converters draw.
    let produced = 0;
    for (const m of this.modules.values()) if (m.type === 'generator') produced += genPower;
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
        if (omod && omod.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
          wants = true;
          draw = MINER_POWER;
        }
      } else if (m.recipeId) {
        const recipe = getRecipe(m.recipeId);
        if (recipe) {
          const effectiveTime = m.recipeId === 'smelt_iron' ? smeltTime : recipe.time;
          const ready = recipe.inputs.every((inp) => (m.inBuf.get(inp.item) ?? 0) >= inp.amount);
          if (ready && m.progress < effectiveTime) {
            wants = true;
            draw = recipe.power;
          }
        }
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

    // Process machines; emit onto the entry slot of the output belt.
    for (const c of cells) {
      const m = this.modules.get(c)!;
      if (m.type === 'miner') {
        if (m.cooldown > 0) m.cooldown--;
        if (worked.has(c)) {
          const out = this.neighbor(c, m.dir);
          if (out >= 0 && this.modules.get(out)?.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
            const oreKind = this.ore.get(c) ?? 'iron';
            const oreItem: ItemType = oreKind === 'copper' ? 'copper_ore' : 'ore';
            this.packets.push({ id: this.nextId++, item: oreItem, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
            occ.add(this.microKey(out, 0));
            m.cooldown = minerPeriod;
            m.busy = true;
          }
        }
      } else if (m.recipeId) {
        const recipe = getRecipe(m.recipeId);
        if (recipe) {
          const effectiveTime = m.recipeId === 'smelt_iron' ? smeltTime : recipe.time;
          if (worked.has(c)) {
            m.busy = true;
            m.progress++;
            if (m.progress >= effectiveTime) {
              m.progress = 0;
              // Consume all inputs.
              for (const inp of recipe.inputs) {
                const cur = m.inBuf.get(inp.item) ?? 0;
                m.inBuf.set(inp.item, Math.max(0, cur - inp.amount));
              }
              m.outBuf += recipe.outputCount;
            }
          }
          if (m.outBuf > 0) {
            const out = this.neighbor(c, m.dir);
            if (out >= 0 && this.modules.get(out)?.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
              this.packets.push({ id: this.nextId++, item: recipe.output, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
              occ.add(this.microKey(out, 0));
              m.outBuf--;
            }
          }
        }
      } else if (m.type === 'lab') {
        const id = this.research.active;
        const tech = id ? TECHS.find((t) => t.id === id) : undefined;
        if ((m.inBuf.get('science') ?? 0) > 0 && tech && tech.costItem === 'science' && this.research.progress < tech.cost) {
          m.inBuf.set('science', (m.inBuf.get('science') ?? 0) - 1);
          m.busy = true;
          this.research.progress++;
          if (this.research.progress >= tech.cost) this.completeResearch(tech.id);
        }
      }
    }

    this.pulse++;
  }

  /** Continuous tile coordinates of a slot along its belt's direction. */
  private posOf(cell: number, slot: number): [number, number] {
    const col = cell % this.w;
    const row = Math.floor(cell / this.w);
    const d = this.modules.get(cell)?.dir ?? 1;
    const along = (slot + 0.5) / SLOTS - 0.5;
    return [col + 0.5 + DX[d] * along, row + 0.5 + DY[d] * along];
  }

  snapshot(pulseMs: number, paused: boolean): Snapshot {
    const smeltTime = this.upgrades.has('smelter_speed') ? Math.max(1, Math.round(SMELT_TIME / 1.5)) : SMELT_TIME;
    return {
      w: this.w,
      h: this.h,
      pulse: this.pulse,
      pulseMs,
      paused,
      modules: [...this.modules.entries()].map(([cell, m]) => {
        const v: ModuleView = { cell, type: m.type, dir: m.dir };
        if (m.type === 'smelter') {
          const recipe = m.recipeId ? getRecipe(m.recipeId) : undefined;
          const time = m.recipeId === 'smelt_iron' ? smeltTime : (recipe?.time ?? smeltTime);
          v.progress = m.progress / time;
          v.buffer = [...m.inBuf.values()].reduce((a, b) => a + b, 0);
          v.out = m.outBuf;
          v.busy = m.busy;
          v.recipe = m.recipeId;
        } else if (m.type === 'assembler') {
          const recipe = m.recipeId ? getRecipe(m.recipeId) : undefined;
          v.progress = recipe ? m.progress / recipe.time : 0;
          v.buffer = [...m.inBuf.values()].reduce((a, b) => a + b, 0);
          v.out = m.outBuf;
          v.busy = m.busy;
          v.recipe = m.recipeId;
        } else if (m.type === 'lab') {
          v.buffer = [...m.inBuf.values()].reduce((a, b) => a + b, 0);
          v.busy = m.busy;
        } else if (m.type === 'miner') {
          v.busy = m.busy;
        } else if (m.type === 'generator') {
          v.busy = true;
        }
        return v;
      }),
      packets: this.packets.map((p) => {
        const [x, y] = this.posOf(p.cell, p.slot);
        const [px, py] = this.posOf(p.prevCell, p.prevSlot);
        return { id: p.id, item: p.item, x, y, px, py };
      }),
      storage: { ...this.storage },
      power: { ...this.power },
      ore: [...this.ore.keys()],
      oreType: [...this.ore.values()],
      inventory: { ...this.inventory },
      unlocked: [...this.unlocked].filter((k): k is ModuleType =>
        ['miner', 'conveyor', 'smelter', 'storage', 'generator', 'assembler', 'lab'].includes(k),
      ),
      research: { active: this.research.active, progress: this.research.progress, completed: [...this.research.completed] },
    };
  }
}
