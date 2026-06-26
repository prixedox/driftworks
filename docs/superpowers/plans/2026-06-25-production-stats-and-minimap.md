# DRIFTWORKS — Production Statistics Panel + Minimap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (A) **per-item produced/consumed rate counters** tracked deterministically in the sim and surfaced in a togglable **Stats panel**, and (B) a **corner Minimap canvas** drawn from the snapshot — ore deposits, machines by type colour, and the player dot — updating each pulse.

**Architecture:** The sim (`world.ts`) accumulates integer rate counters in a fixed-length ring of **tick buckets** (one bucket per tick, a rolling window). `snapshot()` squashes the window into `rates: Record<ItemType, { produced: number; consumed: number }>` totals. On the main thread, `main.ts` feeds each snapshot into a short ring buffer (64 entries) kept client-side for sparkline drawing. The Stats panel (`src/ui/stats.ts`) reads the snapshot and the ring buffer; the minimap (`src/ui/minimap.ts`) reads only the snapshot and `renderer.getPlayer()`. Neither panel holds game logic. A new test file (`tests/stats.test.ts`) validates the counters against a known advance sequence.

**Tech stack:** TypeScript (strict) · Vite 5 · DOM/CSS overlay (no Three.js in UI files) · plain `<canvas>` for the minimap and sparklines · Web Worker sim stays unchanged except for `world.ts` + `types.ts`.

---

## Global Constraints

- **Determinism:** all new sim state (rate counters, bucket ring) is integer; no `Date.now`/`Math.random`/wall-clock in `src/sim/*`; iterate order-stably (cells sorted). Same commands + same tick count ⇒ identical snapshots (the existing determinism test must keep passing).
- **UI reads Snapshots only.** The Stats panel and minimap are presentation-only. `main.ts` may keep a client-side ring buffer (wall-clock-driven, for sparklines) but game logic stays in the sim.
- **Theme tokens.** New DOM elements use `var(--accent)`, `var(--panel)`, `var(--muted)`, etc. from `src/ui/theme.css`. No hardcoded hex colours in UI files.
- **Build gate.** `npm run build` (`tsc --noEmit && vite build`) must end green after each task. Strict TS — no unused locals/params.
- **No new runtime deps.** Plain canvas API only; no charting library.
- **No AI attribution in commits.** Never add `Co-Authored-By` or "Generated with" lines.
- **Verification.** Logic via `npx tsx tests/stats.test.ts`; visuals via headless `google-chrome` driven by `playwright-core` (scripts in the session scratchpad).

---

## File Structure

- **Modify** `src/sim/types.ts` — extend `Snapshot` with `rates`.
- **Modify** `src/sim/world.ts` — add the rate-counter ring; instrument `advance()` at the three emit/consume points; expose totals in `snapshot()`.
- **Modify** `src/ui/hud.ts` — mount `statsPanel` and `minimap`; add `statsToggle` button to the control dock; expose `setStats` + minimap update.
- **Modify** `src/ui/hotbar.ts` — add `statsToggle` callback to `HotbarCallbacks` and a **Stats** button to the dock.
- **Modify** `src/main.ts` — maintain a client-side snapshot ring buffer; pass it to the stats panel on each pulse; pass `renderer.getPlayer()` to the minimap.
- **Create** `src/ui/stats.ts` — the Stats panel component.
- **Create** `src/ui/minimap.ts` — the corner minimap canvas component.
- **Create** `tests/stats.test.ts` — unit test for rate counters.

---

## Rate-counter design (sim-side)

### Window length and representation

- **Window:** `RATE_WINDOW = 30` ticks (at 150 ms/tick ≈ 4.5 s; at 40 ms/tick ≈ 1.2 s). Small enough to be reactive, large enough to smooth single-tick noise.
- **Storage:** one circular buffer of **bucket objects** per-item. Each bucket records integer `produced` and `consumed` counts for exactly one tick. Index = `this.pulse % RATE_WINDOW`.
- **Items tracked:** `ore`, `plate`, `science` — all three `ItemType` values. The structure is `Record<ItemType, { buckets: Array<{produced: number; consumed: number}> }>`.
- **Snapshot field:** `rates: Record<ItemType, { produced: number; consumed: number }>` — the sum across the whole window (not per-tick; the UI divides by window length to get a per-tick rate, optionally scales to per-minute with `60000 / pulseMs`).
- **Integer guarantee:** bucket values are incremented/decremented by integer counts in `advance()`. The `snapshot()` summary is a plain integer sum. No floats anywhere in `src/sim/`.

### What counts as "produced" vs "consumed"

| Event | Item | +produced | +consumed |
|---|---|---|---|
| Miner emits an ore packet onto belt | ore | +1 | — |
| Converter (smelter/assembler) finishes one conversion cycle (`m.progress >= time`) | input item | — | +1 |
| Converter emits its output onto belt | output item | +1 | — |
| Lab consumes one science flask from its buffer (`m.inBuf--`) | science | — | +1 |
| Storage receives a packet (`this.storage[p.item]++`) | that item | — | (not tracked; storage is a depot, not a consumer) |

**Note:** storage receives do **not** count as consumption — they are a staging depot. Only machine consumption counts. This gives meaningful "how much is your factory actually processing" semantics.

---

# PHASE A — Sim rate counters + Snapshot extension

## Task A1: Extend `Snapshot` contract

**Files:** Modify `src/sim/types.ts`.

**What changes:** Add `rates` to `Snapshot`. This is the only change to `types.ts`.

- [ ] **Step 1:** In `src/sim/types.ts`, after the `research` field in `Snapshot`, add:
```ts
  /**
   * Per-item production/consumption totals over the last RATE_WINDOW ticks.
   * Divide by the snapshot's pulse count (clamped to RATE_WINDOW) to get a
   * per-tick average; multiply by (60000 / pulseMs) for items/min.
   */
  rates: Record<'ore' | 'plate' | 'science', { produced: number; consumed: number }>;
```

- [ ] **Step 2:** `npm run build` — expected FAIL (world.ts snapshot() is missing `rates`). That is expected; Task A2 fixes it. If you prefer to keep the build green, stub `rates` in world.ts snapshot as `{ ore: { produced: 0, consumed: 0 }, plate: { produced: 0, consumed: 0 }, science: { produced: 0, consumed: 0 } }` and replace with the real implementation in A2. Either approach is fine — A2 must end green.

- [ ] **Step 3:** Commit:
```bash
git -C /home/martin/projects/driftworks add src/sim/types.ts
git -C /home/martin/projects/driftworks commit -m "sim: add rates field to Snapshot contract"
```

---

## Task A2: World rate-counter ring + instrumentation

**Files:** Modify `src/sim/world.ts`.

**What changes:** Add `RATE_WINDOW` constant and the bucket ring; clear the current tick's bucket at the start of each `advance()`; increment the right counters at exactly the three event points; squash the ring into the `snapshot()` return value.

- [ ] **Step 1:** Add the constant near the top of `world.ts`, after the existing constants:
```ts
const RATE_WINDOW = 30; // ticks of history for the rolling rate window
```

- [ ] **Step 2:** Add a private type alias and field to `World` (after `upgrades`):
```ts
// Rate counter ring: one bucket per tick, indexed by pulse % RATE_WINDOW.
// Each bucket is zeroed at the start of its tick and accumulated during advance().
private rates: Record<ItemType, { buckets: Array<{ produced: number; consumed: number }> }> = {
  ore:     { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
  plate:   { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
  science: { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
};
```

- [ ] **Step 3:** Reset the ring in `loadDemo()` and `loadSave()` (alongside `research`/`upgrades` resets). Add immediately after the existing `this.upgrades = new Set();` line in each:
```ts
this.rates = {
  ore:     { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
  plate:   { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
  science: { buckets: Array.from({ length: RATE_WINDOW }, () => ({ produced: 0, consumed: 0 })) },
};
```

- [ ] **Step 4:** Add a private helper that returns (and zeros) the current tick's bucket:
```ts
private currentBucket(item: ItemType): { produced: number; consumed: number } {
  const idx = this.pulse % RATE_WINDOW;
  const b = this.rates[item].buckets[idx];
  b.produced = 0;
  b.consumed = 0;
  return b;
}
```
Call this at the **very start** of `advance()`, before any movement/processing, for all three items. Add after the `for (const m of this.modules.values()) m.busy = false;` line:
```ts
// Zero the current-tick buckets. Must happen before any production/consumption.
const bOre     = this.currentBucket('ore');
const bPlate   = this.currentBucket('plate');
const bScience = this.currentBucket('science');
```

- [ ] **Step 5:** Instrument the three production/consumption events. Locate each and add the counter increment on the line immediately after:

  **5a — Miner emits ore** (in the `if (m.type === 'miner')` processing branch, just after `this.packets.push(...)` for ore):
  ```ts
  bOre.produced++;
  ```

  **5b — Converter finishes a cycle** (inside `else if (CONVERTERS[m.type])`, just after `m.inBuf--;` and `m.outBuf++;`). The input item is consumed; the output item is produced. The `cfg = CONVERTERS[m.type]!` is already in scope:
  ```ts
  // input consumed, output produced — record both
  if (cfg.in === 'ore')     bOre.consumed++;
  else if (cfg.in === 'plate')  bPlate.consumed++;
  else if (cfg.in === 'science') bScience.consumed++;

  if (cfg.out === 'ore')    bOre.produced++;
  else if (cfg.out === 'plate') bPlate.produced++;
  else if (cfg.out === 'science') bScience.produced++;
  ```
  (In practice the smelter converts ore→plate and the assembler converts plate→science, but we keep the code generic so future converters are tracked automatically.)

  **5c — Lab consumes science** (inside `else if (m.type === 'lab')`, just after `m.inBuf--;`):
  ```ts
  bScience.consumed++;
  ```

- [ ] **Step 6:** Expose the window summary in `snapshot()`. Add a private helper:
```ts
private rateSnapshot(): Record<ItemType, { produced: number; consumed: number }> {
  const sum = (item: ItemType) => {
    let p = 0, c = 0;
    for (const b of this.rates[item].buckets) { p += b.produced; c += b.consumed; }
    return { produced: p, consumed: c };
  };
  return { ore: sum('ore'), plate: sum('plate'), science: sum('science') };
}
```
In `snapshot()`, add `rates: this.rateSnapshot(),` to the returned object.

- [ ] **Step 7:** Run existing tests + build:
```bash
cd /home/martin/projects/driftworks && npx tsx tests/economy.test.ts && npx tsx tests/research.test.ts && npx tsx tests/placement.test.ts
npm run build
```
All must be green.

- [ ] **Step 8:** Commit:
```bash
git -C /home/martin/projects/driftworks add src/sim/world.ts
git -C /home/martin/projects/driftworks commit -m "sim: rolling rate-counter ring (RATE_WINDOW=30) in advance()"
```

---

## Task A3: Unit test for rate counters

**Files:** Create `tests/stats.test.ts`.

**What tests:**
1. After running the demo world for `RATE_WINDOW + 20` ticks, `ore.produced > 0` (miner is working).
2. After enough ticks for the smelter chain to start flowing, `plate.produced > 0`.
3. The produced rate matches the expected order of magnitude: the demo has one miner at period 2 ticks, so ore should produce roughly 1 per 3 ticks → over 30 ticks ≈ 10 ore produced. We test `> 5` and `< RATE_WINDOW` to be permissive of power/belt variations.
4. Determinism: two identical worlds advanced the same number of ticks produce identical `rates` strings.
5. Window rolls correctly: advance RATE_WINDOW × 2 more ticks of a paused world (no generators → no production) and assert produced drops toward 0 (the old data rotates out). Verify by checking the world with power and without power.

- [ ] **Step 1:** Create `tests/stats.test.ts`:
```ts
import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

// ── Test 1 & 2: demo world produces ore and plate after sufficient ticks ────
const WARM_TICKS = 60; // enough for ore packets to reach smelter and complete
const w = new World();
w.loadDemo();
for (let i = 0; i < WARM_TICKS; i++) w.advance();
const s1 = w.snapshot(150, false);

ok(s1.rates.ore.produced > 0, `ore produced > 0 after ${WARM_TICKS} ticks (got ${s1.rates.ore.produced})`);
ok(s1.rates.plate.produced > 0, `plate produced > 0 after ${WARM_TICKS} ticks (got ${s1.rates.plate.produced})`);

// ── Test 3: order of magnitude ─────────────────────────────────────────────
// Demo: 1 generator (12 power) powers 1 miner (2 power) + 1 smelter (3 power).
// Miner period = 2 ticks (MINER_PERIOD=2, so emits every 3 ticks within RATE_WINDOW=30 ticks → ~10 ore).
// We test a relaxed range to accommodate belt travel delays.
ok(s1.rates.ore.produced > 5,  `ore produced > 5 (got ${s1.rates.ore.produced})`);
ok(s1.rates.ore.produced < 30, `ore produced < 30 / window (got ${s1.rates.ore.produced})`);
ok(s1.rates.ore.consumed > 0,  `ore consumed > 0 (smelter) (got ${s1.rates.ore.consumed})`);

// ── Test 4: determinism ────────────────────────────────────────────────────
const a = new World(); a.loadDemo();
const b = new World(); b.loadDemo();
const TICKS = 90;
for (let i = 0; i < TICKS; i++) { a.advance(); b.advance(); }
const sa = a.snapshot(150, false);
const sb = b.snapshot(150, false);
ok(
  JSON.stringify(sa.rates) === JSON.stringify(sb.rates),
  `rates deterministic after ${TICKS} ticks`
);

// ── Test 5: window rolls — old production rotates out after RATE_WINDOW ticks ─
// Build a world with power and let it warm up, then snapshot the rates.
// Then advance RATE_WINDOW more ticks with the world in a state that has no power
// (remove generator by clearing modules, leaving only non-producing machines).
// After RATE_WINDOW more ticks the window should contain only zero-production ticks.
const w2 = new World();
w2.loadDemo();
for (let i = 0; i < WARM_TICKS; i++) w2.advance();
const ratesBefore = w2.snapshot(150, false).rates.ore.produced;
ok(ratesBefore > 0, `pre-roll: ore produced > 0 (got ${ratesBefore})`);

// Remove all modules to stop all production.
w2.modules.clear();

// Advance exactly RATE_WINDOW ticks (each one zeroes and replaces the old bucket).
const RATE_WINDOW = 30; // mirror the sim constant; update if world.ts changes it
for (let i = 0; i < RATE_WINDOW; i++) w2.advance();
const ratesAfter = w2.snapshot(150, false).rates.ore.produced;
ok(ratesAfter === 0, `post-roll: ore produced === 0 after window rotates (got ${ratesAfter})`);

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2:** Run:
```bash
cd /home/martin/projects/driftworks && npx tsx tests/stats.test.ts
```
Expected: `PASS`. If a value is out of range, trace whether the demo world has its generator+miner+smelter running (check `power.produced` in the snapshot before asserting rates). The constants in the comment (`MINER_PERIOD=2`, `SMELT_TIME=6`) come from `world.ts` — re-verify them against that file before adjusting thresholds.

- [ ] **Step 3:** Commit:
```bash
git -C /home/martin/projects/driftworks add tests/stats.test.ts
git -C /home/martin/projects/driftworks commit -m "tests: rate-counter unit tests (production order of magnitude + determinism + window roll)"
```

---

# PHASE B — Stats Panel UI

## Task B1: `src/ui/stats.ts` — the Stats panel component

**Files:** Create `src/ui/stats.ts`.

**What it does:** A toggleable panel (initially hidden, attached to the HUD root) that shows:
- Per-item produced/min and consumed/min computed from `snapshot.rates` and `snapshot.pulseMs`.
- Current power produced / power used (from `snapshot.power`).
- A tiny **sparkline canvas** per item (drawn from a 64-entry client-side ring buffer of `produced` window totals passed in from `main.ts`).

**Interfaces produced:**
```ts
export interface StatsPanel {
  update(s: Snapshot, history: SparklineHistory): void;
  toggle(): void;
}
// history shape passed from main.ts — one array of up to 64 numbers per item
export type SparklineHistory = Record<'ore' | 'plate' | 'science', number[]>;
```

- [ ] **Step 1:** Create `src/ui/stats.ts` with the full implementation:
```ts
import type { Snapshot } from '../sim/types';
import { svgEl } from './icons';

export type SparklineHistory = Record<'ore' | 'plate' | 'science', number[]>;

export interface StatsPanel {
  update(s: Snapshot, history: SparklineHistory): void;
  toggle(): void;
}

const ITEMS = ['ore', 'plate', 'science'] as const;
const SPARK_W = 80;
const SPARK_H = 24;
// Colour approximations matching ITEM_COLOR in types.ts (CSS hex, used for canvas drawing only)
const ITEM_CANVAS_COLOR: Record<typeof ITEMS[number], string> = {
  ore: '#e8a35a',
  plate: '#8fd0ff',
  science: '#c55cff',
};
const ITEM_LABEL: Record<typeof ITEMS[number], string> = {
  ore: 'Ore',
  plate: 'Plate',
  science: 'Science',
};

export function buildStats(root: HTMLElement): StatsPanel {
  const panel = document.createElement('div');
  panel.className = 'dw-stats dw-panel';

  // Header row
  const header = document.createElement('div');
  header.className = 'dw-stats-header';
  header.textContent = 'Production';
  panel.append(header);

  // Per-item rows
  const rows: Record<typeof ITEMS[number], {
    producedEl: HTMLElement;
    consumedEl: HTMLElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  }> = {} as never;

  for (const item of ITEMS) {
    const row = document.createElement('div');
    row.className = 'dw-stats-row';

    const label = document.createElement('div');
    label.className = 'dw-stats-label';
    label.append(svgEl(item));
    const labelText = document.createElement('span');
    labelText.textContent = ITEM_LABEL[item];
    label.append(labelText);

    const nums = document.createElement('div');
    nums.className = 'dw-stats-nums';

    const producedEl = document.createElement('span');
    producedEl.className = 'dw-stats-produced';
    producedEl.textContent = '0/min';

    const sep = document.createElement('span');
    sep.className = 'dw-stats-sep';
    sep.textContent = '▼';

    const consumedEl = document.createElement('span');
    consumedEl.className = 'dw-stats-consumed';
    consumedEl.textContent = '0/min';

    nums.append(producedEl, sep, consumedEl);

    const canvas = document.createElement('canvas');
    canvas.width = SPARK_W;
    canvas.height = SPARK_H;
    canvas.className = 'dw-sparkline';
    const ctx = canvas.getContext('2d')!;

    row.append(label, nums, canvas);
    panel.append(row);
    rows[item] = { producedEl, consumedEl, canvas, ctx };
  }

  // Power row
  const powerRow = document.createElement('div');
  powerRow.className = 'dw-stats-row dw-stats-power';
  powerRow.append(svgEl('power'));
  const powerText = document.createElement('span');
  powerText.className = 'dw-stats-powertext';
  powerText.textContent = '0 / 0 W';
  powerRow.append(powerText);
  panel.append(powerRow);

  root.append(panel);

  return {
    update(s, history) {
      // Convert window totals to per-minute rates.
      // windowTicks = min(s.pulse, RATE_WINDOW=30); rate/min = (total/windowTicks) * (60000/pulseMs)
      // Use s.pulse clamped to 30 to avoid divide-by-zero in the first window.
      const windowTicks = Math.max(1, Math.min(s.pulse, 30));
      const ticksPerMin = 60000 / Math.max(1, s.pulseMs);
      const toPerMin = (n: number) => Math.round((n / windowTicks) * ticksPerMin);

      for (const item of ITEMS) {
        const r = rows[item];
        r.producedEl.textContent = `+${toPerMin(s.rates[item].produced)}/min`;
        r.consumedEl.textContent = `-${toPerMin(s.rates[item].consumed)}/min`;
        drawSparkline(r.ctx, history[item], ITEM_CANVAS_COLOR[item]);
      }

      const deficitClass = s.power.deficit ? ' deficit' : '';
      powerText.textContent = `${s.power.used} / ${s.power.produced} W${s.power.deficit ? ' ⚠' : ''}`;
      powerRow.className = `dw-stats-row dw-stats-power${deficitClass}`;
    },
    toggle() {
      panel.classList.toggle('show');
    },
  };
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  data: number[],
  color: string
): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length < 2) return;

  const max = Math.max(1, ...data);
  const step = canvas.width / (data.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;

  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = canvas.height - (data[i] / max) * (canvas.height - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Faint fill below the line
  ctx.lineTo((data.length - 1) * step, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2:** Add CSS to `src/style.css`. Append:
```css
/* ── Stats panel ────────────────────────────────────────────────── */
.dw-stats {
  position: fixed;
  top: 56px;
  right: 8px;
  width: 260px;
  display: none;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  z-index: 40;
}
.dw-stats.show { display: flex; }

.dw-stats-header {
  font: 700 11px/1.4 ui-monospace, monospace;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: .06em;
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.dw-stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dw-stats-label {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 68px;
  font: 600 10px/1 ui-monospace, monospace;
  color: var(--muted);
}
.dw-stats-label .dw-icon { width: 14px; height: 14px; flex-shrink: 0; }
.dw-stats-nums {
  display: flex;
  gap: 3px;
  align-items: center;
  font: 600 10px/1 ui-monospace, monospace;
  flex: 1;
}
.dw-stats-produced { color: #6fcf97; }
.dw-stats-consumed { color: #eb5757; }
.dw-stats-sep { color: var(--muted); font-size: 8px; }
.dw-sparkline {
  display: block;
  border-radius: 2px;
  background: color-mix(in srgb, var(--panel) 60%, transparent);
}
.dw-stats-power {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--muted) 20%, transparent);
  font: 600 10px/1 ui-monospace, monospace;
  color: var(--muted);
  gap: 6px;
}
.dw-stats-power .dw-icon { width: 14px; height: 14px; }
.dw-stats-power.deficit .dw-stats-powertext { color: #eb5757; }
```

- [ ] **Step 3:** `npm run build` — green (stats.ts is not yet imported anywhere; TS is fine with orphan files).

- [ ] **Step 4:** Commit:
```bash
git -C /home/martin/projects/driftworks add src/ui/stats.ts src/style.css
git -C /home/martin/projects/driftworks commit -m "ui: stats panel component (production rates + power + sparklines)"
```

---

# PHASE C — Minimap

## Task C1: `src/ui/minimap.ts` — corner minimap canvas

**Files:** Create `src/ui/minimap.ts`.

**What it draws:** A `<canvas>` (144 × 104 px at 1× scale, i.e. 3.6 px/tile for a 40×26 grid) showing:
- **Ore cells** — dim amber dots (one pixel per cell, slightly enlarged to 2×2 for readability).
- **Machines** — one 3×3 block per cell, coloured by `DEFS[type].color` (converted from Three.js 0xRRGGBB to CSS rgb).
- **Player dot** — bright white 3×3 dot, positioned from `getPlayer()` result passed in.
- **Border** — a subtle 1px `var(--accent)` ring drawn after content.

Canvas is redrawn every time `update()` is called (each snapshot). Drawing is cheap: 40×26 = 1040 cells, most empty. No persistent state needed beyond the canvas context.

**Interfaces produced:**
```ts
export interface Minimap {
  update(s: Snapshot, playerX: number, playerY: number): void;
}
```

- [ ] **Step 1:** Create `src/ui/minimap.ts`:
```ts
import type { Snapshot } from '../sim/types';
import { DEFS } from '../sim/types';

const CELL_PX = 3;   // pixels per tile cell
const PAD     = 2;   // padding inside canvas border

export function buildMinimap(root: HTMLElement): { update: (s: Snapshot, px: number, py: number) => void } {
  const wrap = document.createElement('div');
  wrap.className = 'dw-minimap';

  const canvas = document.createElement('canvas');
  // Size is determined at first update() call; set a placeholder until then
  canvas.width  = 40 * CELL_PX + PAD * 2;
  canvas.height = 26 * CELL_PX + PAD * 2;
  wrap.append(canvas);
  root.append(wrap);

  const ctx = canvas.getContext('2d')!;

  return {
    update(s, px, py) {
      const W = s.w * CELL_PX + PAD * 2;
      const H = s.h * CELL_PX + PAD * 2;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W;
        canvas.height = H;
      }

      // Background
      ctx.fillStyle = 'rgba(10,12,14,0.85)';
      ctx.fillRect(0, 0, W, H);

      // Ore cells — dim amber 2×2 blobs
      ctx.fillStyle = 'rgba(200,140,60,0.45)';
      for (const cell of s.ore) {
        const cx = (cell % s.w) * CELL_PX + PAD;
        const cy = Math.floor(cell / s.w) * CELL_PX + PAD;
        ctx.fillRect(cx, cy, 2, 2);
      }

      // Machines — 3×3 blocks, coloured by type
      for (const m of s.modules) {
        const col = hexToRgb(DEFS[m.type].color);
        ctx.fillStyle = `rgba(${col},0.9)`;
        const cx = (m.cell % s.w) * CELL_PX + PAD;
        const cy = Math.floor(m.cell / s.w) * CELL_PX + PAD;
        ctx.fillRect(cx, cy, CELL_PX, CELL_PX);
      }

      // Player dot — bright white 3×3
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      const dotX = Math.round(px * CELL_PX + PAD - 1);
      const dotY = Math.round(py * CELL_PX + PAD - 1);
      ctx.fillRect(dotX, dotY, 3, 3);

      // Border
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    },
  };
}

/** Convert Three.js 0xRRGGBB integer to "r,g,b" string for CSS rgba(). */
function hexToRgb(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8)  & 0xff;
  const b =  hex        & 0xff;
  return `${r},${g},${b}`;
}
```

- [ ] **Step 2:** Add CSS to `src/style.css`. Append:
```css
/* ── Minimap ────────────────────────────────────────────────────── */
.dw-minimap {
  position: fixed;
  bottom: 104px; /* sit above the hotbar */
  right: 8px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.6);
  z-index: 35;
  pointer-events: none; /* transparent to touch/mouse */
}
.dw-minimap canvas { display: block; }
```

- [ ] **Step 3:** `npm run build` — green.

- [ ] **Step 4:** Commit:
```bash
git -C /home/martin/projects/driftworks add src/ui/minimap.ts src/style.css
git -C /home/martin/projects/driftworks commit -m "ui: corner minimap canvas (ore/machines/player, snapshot-driven)"
```

---

# PHASE D — Wiring into HUD, hotbar, and main.ts

## Task D1: Extend `HotbarCallbacks` and add **Stats** button to the dock

**Files:** Modify `src/ui/hotbar.ts`.

**What changes:** Add `statsToggle: () => void` to `HotbarCallbacks`; add a **Stats** button to the control dock.

- [ ] **Step 1:** In `src/ui/hotbar.ts`, extend the `HotbarCallbacks` interface — add after `researchToggle`:
```ts
  statsToggle: () => void;
```

- [ ] **Step 2:** In `buildHotbar`, after `const researchBtn = ctrl('Research', () => cb.researchToggle());` add:
```ts
const statsBtn = ctrl('Stats', () => cb.statsToggle());
```
And add `statsBtn` to `dock.append(...)` — insert it right after `researchBtn`:
```ts
dock.append(dirBtn, viewBtn, pauseBtn, speedBtn, explainBtn, researchBtn, statsBtn, resetBtn);
```

- [ ] **Step 3:** `npm run build` — will FAIL because `buildHud` passes an object to `buildHotbar` that now lacks `statsToggle`. Proceed to D2 immediately; D2+D3 together will end green.

- [ ] **Step 4:** Commit this file change together with D2's changes (see D2 Step 4 for the combined commit).

---

## Task D2: Mount stats panel and minimap in `hud.ts`

**Files:** Modify `src/ui/hud.ts`.

**What changes:** Import `buildStats` and `buildMinimap`; add `statsToggle` to the `HudCallbacks` passed to `buildHotbar`; expose `setStatsHistory` on the `Hud` surface for the sparkline ring buffer; mount the minimap and call its update from `setStats`.

- [ ] **Step 1:** Add imports at the top of `src/ui/hud.ts`:
```ts
import { buildStats, type SparklineHistory } from './stats';
import { buildMinimap } from './minimap';
```

- [ ] **Step 2:** Extend the `Hud` interface — add after `setResearch`:
```ts
  setStatsHistory: (s: import('../sim/types').Snapshot, history: SparklineHistory) => void;
  updateMinimap: (s: import('../sim/types').Snapshot, px: number, py: number) => void;
```

- [ ] **Step 3:** In `buildHud`, construct both components before the hotbar:
```ts
const statsPanel = buildStats(root);
const minimap    = buildMinimap(root);
```

- [ ] **Step 4:** Pass `statsToggle` to `buildHotbar`'s callbacks object:
```ts
statsToggle: () => statsPanel.toggle(),
```
(Add it after `researchToggle: () => research.toggle(),`.)

- [ ] **Step 5:** Return the new surface methods from `buildHud`:
```ts
setStatsHistory: (s, history) => statsPanel.update(s, history),
updateMinimap:   (s, px, py)  => minimap.update(s, px, py),
```

- [ ] **Step 6:** `npm run build` — green.

- [ ] **Step 7:** Commit D1 + D2 together:
```bash
git -C /home/martin/projects/driftworks add src/ui/hotbar.ts src/ui/hud.ts
git -C /home/martin/projects/driftworks commit -m "ui: wire stats panel + minimap into HUD (Stats dock button)"
```

---

## Task D3: `main.ts` — sparkline ring buffer + feed stats panel + minimap

**Files:** Modify `src/main.ts`.

**What changes:** Maintain a `SparklineHistory` (64-entry ring buffer of `snapshot.rates[item].produced` window totals) in `main`'s closure. On each snapshot message, push new values, then call `hud.setStatsHistory(snap, history)` and `hud.updateMinimap(snap, renderer.getPlayer().x, renderer.getPlayer().y)`.

The ring buffer is a plain in-memory object on the main thread. It is NOT game state — it is purely a visualisation aid. Its length is capped client-side; it does not affect the sim.

- [ ] **Step 1:** Add `SparklineHistory` import at the top of `src/main.ts`:
```ts
import type { SparklineHistory } from './ui/stats';
```

- [ ] **Step 2:** Inside `async function main()`, after the existing `let lastCollect = 0;` declaration, add:
```ts
const HISTORY_CAP = 64;
const sparkHistory: SparklineHistory = { ore: [], plate: [], science: [] };

function pushHistory(s: typeof latest): void {
  if (!s) return;
  for (const item of ['ore', 'plate', 'science'] as const) {
    sparkHistory[item].push(s.rates[item].produced);
    if (sparkHistory[item].length > HISTORY_CAP) sparkHistory[item].shift();
  }
}
```

- [ ] **Step 3:** In `worker.onmessage`, after `hud.setResearch(snap);`, add:
```ts
pushHistory(snap);
hud.setStatsHistory(snap, sparkHistory);
const pl = renderer.getPlayer();
hud.updateMinimap(snap, pl.x, pl.y);
```

- [ ] **Step 4:** `npm run build` — green.

- [ ] **Step 5:** Run all tests:
```bash
cd /home/martin/projects/driftworks && npx tsx tests/economy.test.ts && npx tsx tests/research.test.ts && npx tsx tests/placement.test.ts && npx tsx tests/stats.test.ts
```
All must be `PASS`.

- [ ] **Step 6:** Commit:
```bash
git -C /home/martin/projects/driftworks add src/main.ts
git -C /home/martin/projects/driftworks commit -m "main: sparkline ring buffer + feed stats panel + minimap each pulse"
```

---

# PHASE E — Visual verification + deploy

## Task E1: Headless screenshot verification

**Goal:** Confirm the Stats panel opens correctly, displays non-zero rates after warm-up, and the minimap renders ore/machines/player without visual artefacts.

- [ ] **Step 1:** Run `npm run build` — must be green.

- [ ] **Step 2:** Start the preview server in the background:
```bash
cd /home/martin/projects/driftworks && npm run preview -- --port 5174 &
sleep 2
```

- [ ] **Step 3:** Write a Playwright script to the session scratchpad. The script:
  - Navigates to `http://localhost:5174`.
  - Waits 3 s for the sim to warm up (so rates are non-zero).
  - Screenshots the initial state — minimap should be visible in the bottom-right corner.
  - Clicks the **Stats** button in the dock to open the stats panel.
  - Waits 500 ms.
  - Screenshots the stats panel open — assert the page contains at least one `/\d+\/min/` text pattern.
  - Saves screenshots to the session scratchpad.

  Script template (adapt as needed):
  ```ts
  // scratchpad/verify-stats-minimap.mjs
  import { chromium } from 'playwright-core';
  import { writeFileSync } from 'fs';

  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:5174');
  await page.waitForTimeout(3000);

  // Screenshot 1: initial — minimap visible
  await page.screenshot({ path: '/tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad/stats-minimap-initial.png' });

  // Open Stats panel
  const statsBtn = page.getByText('Stats');
  await statsBtn.click();
  await page.waitForTimeout(500);

  // Screenshot 2: stats panel open
  await page.screenshot({ path: '/tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad/stats-minimap-panel.png' });

  // Verify rate text is present in the DOM
  const rateTexts = await page.locator('.dw-stats-produced').allTextContents();
  console.log('Rate texts:', rateTexts);
  const hasNonZero = rateTexts.some(t => /[1-9]\d*\/min/.test(t));
  console.log(hasNonZero ? 'PASS: non-zero rate visible' : 'WARN: all rates show 0/min (factory may not have warmed up)');

  await browser.close();
  ```

- [ ] **Step 4:** Run the script:
```bash
cd /home/martin/projects/driftworks && node /tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad/verify-stats-minimap.mjs
```
Examine the two screenshots. Check:
  - **Minimap** is visible bottom-right; shows amber ore cluster and coloured machine squares; white dot present.
  - **Stats panel** shows three item rows with `/\d+\/min/` values; power row present; sparklines render (may be flat initially if history is short — that is fine; they fill as the ring buffer populates).

- [ ] **Step 5:** Kill the preview server:
```bash
kill %1 2>/dev/null || pkill -f "vite preview" || true
```

- [ ] **Step 6:** If any visual issue is found, fix it in the relevant component (`stats.ts` CSS or `minimap.ts` drawing) and re-run the verification before proceeding to E2.

---

## Task E2: Deploy

- [ ] **Step 1:** Final build + all tests:
```bash
cd /home/martin/projects/driftworks && npm run build && npx tsx tests/economy.test.ts && npx tsx tests/research.test.ts && npx tsx tests/placement.test.ts && npx tsx tests/stats.test.ts
```

- [ ] **Step 2:** Push to `main` to trigger GitHub Actions deploy:
```bash
git -C /home/martin/projects/driftworks push origin main
```

- [ ] **Step 3:** Watch the Pages Action. After it completes (~1–2 min CDN lag), open `https://prixedox.github.io/driftworks/` and confirm:
  - Minimap is present in the bottom-right corner.
  - Clicking **Stats** opens the panel with item rows and sparklines.
  - No console errors.

---

## Self-review notes (author)

**Scope coverage:**
- Sim rate counters — integer, rolling RATE_WINDOW=30, three items, three events (miner emit, converter cycle, lab consume). Determinism preserved.
- Snapshot extension — `rates: Record<ItemType, {produced, consumed}>` summed from the ring.
- Stats panel (`stats.ts`) — per-item produced/min + consumed/min (derived from `pulseMs`), power row, sparkline canvas per item fed from a main-thread ring buffer.
- Minimap (`minimap.ts`) — corner canvas, ore/machines/player, redrawn each snapshot.
- Unit test (`stats.test.ts`) — rate > 0 after warm-up, order of magnitude check, determinism assertion, window-roll assertion.
- Headless visual verification via Playwright screenshots.

**Architecture fidelity:**
- All sim changes are integer-only, determinism-safe (no wall-clock in `src/sim/`).
- `sparkHistory` is main-thread client state (wall-clock-driven), not sim state — correct per the "UI reads Snapshots" rule.
- `DEFS[type].color` used in minimap — single source of truth from `types.ts`, not re-declared.
- Theme tokens (`var(--accent)`, `var(--panel)`, `var(--muted)`) used throughout new CSS; no hardcoded colours in component code.

**Decisions flagged:**
- `RATE_WINDOW = 30` is a constant in `world.ts` (not exported). The test mirrors it locally as `const RATE_WINDOW = 30`. If the constant changes, the test comment must be updated. Consider exporting it from `world.ts` in a future pass.
- Storage receives are intentionally not counted as "consumed" — they are a depot. This gives more useful "factory throughput" semantics (how much is the machine network actually processing) rather than "how much dropped into a box".
- The minimap is always visible (not togglable). If it clutters the UI on small screens, a toggle can be added to the dock as a follow-up (same pattern as Stats).
- Sparkline history is reset on page reload (it lives in the main thread closure). That is fine — it fills up within a few seconds of play.
- `pulseMs` is used for per-min conversion in the stats panel. At very fast speeds (40 ms/tick) rates will be high but accurate.
