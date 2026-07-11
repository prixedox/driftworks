import { DX, DY, ITEM_COLOR, MINIMAP_ORE, MINIMAP_MODULE_ORDER, type Dir, type ItemType, type ModuleType, type OreType, type ModuleView, type SaveState, type Snapshot } from './types';
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

const ERASE_REFUND = 1; // 100% of build cost returned on erase (integer scale; change here to tune)
const UNDO_LIMIT = 32;
const RATE_WINDOW = 30; // ticks of history for the rolling produced/consumed rate window
const ITEM_TYPES = Object.keys(ITEM_COLOR) as ItemType[]; // stable, single source of truth

type UndoEntry =
  | { op: 'place'; cell: number; modType: ModuleType; dir: Dir }
  | { op: 'remove'; cell: number; modType: ModuleType; dir: Dir };

function getRecipe(id: RecipeId | string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** Default recipe ID for a machine type (first matching recipe). */
function defaultRecipe(type: ModuleType): RecipeId | undefined {
  return RECIPES.find((r) => r.machines.includes(type))?.id;
}

/** Fresh rate-counter ring for every item type (all buckets zeroed). */
function makeRateRing(): Record<ItemType, { buckets: { produced: number; consumed: number }[] }> {
  const ring = {} as Record<ItemType, { buckets: { produced: number; consumed: number }[] }>;
  for (const it of ITEM_TYPES) {
    ring[it] = { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) };
  }
  return ring;
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
  private undoLog: UndoEntry[] = [];
  clipboard: { relCol: number; relRow: number; type: ModuleType; dir: Dir }[] = [];
  // Rate-counter ring: one bucket per tick, indexed by pulse % RATE_WINDOW.
  // Each bucket is zeroed at the start of its tick and accumulated during advance().
  private rates: Record<ItemType, { buckets: { produced: number; consumed: number }[] }> = makeRateRing();

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
    this.pushUndo({ op: 'place', cell: c, modType: type, dir });
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
    const m = this.modules.get(c);
    if (m) {
      // Refund ERASE_REFUND fraction of the build cost back to inventory.
      const cost = BUILD_COSTS[m.type];
      const refund = Math.round(cost.amount * ERASE_REFUND);
      this.inventory[cost.item] = (this.inventory[cost.item] ?? 0) + refund;
      this.pushUndo({ op: 'remove', cell: c, modType: m.type, dir: m.dir });
    }
    this.modules.delete(c);
    this.packets = this.packets.filter((p) => p.cell !== c);
  }

  private pushUndo(entry: UndoEntry): void {
    this.undoLog.push(entry);
    if (this.undoLog.length > UNDO_LIMIT) this.undoLog.shift();
  }

  undo(): void {
    const entry = this.undoLog.pop();
    if (!entry) return;
    if (entry.op === 'place') {
      // Reverse a place: remove the module and give back the cost.
      const m = this.modules.get(entry.cell);
      if (m) {
        const cost = BUILD_COSTS[entry.modType];
        this.inventory[cost.item] = (this.inventory[cost.item] ?? 0) + cost.amount;
        this.modules.delete(entry.cell);
        this.packets = this.packets.filter((p) => p.cell !== entry.cell);
      }
    } else {
      // Reverse a remove: restore the module and take back the refund.
      if (!this.modules.has(entry.cell)) {
        const cost = BUILD_COSTS[entry.modType];
        const refund = Math.round(cost.amount * ERASE_REFUND);
        this.inventory[cost.item] = Math.max(0, (this.inventory[cost.item] ?? 0) - refund);
        this.placeRaw(entry.cell, entry.modType, entry.dir);
      }
    }
  }

  copyBlueprint(cells: number[]): void {
    if (cells.length === 0) { this.clipboard = []; return; }
    // Find bounding box
    const cols = cells.map((c) => c % this.w);
    const rows = cells.map((c) => Math.floor(c / this.w));
    const minCol = Math.min(...cols);
    const minRow = Math.min(...rows);
    this.clipboard = [];
    // Iterate cells sorted row-major (ascending row, then col) for stable order
    const sorted = [...cells].sort((a, b) => {
      const ra = Math.floor(a / this.w), rb = Math.floor(b / this.w);
      if (ra !== rb) return ra - rb;
      return (a % this.w) - (b % this.w);
    });
    for (const c of sorted) {
      const m = this.modules.get(c);
      if (!m) continue; // empty cells in the selection are skipped
      this.clipboard.push({
        relCol: (c % this.w) - minCol,
        relRow: Math.floor(c / this.w) - minRow,
        type: m.type,
        dir: m.dir,
      });
    }
  }

  paste(originCell: number): void {
    if (this.clipboard.length === 0) return;
    const originCol = originCell % this.w;
    const originRow = Math.floor(originCell / this.w);
    // Entries already sorted row-major from copyBlueprint; process in that order
    for (const entry of this.clipboard) {
      const col = originCol + entry.relCol;
      const row = originRow + entry.relRow;
      if (col < 0 || row < 0 || col >= this.w || row >= this.h) continue; // out of bounds
      const c = row * this.w + col;
      if (this.modules.has(c)) continue; // occupied — skip
      if (!this.unlocked.has(entry.type)) continue; // locked — skip
      const cost = BUILD_COSTS[entry.type];
      if ((this.inventory[cost.item] ?? 0) < cost.amount) continue; // unaffordable — skip
      this.inventory[cost.item] -= cost.amount;
      this.placeRaw(c, entry.type, entry.dir);
      this.pushUndo({ op: 'place', cell: c, modType: entry.type, dir: entry.dir });
    }
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
    this.undoLog = [];
    this.clipboard = [];
    this.rates = makeRateRing();
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
      ore: s.storage.ore ?? 0,
      plate: s.storage.plate ?? 0,
      science: s.storage.science ?? 0,
      copper_ore: s.storage.copper_ore ?? 0,
      copper_plate: s.storage.copper_plate ?? 0,
      circuit: s.storage.circuit ?? 0,
    };
    this.pulse = s.pulse ?? 0;
    this.power = { produced: 0, used: 0, deficit: false };
    this.inventory = {
      ore: s.inventory.ore ?? START_INVENTORY.ore,
      plate: s.inventory.plate ?? START_INVENTORY.plate,
      science: s.inventory.science ?? START_INVENTORY.science,
      copper_ore: s.inventory.copper_ore ?? START_INVENTORY.copper_ore,
      copper_plate: s.inventory.copper_plate ?? START_INVENTORY.copper_plate,
      circuit: s.inventory.circuit ?? START_INVENTORY.circuit,
    };
    this.unlocked = new Set<string>(s.unlocked.length > 0 ? s.unlocked : START_UNLOCKED);
    this.research = {
      active: s.research.active ?? null,
      progress: s.research.progress ?? 0,
      completed: new Set(s.research.completed ?? []),
    };
    this.upgrades = new Set(s.upgrades ?? []);
    this.undoLog = [];
    this.clipboard = [];
    this.rates = makeRateRing();
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

    // Zero the current-tick rate buckets before any production/consumption.
    const rateIdx = this.pulse % RATE_WINDOW;
    for (const it of ITEM_TYPES) {
      const b = this.rates[it].buckets[rateIdx];
      b.produced = 0;
      b.consumed = 0;
    }
    const bumpProduced = (it: ItemType, n = 1): void => { this.rates[it].buckets[rateIdx].produced += n; };
    const bumpConsumed = (it: ItemType, n = 1): void => { this.rates[it].buckets[rateIdx].consumed += n; };

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
            bumpProduced(oreItem);
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
                bumpConsumed(inp.item, inp.amount);
              }
              m.outBuf += recipe.outputCount;
            }
          }
          if (m.outBuf > 0) {
            const out = this.neighbor(c, m.dir);
            if (out >= 0 && this.modules.get(out)?.type === 'conveyor' && !occ.has(this.microKey(out, 0))) {
              this.packets.push({ id: this.nextId++, item: recipe.output, cell: out, slot: 0, prevCell: out, prevSlot: 0 });
              bumpProduced(recipe.output);
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
          bumpConsumed('science');
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

  /** Sum each item's rate buckets across the whole window. */
  private rateSnapshot(): Record<ItemType, { produced: number; consumed: number }> {
    const out = {} as Record<ItemType, { produced: number; consumed: number }>;
    for (const it of ITEM_TYPES) {
      let p = 0, c = 0;
      for (const b of this.rates[it].buckets) { p += b.produced; c += b.consumed; }
      out[it] = { produced: p, consumed: c };
    }
    return out;
  }

  /** Per-tile minimap category layer (0 empty, ore, or 2+machine). Machines
   *  overwrite ore on shared cells (drawn last). See Snapshot.minimap. */
  private minimapLayer(): Uint8Array {
    const layer = new Uint8Array(this.w * this.h);
    for (const c of this.ore.keys()) layer[c] = MINIMAP_ORE;
    for (const [c, m] of this.modules) layer[c] = 2 + MINIMAP_MODULE_ORDER.indexOf(m.type);
    return layer;
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
      unlockedRecipes: [...this.unlocked].filter((k) => RECIPES.some((r) => r.id === k)),
      research: { active: this.research.active, progress: this.research.progress, completed: [...this.research.completed] },
      upgrades: [...this.upgrades],
      clipboard: this.clipboard.map((e) => ({ ...e })),
      rates: this.rateSnapshot(),
      minimap: this.minimapLayer(),
    };
  }
}
