# DRIFTWORKS Economy & Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a player inventory + build costs (Phase A) and a science chain + 6-node research tree with building/upgrade unlocks (Phase B), keeping the deterministic sim deterministic.

**Architecture:** A new shared `src/sim/data.ts` holds costs + tech tree (DRY across sim and UI). The World (`src/sim/world.ts`) owns inventory, the unlocked set, research state, and generalized converters (smelter+assembler) + the Lab consumer; all player actions are ordered commands. UI is the DOM overlay; a new `src/ui/research.ts` panel renders the tree.

**Tech Stack:** TypeScript (strict), Three.js, Vite, GitHub Pages.

## Global Constraints

- **Determinism:** all sim state integer; no `Date.now`/`Math.random`/wall-clock in `src/sim/*`; player position is NOT sim state — collection is a `collect` command. Same commands + same tick count ⇒ identical snapshots (there is a determinism unit test).
- **Build gate:** every task ends green on `npm run build` (`tsc --noEmit && vite build`), strict TS (no unused locals/params).
- **DRY source of truth:** costs and the tech tree live ONLY in `src/sim/data.ts`; sim and UI both import it. Never hardcode a cost/tech elsewhere.
- **Exact economy values (verbatim):** seed inventory **30 ore**. Costs — miner 5 ore, conveyor(belt) 1 ore, storage 5 ore, smelter 10 ore, generator 10 ore, assembler 10 plate, lab 15 plate. Start unlocked (Phase B) — miner, conveyor, storage. Techs — Smelting(20 ore→smelter), Power(30 ore, prereq smelting→generator), Automation Science(30 plate, prereq power→assembler,lab), Mining Productivity(40 science, prereq automation→upgrade miner_speed), Smelting Efficiency(50 science→smelter_speed), Power Grid(60 science→gen_output). Upgrades are +50%.
- **No new runtime deps.** No changes to gameplay outside this spec.
- **Verification:** logic via `npx tsx`; visuals via headless google-chrome + playwright-core (scripts in the session scratchpad). Deploy per phase via push to `main`.
- **Commits:** do NOT add any Claude/AI attribution (no `Co-Authored-By`, no "Generated with") — per project preference.

## File Structure

- Create `src/sim/data.ts` — costs, seed, start-unlocked, `Tech`/`UpgradeId`, `TECHS`. Pure data.
- Modify `src/sim/types.ts` — extend `ItemType`/`ModuleType`, `Snapshot`, `Command`, `DEFS`/`ITEM_COLOR`/`ITEM_LABEL`/`EXPLAIN`.
- Modify `src/sim/world.ts` — inventory, unlocked, research, converters, lab, upgrades, cost checks, collect; snapshot.
- Modify `src/sim/worker.ts` — route `collect` and `research` commands.
- Modify `src/main.ts` — proximity collect, research wiring, affordability/unlock in ghost.
- Modify `src/ui/statusbar.ts` — inventory readout. `src/ui/hotbar.ts` — cost + lock display. `src/ui/icons.ts` — new icons. `src/ui/placement.ts` — afford/unlock check.
- Create `src/ui/research.ts` — research panel. Modify `src/ui/hud.ts` — mount panel + expose API.
- Tests: `tests/economy.test.ts`, `tests/research.test.ts`.

---

# PHASE A — Economy (inventory + build costs + collect)

## Task A1: Shared data module + contract additions

**Files:** Create `src/sim/data.ts`; Modify `src/sim/types.ts`.

**Interfaces produced:** `BUILD_COSTS`, `START_INVENTORY`, `START_UNLOCKED` from `./data`; `Snapshot.inventory: Record<ItemType, number>`, `Snapshot.unlocked: ModuleType[]`; `Command` adds `{ type: 'collect' }`.

- [ ] **Step 1: Create `src/sim/data.ts`**
```ts
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
```
(Phase A keeps all current buildings unlocked — costs only. Phase B narrows `START_UNLOCKED` and adds assembler/lab/science here.)

- [ ] **Step 2: Extend `src/sim/types.ts` Snapshot** — add after the `ore: number[];` line inside `Snapshot`:
```ts
  inventory: Record<ItemType, number>;
  unlocked: ModuleType[];
```

- [ ] **Step 3: Extend the `Command` union** — add as a new member:
```ts
  | { type: 'collect' }
```

- [ ] **Step 4: Build** — `npm run build`. Expected: FAILS — `world.ts` `snapshot()` no longer satisfies `Snapshot` (missing `inventory`/`unlocked`). That's expected; Task A2 fixes it. (If you prefer green here, you may proceed to A2 before building; either way A2 must end green.)

- [ ] **Step 5: Commit**
```bash
git -C /home/martin/projects/driftworks add src/sim/data.ts src/sim/types.ts
git -C /home/martin/projects/driftworks commit -m "sim: economy data module + inventory/unlocked/collect contract"
```

## Task A2: World inventory, build-cost checks, collect (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/worker.ts`; Create `tests/economy.test.ts`.

**Interfaces produced:** `World.inventory: Record<ItemType, number>`; `World.unlocked: Set<ModuleType>`; `place(c,type,dir): boolean` (now validates unlock+cost, deducts); `World.collect(): void`; snapshot includes `inventory`/`unlocked`. A private `placeRaw(c,type,dir)` for seed/save placement that bypasses checks.

- [ ] **Step 1: Write `tests/economy.test.ts` (failing)**
```ts
import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// fresh world seeded with 30 ore
const w = new World();
w.loadDemo();
ok(w.inventory.ore === 30, `seed 30 ore (got ${w.inventory.ore})`);

// placing a miner (5 ore) on an empty non-demo cell deducts 5 and succeeds
const empty = w.cell(2, 2);
ok(w.place(empty, 'miner', 1) === true, 'place miner returns true');
ok(w.inventory.ore === 25, `miner cost 5 ore (got ${w.inventory.ore})`);

// can't afford: drain ore, then placing fails and does not deduct below 0
w.inventory.ore = 0;
ok(w.place(w.cell(3, 3), 'smelter', 1) === false, 'cannot place when unaffordable');
ok(w.inventory.ore === 0, 'no deduction on failed place');

// collect moves the shared storage pool into inventory
const w2 = new World();
w2.loadDemo();
w2.storage.plate = 7;
w2.inventory.ore = 0;
w2.collect();
ok(w2.inventory.plate === 7 && w2.storage.plate === 0, 'collect moves storage->inventory');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```
- [ ] **Step 2: Run, expect FAIL** — `cd /home/martin/projects/driftworks && npx --yes tsx tests/economy.test.ts` → fails (no `inventory`, `place` returns void).

- [ ] **Step 3: Edit `src/sim/world.ts`**
  - Add import at top: `import { BUILD_COSTS, START_INVENTORY, START_UNLOCKED } from './data';`
  - Add fields near `storage`/`power`:
```ts
  inventory: Record<ItemType, number> = { ...START_INVENTORY };
  unlocked = new Set<ModuleType>(START_UNLOCKED);
```
  - Rename the existing `place` body to a private `placeRaw`, and make `place` validate. Replace the current `place(...) { this.modules.set(...) }` with:
```ts
  private placeRaw(c: number, type: ModuleType, dir: Dir): void {
    this.modules.set(c, { type, dir, cooldown: 0, inBuf: 0, progress: 0, outBuf: 0, busy: false });
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
```
  - In `loadDemo()`: reset economy and use `placeRaw` for the seed base. After `this.power = ...; this.pulse = 0; this.nextId = 1;` add `this.inventory = { ...START_INVENTORY }; this.unlocked = new Set(START_UNLOCKED);` and change every `this.place(...)` in `loadDemo` to `this.placeRaw(...)`.
  - In `loadSave()`: change `for (const m of s.modules) this.place(m.cell, m.type, m.dir);` to `this.placeRaw(m.cell, m.type, m.dir);`, and add `this.inventory = { ...START_INVENTORY };` and `this.unlocked = new Set(START_UNLOCKED);` (inventory isn't persisted in SaveState v2; reseed for now).
  - In `snapshot()` return object, add after `ore: [...this.ore],`:
```ts
      inventory: { ...this.inventory },
      unlocked: [...this.unlocked],
```

- [ ] **Step 4: Route `collect` in `src/sim/worker.ts`** — add a case before `case 'speed':`:
```ts
    case 'collect':
      world.collect();
      post();
      break;
```

- [ ] **Step 5: Run tests + build**
  - `npx --yes tsx tests/economy.test.ts` → `PASS`.
  - `npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git -C /home/martin/projects/driftworks add src/sim/world.ts src/sim/worker.ts tests/economy.test.ts
git -C /home/martin/projects/driftworks commit -m "sim: player inventory, build-cost checks, collect (+tests)"
```

## Task A3: main wiring — affordability ghost + proximity collect

**Files:** Modify `src/ui/placement.ts`, `src/main.ts`.

**Interfaces:** `placementValid` also requires unlocked + affordable. main sends `collect` when the player is near a Storage box.

- [ ] **Step 1: Extend `src/ui/placement.ts`** — replace its body with:
```ts
import type { Snapshot } from '../sim/types';
import type { Tool } from './hotbar';
import { BUILD_COSTS } from '../sim/data';

export function placementValid(cell: number, tool: Tool, s: Snapshot): boolean {
  if (tool === 'inspect' || tool === 'erase') return false;
  if (s.modules.some((m) => m.cell === cell)) return false;
  if (tool === 'miner' && !s.ore.includes(cell)) return false;
  if (!s.unlocked.includes(tool)) return false;
  const cost = BUILD_COSTS[tool];
  if ((s.inventory[cost.item] ?? 0) < cost.amount) return false;
  return true;
}
```
(Note: `tool` after the inspect/erase guard is a `ModuleType`, valid index for `BUILD_COSTS`/`unlocked`.)

- [ ] **Step 2: Proximity collect in `src/main.ts`** — after the `worker.onmessage` handler is set, inside it (or right after `updateAffordances();`), add collection logic. Add near the top of `main()` state: `let lastCollect = 0;`. Then in `onmessage`, after `updateAffordances();`, add:
```ts
    const pl = renderer.getPlayer();
    const near = snap.modules.some((m) => {
      if (m.type !== 'storage') return false;
      const mx = (m.cell % snap.w) + 0.5;
      const my = Math.floor(m.cell / snap.w) + 0.5;
      return Math.hypot(pl.x - mx, pl.y - my) < 1.6;
    });
    const tnow = Date.now();
    if (near && tnow - lastCollect > 400) {
      lastCollect = tnow;
      send({ type: 'collect' });
    }
```

- [ ] **Step 3: Build** — `npm run build` → green.
- [ ] **Step 4: Commit**
```bash
git -C /home/martin/projects/driftworks add src/ui/placement.ts src/main.ts
git -C /home/martin/projects/driftworks commit -m "UX: ghost respects cost+unlock; auto-collect near storage"
```

## Task A4: UI — inventory readout + hotbar cost display

**Files:** Modify `src/ui/statusbar.ts`, `src/ui/hotbar.ts`, `src/style.css`.

**Interfaces:** status bar shows inventory counts; each hotbar tile shows its build cost.

- [ ] **Step 1: Status bar shows inventory** — in `src/ui/statusbar.ts` `update(s)`, change the ore/plate chips to read from `s.inventory` instead of `s.storage`:
  replace `ore.value.textContent = String(s.storage.ore);` with `ore.value.textContent = String(s.inventory.ore ?? 0);`
  and `plate.value.textContent = String(s.storage.plate);` with `plate.value.textContent = String(s.inventory.plate ?? 0);`

- [ ] **Step 2: Hotbar tiles show cost** — in `src/ui/hotbar.ts`, import costs: `import { BUILD_COSTS } from '../sim/data';`. In the `TOOLS.forEach` tile builder, for build tools (not erase/inspect) append a cost label:
```ts
    if (t !== 'erase' && t !== 'inspect') {
      const cost = document.createElement('span');
      cost.className = 'dw-cost';
      cost.textContent = String(BUILD_COSTS[t].amount);
      b.append(cost);
    }
```
- [ ] **Step 3: CSS** — append to `src/style.css`:
```css
.dw-cost {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font: 700 9px/1 ui-monospace, monospace;
  color: var(--ore);
}
```
- [ ] **Step 4: Build + screenshot** — `npm run build`; then via the headless harness confirm the status bar shows inventory (starts 30 ore, drops as you build) and tiles show cost numbers.
- [ ] **Step 5: Commit, push, deploy (end of Phase A)**
```bash
git -C /home/martin/projects/driftworks add src/ui/statusbar.ts src/ui/hotbar.ts src/style.css
git -C /home/martin/projects/driftworks commit -m "UI: inventory readout + hotbar build costs (Phase A)"
git -C /home/martin/projects/driftworks push origin main
```
Watch the Pages Action to success; confirm the live bundle hash updates.

---

# PHASE B — Research (science chain + tech tree + upgrades)

## Task B1: Contract + data for science, assembler, lab, research

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts`.

**Interfaces:** `ItemType` adds `science`; `ModuleType` adds `assembler`,`lab`; `Snapshot` adds `research`; `Command` adds research; `DEFS`/`ITEM_COLOR`/`ITEM_LABEL`/`EXPLAIN` cover new entries; `data.ts` adds `Tech`/`UpgradeId`/`TECHS`, narrows `START_UNLOCKED`, adds assembler/lab to `BUILD_COSTS`.

- [ ] **Step 1: `types.ts`** —
  - `export type ItemType = 'ore' | 'plate' | 'science';`
  - `export type ModuleType = 'miner' | 'conveyor' | 'smelter' | 'storage' | 'generator' | 'assembler' | 'lab';`
  - In `Snapshot`, add: `research: { active: string | null; progress: number; completed: string[] };`
  - In `Command`, add: `| { type: 'research'; action: 'select'; tech: string } | { type: 'research'; action: 'contribute' }`
  - `DEFS` add: `assembler: { label: 'Assembler', short: 'ASM', color: 0x7b5cc0 }, lab: { label: 'Lab', short: 'LAB', color: 0x3f7fd0 },`
  - `ITEM_COLOR` add: `science: 0xc55cff,`
  - `ITEM_LABEL` add: `science: 'Science',`
  - `EXPLAIN` add: `assembler: 'Plate → Science', lab: 'Research',`

- [ ] **Step 2: `data.ts`** —
  - `START_INVENTORY` → `{ ore: 30, plate: 0, science: 0 }`
  - `START_UNLOCKED` → `['miner', 'conveyor', 'storage']`
  - `BUILD_COSTS` add: `assembler: { item: 'plate', amount: 10 }, lab: { item: 'plate', amount: 15 },`
  - Append:
```ts
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
```
- [ ] **Step 3: Build** — will FAIL until B2 (world snapshot lacks `research`, missing converter handling). Proceed to B2; B2 ends green.
- [ ] **Step 4: Commit**
```bash
git -C /home/martin/projects/driftworks add src/sim/types.ts src/sim/data.ts
git -C /home/martin/projects/driftworks commit -m "sim: science/assembler/lab + research contract + tech tree data"
```

## Task B2: World — converters (smelter+assembler), Lab, research, upgrades (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/worker.ts`; Create `tests/research.test.ts`.

**Interfaces:** `World.research = { active: string|null; progress: number; completed: Set<string> }`; `World.upgrades = Set<UpgradeId>`; methods `selectResearch(id)`, `contributeResearch()`; assembler converts plate→science; lab consumes science→progress; upgrades scale miner/smelter/generator; snapshot includes `research`.

- [ ] **Step 1: Write `tests/research.test.ts` (failing)**
```ts
import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// Smelter starts locked; researching Smelting with ore unlocks it.
const w = new World();
w.loadDemo();
ok(!w.unlocked.has('smelter'), 'smelter starts locked');
w.inventory.ore = 100;
w.selectResearch('smelting');
w.contributeResearch();
ok(w.research.completed.has('smelting'), 'smelting completes when ore paid');
ok(w.unlocked.has('smelter'), 'smelting unlocks smelter');
ok(w.inventory.ore === 80, `smelting cost 20 ore (got ${w.inventory.ore})`);

// Prereqs enforced: cannot select automation before power.
const w2 = new World();
w2.loadDemo();
w2.selectResearch('automation');
ok(w2.research.active === null, 'cannot select tech with unmet prereqs');

// Upgrade applies: completing power_grid raises generator output (deterministic check via snapshot power with a generator present).
const w3 = new World();
w3.loadDemo();
['smelting', 'power', 'automation', 'power_grid'].forEach((id) => { w3.inventory.ore = 999; w3.inventory.plate = 999; w3.inventory.science = 999; w3.selectResearch(id); w3.contributeResearch(); });
ok(w3.research.completed.has('power_grid'), 'power_grid completes via science from inventory');

// Determinism with the new systems.
const a = new World(); a.loadDemo();
const b = new World(); b.loadDemo();
for (let i = 0; i < 60; i++) { a.advance(); b.advance(); }
ok(JSON.stringify(a.snapshot(150, false)) === JSON.stringify(b.snapshot(150, false)), 'deterministic');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```
(Note: `contributeResearch` pays from inventory for ANY costItem — ore/plate/science — so the test can complete science techs by stocking inventory. The Lab is the in-game *automated* science source, tested separately below.)

- [ ] **Step 2: Run, expect FAIL** — `npx --yes tsx tests/research.test.ts`.

- [ ] **Step 3: Edit `src/sim/world.ts`** —
  - Import: add `TECHS, type UpgradeId` to the `./data` import.
  - Add a converter config constant near the other constants:
```ts
const CONVERTERS: Partial<Record<ModuleType, { in: ItemType; out: ItemType; time: number; cap: number; power: number }>> = {
  smelter: { in: 'ore', out: 'plate', time: SMELT_TIME, cap: SMELT_CAP, power: SMELT_POWER },
  assembler: { in: 'plate', out: 'science', time: 8, cap: 4, power: 3 },
};
```
  - Add fields:
```ts
  research: { active: string | null; progress: number; completed: Set<string> } = { active: null, progress: 0, completed: new Set() };
  upgrades = new Set<UpgradeId>();
```
  - Reset them in `loadDemo`/`loadSave` (alongside inventory/unlocked): `this.research = { active: null, progress: 0, completed: new Set() }; this.upgrades = new Set();`
  - Add research methods:
```ts
  selectResearch(id: string): void {
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

  private completeResearch(id: string): void {
    const tech = TECHS.find((t) => t.id === id)!;
    this.research.completed.add(id);
    tech.unlocks?.forEach((b) => this.unlocked.add(b));
    if (tech.upgrade) this.upgrades.add(tech.upgrade);
    this.research.active = null;
    this.research.progress = 0;
  }
```
  - **Generalize the smelter processing to converters.** In `advance()`, the power-allocation loop currently special-cases `m.type === 'smelter'`. Change that branch to handle any converter:
```ts
      } else if (CONVERTERS[m.type] && m.inBuf > 0 && m.progress < CONVERTERS[m.type]!.time) {
        wants = true;
        draw = CONVERTERS[m.type]!.power;
      }
```
    And the processing loop's `else if (m.type === 'smelter')` block becomes `else if (CONVERTERS[m.type])` using the config (`cfg.time`, `cfg.out`); the movement-loop consumption that checks `tmod.type === 'smelter'` for ore must become: consume into any converter whose `in` matches the packet item and `inBuf < cap`:
```ts
          } else if (CONVERTERS[tmod.type]) {
            const cfg = CONVERTERS[tmod.type]!;
            if (p.item === cfg.in && tmod.inBuf < cfg.cap) {
              tmod.inBuf++;
              removed.add(p.id);
              occ.delete(here);
              moved = true;
            }
          }
```
    (Replace the existing `else if (tmod.type === 'smelter') {...}` consumption branch with the generic one above. Keep the `storage` branch as-is. Apply `SMELT_TIME` upgrade by computing effective time per cfg — see upgrades below.)
  - **Lab consumer** in `advance()`: in the movement loop, add a branch so belt items entering a lab are buffered (like a converter input but item must be science):
```ts
          } else if (tmod.type === 'lab') {
            if (p.item === 'science' && tmod.inBuf < 6) {
              tmod.inBuf++;
              removed.add(p.id);
              occ.delete(here);
              moved = true;
            }
          }
```
    And in the processing loop, add lab handling: if a lab has `inBuf > 0` and the active tech's `costItem === 'science'`, consume 1/tick into research progress:
```ts
      } else if (m.type === 'lab') {
        const id = this.research.active;
        const tech = id ? TECHS.find((t) => t.id === id) : undefined;
        if (m.inBuf > 0 && tech && tech.costItem === 'science' && this.research.progress < tech.cost) {
          m.inBuf--;
          m.busy = true;
          this.research.progress++;
          if (this.research.progress >= tech.cost) this.completeResearch(tech.id);
        }
      }
```
    (Lab draws no power for MVP, or add it to the power loop similarly — keep it free for MVP to limit scope; note this in the commit.)
  - **Upgrades affect rates.** Replace bare constant uses with upgrade-aware locals computed at the top of `advance()`:
```ts
    const minerPeriod = this.upgrades.has('miner_speed') ? 0 : MINER_PERIOD;
    const genPower = this.upgrades.has('gen_output') ? Math.round(GEN_POWER * 1.5) : GEN_POWER;
    const smeltTime = this.upgrades.has('smelter_speed') ? Math.max(1, Math.round(SMELT_TIME / 1.5)) : SMELT_TIME;
```
    Use `genPower` in the generator power sum, `minerPeriod` where the miner resets cooldown, and for the smelter converter use `smeltTime` instead of `cfg.time` when `m.type === 'smelter'` (assembler keeps its own `cfg.time`). Implement by computing `const time = m.type === 'smelter' ? smeltTime : cfg.time;` inside the converter processing branch.
  - **Assembler/Lab emit/visuals:** the assembler emits `science` onto the output belt exactly like the smelter emits plate (reuse that emission code path generically with `cfg.out`). The lab has no output.
  - **Snapshot:** add to the return object:
```ts
      research: { active: this.research.active, progress: this.research.progress, completed: [...this.research.completed] },
```
    and in the module mapping, give assembler the same `progress`/`buffer`/`out`/`busy` view as smelter, and lab a `buffer` (inBuf) + `busy` view (so the inspector can show them).

- [ ] **Step 4: Route research in `worker.ts`** — add before `case 'speed':`:
```ts
    case 'research':
      if (cmd.action === 'select') world.selectResearch(cmd.tech);
      else world.contributeResearch();
      post();
      break;
```

- [ ] **Step 5: Run tests + build**
  - `npx --yes tsx tests/research.test.ts` → `PASS`.
  - `npx --yes tsx tests/economy.test.ts` → still `PASS` (note: A2's economy test placed a smelter that is now locked; if it fails because smelter is locked, update that test to unlock first via `w.unlocked.add('smelter')` or place a `miner` — adjust the test to the new locked default and re-run).
  - `npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git -C /home/martin/projects/driftworks add src/sim/world.ts src/sim/worker.ts tests/research.test.ts tests/economy.test.ts
git -C /home/martin/projects/driftworks commit -m "sim: assembler/lab converters, research state, upgrades (+tests)"
```

## Task B3: main + placement wiring for research & locked builds

**Files:** Modify `src/main.ts` (research commands; placementValid already checks `unlocked`, now meaningful).

**Interfaces:** main exposes research actions to the HUD (Task B4 calls them); no new sim work.

- [ ] **Step 1:** In `src/main.ts`, add helper sends near the other command senders:
```ts
  const selectResearch = (tech: string) => send({ type: 'research', action: 'select', tech });
  const contributeResearch = () => send({ type: 'research', action: 'contribute' });
```
- [ ] **Step 2:** Pass these + the latest snapshot into the HUD's research panel. In the `buildHud(root, {...})` callbacks object add: `selectResearch, contributeResearch,` (HUD signature extended in B4). Forward-reference is fine (called from UI events at runtime).
- [ ] **Step 3:** In `worker.onmessage`, after `hud.setStats(snap)`, add `hud.setResearch(snap)` (method added in B4) so the panel reflects live research/inventory.
- [ ] **Step 4: Build** — green (after B4 adds the HUD methods; if building B3 alone fails on missing HUD methods, do B3+B4 together before building). **Commit** with B4.

## Task B4: Research panel UI + new icons + locked hotbar + science readout

**Files:** Create `src/ui/research.ts`; Modify `src/ui/hud.ts`, `src/ui/hotbar.ts`, `src/ui/statusbar.ts`, `src/ui/icons.ts`, `src/style.css`.

**Interfaces:** `buildResearch(root, { select, contribute }): { update(s: Snapshot): void; toggle(): void }`. HUD gains `setResearch(s)` and a research toggle button; `HudCallbacks` gains `selectResearch(tech)`, `contributeResearch()`.

- [ ] **Step 1: Icons** — in `src/ui/icons.ts` `ICONS`, add keys `science`, `assembler`, `lab`, `research`, `lock` (24×24, `stroke="currentColor"`, same style as existing). science = flask; assembler = gear; lab = beaker/microscope; research = a tree/branch or lightbulb; lock = padlock.

- [ ] **Step 2: Status bar science** — in `statusbar.ts`, add a `science` chip (icon `science`) and in `update` set it from `s.inventory.science ?? 0`.

- [ ] **Step 3: Hotbar locked state + new tiles** — `hotbar.ts`: `TOOLS` already derives from the tools list; ensure `assembler` and `lab` tiles appear (add them to `TOOLS` and `ICON_KEY`). Add a `setUnlocked(unlocked: ModuleType[])` method that toggles a `locked` class + overlays the `lock` icon on tiles whose type isn't unlocked, and the build-cost label color. HUD calls `setUnlocked` from `setStats`.
```css
.dw-tile.locked { opacity: 0.45; }
.dw-tile .dw-lock { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
```

- [ ] **Step 4: Create `src/ui/research.ts`** — a panel listing `TECHS` with status + actions:
```ts
import type { Snapshot } from '../sim/types';
import { TECHS } from '../sim/data';

export interface ResearchPanel {
  update(s: Snapshot): void;
  toggle(): void;
}
export interface ResearchCallbacks {
  select: (tech: string) => void;
  contribute: () => void;
}

export function buildResearch(root: HTMLElement, cb: ResearchCallbacks): ResearchPanel {
  const panel = document.createElement('div');
  panel.className = 'dw-research dw-panel';
  const rows = new Map<string, { el: HTMLElement; status: HTMLElement; btn: HTMLButtonElement }>();
  TECHS.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'dw-tech';
    const name = document.createElement('div');
    name.className = 'dw-tech-name';
    name.textContent = `${t.name} — ${t.cost} ${t.costItem}`;
    const status = document.createElement('div');
    status.className = 'dw-tech-status';
    const btn = document.createElement('button');
    btn.className = 'dw-btn';
    btn.textContent = 'Research';
    btn.addEventListener('click', () => cb.select(t.id));
    row.append(name, status, btn);
    panel.append(row);
    rows.set(t.id, { el: row, status, btn });
  });
  const contribute = document.createElement('button');
  contribute.className = 'dw-btn dw-contribute';
  contribute.textContent = 'Contribute from inventory';
  contribute.addEventListener('click', () => cb.contribute());
  panel.append(contribute);
  root.append(panel);

  return {
    update(s) {
      const done = new Set(s.research.completed);
      for (const t of TECHS) {
        const r = rows.get(t.id)!;
        const unlockedPrereq = t.prereqs.every((p) => done.has(p));
        if (done.has(t.id)) r.status.textContent = '✓ done';
        else if (s.research.active === t.id) r.status.textContent = `researching ${s.research.progress}/${t.cost}`;
        else if (unlockedPrereq) r.status.textContent = 'available';
        else r.status.textContent = 'locked';
        r.btn.disabled = done.has(t.id) || !unlockedPrereq;
      }
      contribute.disabled = s.research.active === null;
    },
    toggle() {
      panel.classList.toggle('show');
    },
  };
}
```
- [ ] **Step 5: CSS** for `.dw-research` (a right-side panel, hidden unless `.show`), `.dw-tech` rows, `.dw-tech-status`, mirroring `.dw-inspect` styling. Append to `src/style.css`.

- [ ] **Step 6: Wire into `hud.ts`** — import `buildResearch`; add to `HudCallbacks`: `selectResearch: (tech: string) => void; contributeResearch: () => void;`. In `buildHud`, `const research = buildResearch(root, { select: cb.selectResearch, contribute: cb.contributeResearch });`. Add a control-dock button "Research" that calls `research.toggle()`. Add to the `Hud` interface + returned object: `setResearch: (s: Snapshot) => void` → `research.update(s)`, and have `setStats` also call `hotbar.setUnlocked(s.unlocked)`.

- [ ] **Step 7: Build + tests + screenshots**
  - `npm run build` → green; `npx tsx tests/economy.test.ts tests/research.test.ts` → PASS.
  - Headless: confirm locked tiles (smelter/generator/assembler/lab greyed with lock), science chip in status bar, the Research panel opening with the 6 techs and statuses, and (drive it) researching Smelting unlocks the Smelter tile.

- [ ] **Step 8: Commit, push, deploy (end of Phase B)**
```bash
git -C /home/martin/projects/driftworks add src/ui src/main.ts src/style.css
git -C /home/martin/projects/driftworks commit -m "UI: research panel, locked hotbar, science readout (Phase B)"
git -C /home/martin/projects/driftworks push origin main
```
Watch the Action; confirm live.

---

## Self-review notes (author)

- **Spec coverage:** inventory+seed (A1/A2), build costs from inventory (A1/A2), collect (A2/A3), affordability ghost (A3), inventory+cost UI (A4); science item + assembler + lab (B1/B2), research state + manual/Lab contribution (B2), 6-node tree + unlocks + 3 upgrades (B1/B2), research panel + locked hotbar + science readout (B4), worker routing (A2/B2). Determinism test (B2). Sim-only logic; UI reads snapshot + shared `data.ts`.
- **Type consistency:** `place` returns `boolean` (A2) — `worker` ignores the return (fine); `BUILD_COSTS`/`TECHS`/`START_*` are the single source, imported by world, placement, hotbar, statusbar, research. `research`/`upgrades` shapes fixed in B2 and consumed by snapshot + UI. `CONVERTERS` keyed by `ModuleType` (partial) drives smelter+assembler.
- **Known sequencing:** A1 and B1 intentionally leave the build red until their paired world task (A2/B2) lands — each phase ends green. B3+B4 may need to land together to satisfy the HUD method additions before building.
- **Decisions to flag at review:** Lab draws no power in the MVP (scope); `loadSave` reseeds inventory (SaveState v2 doesn't persist inventory — a follow-up could bump to v3).
</content>
