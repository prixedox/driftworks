# Phase 2 — Tooltips & UI v2 (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans), task-by-task. Parent: `../2026-07-05-driftworks-1.0-master-plan.md`
> (Phase 2) — its **Global Constraints** apply to every task here. Spec:
> `../../specs/2026-07-05-driftworks-1.0-full-game-design.md` §4, §9.1, §9.4.

**Goal:** one tooltip system on every surface, sim-computed "what's blocking this"
diagnostics, structured alerts with beacons, build-menu categories, a research tree graph
with a queue, alt-overlay, pipette, recipe codex with ratio hints, help panel — and Explain
mode removed.

**Branch:** `phase-2-tooltips-ui-v2`.

## Pre-flight reality check (do first; patch this plan if any item drifted)

- [ ] Phase 1 (plans #4–#7) is merged: `src/ui/stats.ts`, `src/ui/minimap.ts`,
  `src/ui/tutorial.ts`, `src/settings.ts`, blueprint tool + `undo` command exist.
- [ ] `Snapshot.rates` exists (plan #5) — inspector I/O rates (Task 2.3) read it.
- [ ] `EXPLAIN` map lives in **`src/sim/types.ts`** (not data.ts); the label sprites it
  drives are built in `renderer.ts` `makeLabel`/`buildModule` and toggled by `setExplain`
  (wired via `toggleExplain` in `hud.ts`/`hotbar.ts`/`main.ts`).
- [ ] `World` fields are as in `world.ts` today: `modules: Map<number, ModuleInst>`,
  `research { active, progress, completed }`, machine processing in `advance()` with the
  `worked` set and `wants`/`draw` logic; `completeResearch(id)` private.
- [ ] `Hud`/`HudCallbacks` in `hud.ts` and `HotbarCallbacks`/`TOOLS` in `hotbar.ts` match
  what Phase 1 left behind (they will have grown; all edits below are additive).

## Contract deltas (copy exactly; master plan is authoritative)

In `src/sim/types.ts`:

```ts
export type Blocked = 'no_power' | 'no_input' | 'output_full' | 'no_recipe' | 'no_deposit';
// ModuleView gains:                blocked?: Blocked;
export interface AlertView {
  id: number;
  kind: 'low_power' | 'storage_full' | 'research_done' | 'raid' | 'ark_stage';
  cell?: number;
  tick: number;
}
// Snapshot gains:                  alerts: AlertView[];
// Snapshot.research gains:         queue: string[];
// Command gains:                   | { type: 'research'; action: 'queue'; tech: string }
// DELETE the EXPLAIN export (Task 2.8).
```

In `src/sim/data.ts` (single source of truth — UI imports these):

```ts
export const MODULE_INFO: Record<ModuleType, { desc: string; hint: string }> = {
  miner:     { desc: 'Extracts ore from the deposit it sits on.', hint: 'Digs ore — place on a deposit' },
  conveyor:  { desc: 'Carries items one way. Drag to lay a line.', hint: 'Carries items' },
  smelter:   { desc: 'Refines ore into plates. Pick the recipe in its inspector.', hint: 'Ore → Plate' },
  storage:   { desc: 'Shared depot. Walk close to collect its contents.', hint: 'Stores output' },
  generator: { desc: 'Produces power for the whole grid.', hint: 'Makes power' },
  assembler: { desc: 'Crafts parts and science from inputs. Recipe-selectable.', hint: 'Crafts items' },
  lab:       { desc: 'Consumes science packs to advance the active research.', hint: 'Researches' },
};
export const ITEM_INFO: Record<ItemType, { desc: string }> = {
  ore:          { desc: 'Raw iron ore. Mine it; smelt into plates.' },
  plate:        { desc: 'Iron plate. The basic building material.' },
  science:      { desc: 'Science pack. Feed labs to research.' },
  copper_ore:   { desc: 'Raw copper ore. Smelt into copper plate.' },
  copper_plate: { desc: 'Copper plate. Wiring and circuits.' },
  circuit:      { desc: 'Circuit board. Advanced machines want these.' },
};
export const BLOCKED_LABEL: Record<Blocked, string> = {
  no_power: 'No power', no_input: 'Waiting for input', output_full: 'Output backed up',
  no_recipe: 'No recipe selected', no_deposit: 'Not on a deposit',
};
export const MODULE_CATEGORY: Record<ModuleType, 'logistics' | 'production' | 'power' | 'military' | 'misc'> = {
  conveyor: 'logistics', storage: 'logistics',
  miner: 'production', smelter: 'production', assembler: 'production', lab: 'production',
  generator: 'power',
};
export const STORAGE_SOFT_CAP = 500;   // total items in the shared depot before the alert
export const RESEARCH_QUEUE_MAX = 5;
```

(`Blocked` is imported into data.ts from types.ts. When later phases add module/item types,
tsc forces these Records to grow — that is intended.)

---

## Task 1 — Sim: `blocked` diagnosis + alerts ring + research queue (TDD)

**Files:** Modify `src/sim/types.ts`, `src/sim/data.ts`, `src/sim/world.ts`,
`src/sim/worker.ts`. Create `tests/blocked.test.ts`.
**Produces:** `ModuleView.blocked`, `Snapshot.alerts`, `Snapshot.research.queue`,
`World.queueResearch(id)`, alert helpers.

- [ ] **Step 1: failing test** — create `tests/blocked.test.ts` (same `ok`/`fails` pattern
  as `tests/blocked` siblings, e.g. `tests/buildux.test.ts`):

```ts
import { World } from '../src/sim/world';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };
const snapOf = (w: World) => w.snapshot(150, false);
const viewAt = (w: World, c: number) => snapOf(w).modules.find((m) => m.cell === c)!;

// no_deposit: miner off ore
const w1 = new World(); w1.loadDemo();
const offOre = w1.cell(2, 2);
w1.placeRawPublic(offOre, 'miner', 1);
w1.advance();
ok(viewAt(w1, offOre).blocked === 'no_deposit', 'miner off ore → no_deposit');

// no_input: powered smelter with empty buffer (demo smelter starves if miner removed)
const w2 = new World(); w2.loadDemo();
w2.remove(w2.cell(20, 13));            // remove demo miner
for (let i = 0; i < 40; i++) w2.advance(); // drain in-flight packets
ok(viewAt(w2, w2.cell(23, 13)).blocked === 'no_input', 'starved smelter → no_input');

// no_power: remove the generator; smelter has input but no budget
const w3 = new World(); w3.loadDemo();
w3.remove(w3.cell(20, 11));
for (let i = 0; i < 12; i++) w3.advance();
const v3 = viewAt(w3, w3.cell(23, 13));
ok(v3.blocked === 'no_power' || v3.blocked === 'no_input',
  `no generator → no_power once input buffered (got ${v3.blocked})`);

// output_full: smelter with outBuf>0 and no belt at its output
const w4 = new World(); w4.loadDemo();
const c4 = w4.cell(5, 5);
w4.placeRawPublic(c4, 'smelter', 0);   // faces north into empty cell? place belt-less
w4.placeRawPublic(w4.cell(5, 3), 'generator', 1);
w4.modules.get(c4)!.inBuf.set('ore', 4);
for (let i = 0; i < 10; i++) w4.advance();
ok(viewAt(w4, c4).blocked === 'output_full', 'smelter with stuck output → output_full');

// alerts: low_power latches once, research_done fires
const w5 = new World(); w5.loadDemo();
w5.placeRawPublic(w5.cell(8, 8), 'smelter', 1);
w5.modules.get(w5.cell(8, 8))!.inBuf.set('ore', 4);
w5.remove(w5.cell(20, 11));            // force deficit
for (let i = 0; i < 20; i++) w5.advance();
const alerts5 = snapOf(w5).alerts;
ok(alerts5.filter((a) => a.kind === 'low_power').length === 1, 'low_power latched (exactly 1)');
w5.inventory.ore = 100;
w5.selectResearch('smelting');
w5.contributeResearch();
w5.advance();
ok(snapOf(w5).alerts.some((a) => a.kind === 'research_done'), 'research_done alert');

// research queue: queue two, first completes → second auto-activates
const w6 = new World(); w6.loadDemo();
w6.inventory.ore = 500;
w6.queueResearch('smelting');
w6.queueResearch('power');
ok(snapOf(w6).research.active === 'smelting', 'queue: first becomes active');
ok(snapOf(w6).research.queue.join(',') === 'power', 'queue: second waits');
w6.contributeResearch();               // completes smelting (20 ore)
ok(snapOf(w6).research.active === 'power', 'queue: auto-advance to power');
ok(snapOf(w6).research.queue.length === 0, 'queue: drained');

// determinism: two identical runs agree (alerts + blocked included in snapshot)
const a = new World(); a.loadDemo();
const b = new World(); b.loadDemo();
a.remove(a.cell(20, 11)); b.remove(b.cell(20, 11));
for (let i = 0; i < 50; i++) { a.advance(); b.advance(); }
ok(JSON.stringify(a.snapshot(150, false)) === JSON.stringify(b.snapshot(150, false)),
  'determinism with alerts/blocked');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2:** `npx tsx tests/blocked.test.ts` → FAIL (no `blocked`, `alerts`,
  `queueResearch`).
- [ ] **Step 3: types + data** — apply the contract deltas above (types.ts unions/fields;
  data.ts tables). Keep `EXPLAIN` for now (removed in Task 8 so the build stays green
  between tasks).
- [ ] **Step 4: world.ts** — implement:
  - Fields: `private alerts: AlertView[] = []; private nextAlertId = 1;
    private lowPowerLatched = false; private storageFullLatched = false;
    researchQueue: string[] = [];` — reset all in `loadDemo()`/`loadSave()`.
  - `private pushAlert(kind: AlertView['kind'], cell?: number): void` — push
    `{ id: this.nextAlertId++, kind, cell, tick: this.pulse }`, cap at 20 (`shift()`).
  - **Blocked computation** in `advance()`: give `ModuleInst` a transient
    `blocked?: Blocked`. In the machine-processing loop set it with this precedence:
    - miner: not on ore → `no_deposit`; else if output cell missing/not-conveyor/entry
      slot occupied → `output_full`; else if wanted work but `!worked.has(c)` →
      `no_power`; else undefined.
    - recipe machines (`m.recipeId`): recipe missing → `no_recipe`; `outBuf > 0` and
      emit failed this tick → `output_full`; else `!ready` (inputs short) → `no_input`;
      else wanted work but not powered → `no_power`.
    - lab: `no_input` when science buffer empty and research active; `no_power` never
      (labs draw no power yet — Phase 6 fixes that; leave a `// TODO Phase 6` comment).
    The `wants`/`worked` information already exists in the power pass — record
    `wantedWork` per cell there (a `Set<number>`), then derive `blocked` in the
    processing pass. Keep iteration over `cells` (sorted) only.
  - **Alerts**: in `advance()` after the power pass — if `power.deficit` and
    `!lowPowerLatched` → `pushAlert('low_power')`, set latch; if not deficit, clear
    latch. In the storage-receive branch (`tmod.type === 'storage'`): after increment, if
    total `Object.values(this.storage).reduce(...) >= STORAGE_SOFT_CAP` and not latched →
    `pushAlert('storage_full', t)`, latch; unlatch when total < cap/2 (checked once per
    tick, not per packet). In `completeResearch()` → `pushAlert('research_done')`.
  - **Queue**: `queueResearch(id)` — validate tech exists, not completed, not active, not
    already queued, queue length < `RESEARCH_QUEUE_MAX`; if nothing active and prereqs
    met, activate immediately instead of queueing (matches test). In `completeResearch()`,
    after unlocks: shift entries until one has all prereqs completed → `selectResearch`
    it (invalid entries are dropped).
  - **Snapshot**: `alerts: this.alerts.map((a) => ({ ...a }))`, `blocked` on each
    ModuleView where set, `queue: [...this.researchQueue]` inside `research`.
- [ ] **Step 5: worker.ts** — extend the `research` case:
  `else if (cmd.action === 'queue') world.queueResearch(cmd.tech);` (keep `contribute`
  as the final else).
- [ ] **Step 6:** `npx tsx tests/blocked.test.ts` → PASS. Run the full suite; **re-baseline
  the golden hash** in `tests/determinism.test.ts` (snapshot shape changed — follow the
  header comment in that file). `npm run build` green.
- [ ] **Step 7:** Commit: `sim: blocked diagnosis, alert ring, research queue (+tests, re-baseline)`.

---

## Task 2 — `src/ui/tooltip.ts` + wire onto existing surfaces

**Files:** Create `src/ui/tooltip.ts`. Modify `src/ui/hotbar.ts`, `src/ui/statusbar.ts`,
`src/style.css`.
**Produces:** `attachTooltip(el, content: () => TooltipContent)`,
`type TooltipContent = { title: string; lines: { icon?: string; text: string }[] }`.

- [ ] **Step 1:** Create `src/ui/tooltip.ts` — one module-level singleton:

```ts
import { svgEl } from './icons';

export interface TooltipContent { title: string; lines: { icon?: string; text: string }[] }

let tipEl: HTMLDivElement | null = null;
let hideTimer: number | null = null;

function ensureEl(): HTMLDivElement {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'dw-tooltip dw-panel';
  tipEl.setAttribute('role', 'tooltip');
  document.body.append(tipEl);
  return tipEl;
}

function show(anchor: HTMLElement, content: TooltipContent): void {
  const el = ensureEl();
  el.innerHTML = '';
  const h = document.createElement('div');
  h.className = 'dw-tip-title';
  h.textContent = content.title;
  el.append(h);
  for (const line of content.lines) {
    const row = document.createElement('div');
    row.className = 'dw-tip-line';
    if (line.icon) row.append(svgEl(line.icon));
    row.append(document.createTextNode(line.text));
    el.append(row);
  }
  el.classList.add('show');
  const r = anchor.getBoundingClientRect();
  const tr = el.getBoundingClientRect();
  let x = r.left + r.width / 2 - tr.width / 2;
  let y = r.top - tr.height - 8;
  if (y < 4) y = r.bottom + 8;                       // flip below
  x = Math.max(4, Math.min(x, window.innerWidth - tr.width - 4));
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

export function hideTooltip(): void { tipEl?.classList.remove('show'); }

/** Hover (300 ms) on pointer devices; long-press (500 ms) on touch. */
export function attachTooltip(el: HTMLElement, content: () => TooltipContent): void {
  let showTimer: number | null = null;
  const cancel = () => { if (showTimer !== null) { clearTimeout(showTimer); showTimer = null; } };
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    showTimer = window.setTimeout(() => show(el, content()), 300);
  });
  el.addEventListener('pointerleave', () => { cancel(); hideTooltip(); });
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    showTimer = window.setTimeout(() => show(el, content()), 500);
  });
  el.addEventListener('pointerup', () => { cancel(); if (hideTimer) clearTimeout(hideTimer); hideTimer = window.setTimeout(hideTooltip, 1200); });
  el.addEventListener('pointercancel', () => { cancel(); hideTooltip(); });
}
```

- [ ] **Step 2: CSS** (append to `src/style.css`; theme tokens only): `.dw-tooltip`
  fixed, top-left origin (`left:0; top:0`, positioned via transform), `z-index: 60`,
  `max-width: 260px`, `pointer-events: none`, hidden until `.show`; `.dw-tip-title`
  accent-colored bold; `.dw-tip-line` small muted rows with 14px icons.
- [ ] **Step 3: wire hotbar** — in `hotbar.ts` `TOOLS.forEach`, after building each tile:
  `attachTooltip(b, () => toolTip(t))` where `toolTip` builds: title `labelOf(t)`; lines:
  cost (`BUILD_COSTS[t]` with item icon; skip for meta-tools), `MODULE_INFO[t].desc`
  (module tools), lock state (uses the latest `unlocked` seen by `setUnlocked` — keep it
  in a closure variable). Meta-tools get fixed descriptions (erase refunds, inspect,
  blueprint copy/paste).
- [ ] **Step 4: wire statusbar** — each inventory item chip gets
  `attachTooltip(chip, () => ({ title: ITEM_LABEL[item], lines: [{ text: ITEM_INFO[item].desc }] }))`.
- [ ] **Step 5:** Build green; visual check (hover on desktop viewport, long-press with
  Playwright `page.touchscreen` on 390×844): tooltip appears, clamps at screen edges,
  never traps pointer events. Commit: `ui: unified tooltip system on hotbar + statusbar`.

---

## Task 3 — Inspector v2: blocked reason + live I/O rates

**Files:** Modify `src/main.ts` (`describe()`), `src/sim/data.ts` import use.

- [ ] For every machine case in `describe()`: append a row
  `{ label: 'Status', value: m.blocked ? BLOCKED_LABEL[m.blocked] : (m.busy ? 'working' : 'idle') }`
  (replace the existing per-case Status rows) — style: when blocked, prefix `'⚠ '`.
- [ ] Add I/O rate rows for smelter/assembler/lab using `s.rates` (plan #5 field) scaled
  to /min exactly as `stats.ts` does (copy its `toPerMin` inline — 3 lines).
- [ ] Recipe rows also show the recipe's inputs → output line (from `RECIPES`), e.g.
  `1 ore → 1 plate · 6 ticks`.
- [ ] Build; visual check a blocked smelter shows "⚠ Waiting for input". Commit:
  `ui: inspector v2 — blocked reason + I/O rates + recipe line`.

---

## Task 4 — Build menu categories (`src/ui/buildmenu.ts` inside hotbar)

**Files:** Modify `src/ui/hotbar.ts`, `src/sim/data.ts` (`MODULE_CATEGORY` from Task 1),
`src/style.css`.

- [ ] Keep the flat single row **as-is while ≤ 9 total tools are unlocked** (current game).
  Add the category layer now, dormant: a `dw-cats` tab row (Logistics ⚙ Production ⚡ Power
  🛡 Military … Misc) rendered above the tiles **only when** the tool count (module tools
  from `TOOLS` + meta tools) exceeds 9. `setUnlocked` already runs per snapshot — extend
  it to also re-evaluate visibility. Category of a module = `MODULE_CATEGORY[t]`;
  meta-tools (blueprint/erase/inspect) always visible in a trailing group.
- [ ] Number keys 1–9 map to the **visible** tiles (active category), not the global list.
- [ ] Military tab renders only if some military module is in `TOOLS` (Phase 7 wires
  mode-gating; keep a `setMilitaryVisible(on: boolean)` no-op hook on the Hotbar surface
  now so Phase 7 doesn't reshape the interface).
- [ ] Build; visual check (force >9 by temporarily pushing dummy tools in a scratch build,
  then revert). Commit: `ui: hotbar category tabs (dormant until >9 tools)`.

---

## Task 5 — Alerts feed + beacon marker (`src/ui/alerts.ts`, renderer marker)

**Files:** Create `src/ui/alerts.ts`. Modify `src/render/renderer.ts`, `src/ui/hud.ts`,
`src/main.ts`, `src/style.css`.
**Produces:** `buildAlerts(root, onGo): { update(s: Snapshot): void }`,
`Renderer.setMarker(cell: number | null)`, `Renderer.getAzimuth(): number`.

- [ ] **Renderer:** `setMarker` — a pulsing vertical beam: `CylinderGeometry(0.08, 0.18, 6)`
  with an additive-blended accent `MeshBasicMaterial` (transparent, opacity animated in
  `frame()` with `0.35 + 0.25*|sin(now*0.004)|`), positioned at the cell, `visible`
  toggled like `this.selected`. `getAzimuth()` returns `this.az`.
- [ ] **alerts.ts:** consumes `snapshot.alerts`; keeps `lastSeenId`; new alerts render as a
  stack of chips (icon + text from a local `ALERT_LABEL: Record<AlertView['kind'], string>`
  map + optional **Go** button when `cell` present) that auto-dismiss after 8 s; Go calls
  `onGo(cell)`.
- [ ] **main.ts:** `onGo(cell)` → `renderer.setMarker(cell)` and shows a fixed **direction
  arrow chip** (`.dw-beacon-arrow`, bottom-center): each `requestAnimationFrame` (reuse the
  save-throttle snapshot handler — a small `setInterval(…, 250)` is fine and cheaper),
  compute `angle = atan2(dx, dz)` from player→cell in tile space minus `renderer.getAzimuth()`,
  set `style.transform: rotate(...)`; hide arrow + marker when player is within 3 tiles.
- [ ] Also route the two legacy toasts (`Low power` in main.ts) through alerts now:
  delete the `snap.power.deficit && !prevSnap.power.deficit` toast (the sim alert replaces it).
- [ ] Build; visual check: force deficit → chip appears; Go → beam + arrow point correctly
  at all 4 camera rotations. Commit: `ui: structured alert feed + beacon marker/arrow`.

---

## Task 6 — Research graph v2 (`src/ui/researchgraph.ts`)

**Files:** Create `src/ui/researchgraph.ts`. Modify `src/ui/hud.ts` (replace
`buildResearch` usage), delete-not: keep `research.ts` file until this lands green, then
remove it. Modify `src/style.css`, `src/main.ts` (queue command).
**Produces:** `buildResearchGraph(root, cb): { update(s), toggle() }` with
`cb = { select(tech), queue(tech), contribute() }`.

- [ ] **Layout (pure function of TECHS):** column = prereq depth
  (`depth(t) = 1 + max(depth(prereqs))`, memoized); row = insertion order within column.
  Node size 148×44 px, gap 16 px. Compute once at build time.
- [ ] **DOM:** a `.dw-rgraph` panel (full-screen sheet on mobile: `inset: 48px 8px 96px`)
  containing a `.dw-rgraph-viewport` div with a translated/scaled `.dw-rgraph-canvas`
  inner div holding: one absolutely-positioned `.dw-rnode` button per tech (name, cost
  line with item icon, status stripe) and one `<svg>` underlay with a cubic path per
  prereq edge (`M x1 y1 C …`). Pan = pointer drag on the viewport (capture, move
  translate); zoom = wheel + pinch (two-pointer distance), scale clamped 0.5–1.5.
- [ ] **Search:** an `<input>` in the panel header; non-matching nodes get `.dim`.
- [ ] **Interaction:** tap a node → if available and nothing active → `cb.select`; if
  something active → `cb.queue` (chip shows queue position); long-press/hover →
  `attachTooltip` with desc + unlocks list (names resolved from `DEFS`/`RECIPES`).
  A queue strip at the top lists queued techs in order (tap to… no removal command —
  keep removal out of scope; note in panel "queue clears on completion").
  Contribute button stays (bootstrap-only; hidden once `lab` is unlocked — read
  `s.unlocked`).
- [ ] **Statuses** from snapshot exactly as `research.ts` does today (done/researching
  N/cost/available/locked) plus `queued (n)`.
- [ ] **main.ts:** add `queueResearch: (tech) => send({ type: 'research', action: 'queue', tech })`
  into the HudCallbacks it already passes.
- [ ] Wire in `hud.ts` (replace `buildResearch` import + construction; Research dock
  button unchanged). Delete `src/ui/research.ts` once green.
- [ ] Build; visual check with today's 8 techs: legible graph, edges correct
  (smelting→power→automation chain), queue of 2 works end-to-end in play; pan/zoom on
  touch viewport. Commit: `ui: research tree graph v2 (pan/zoom/search/queue), drop list panel`.

---

## Task 7 — Alt-overlay + pipette

**Files:** Modify `src/render/renderer.ts`, `src/ui/hotbar.ts`, `src/main.ts`.

- [ ] **Renderer `setAltOverlay(on: boolean)`:** for each module with a `recipe` in its
  ModuleView (smelter/assembler) — a Sprite above it showing the recipe **output** item:
  reuse the `makeLabel` canvas approach but draw a filled rounded square in
  `ITEM_COLOR[output]` + the item's first letter; cache one `CanvasTexture` per ItemType in
  a `Map` (module-level). Miners show their deposit's ore item; other machines show
  nothing. Sprites are created/removed inside `setSnapshot` when `altOverlay` is on
  (store on `ModEntry.altSprite`, dispose with the module). Default **on** for desktop,
  **off** on touch (coarse pointer) — persisted via the Phase-1 settings store: add an
  `altOverlay: boolean` field to the settings schema (follow `QualityOpts` pattern in
  `src/settings.ts`).
- [ ] **Hotbar:** dock button `Alt ✓` toggling it (same pattern as the old Explain button);
  keyboard `v`.
- [ ] **Pipette (main.ts):** on `pointerdown` with **right button** (`ev.button === 2`,
  plus `contextmenu` preventDefault on the canvas) or **touch long-press** (pointer down
  + 500 ms timer cancelled by move > 8 px / up): find `latest.modules` at the cell → call
  the same path as `hud` tool selection (`selectTool(m.type)` callback + `hud`'s
  `setActive`), set `dir = m.dir`, and if the machine has a recipe, remember it in a
  `pipetteRecipe` var applied by sending `select-recipe` right after each successful
  place of that type (listen: after `send({type:'place'...})`, also send select-recipe —
  acceptable over-send; sim validates). Toast `Tool picked: <label>`.
- [ ] Build; visual checks (alt overlay at 4 rotations; pipette on touch). Commit:
  `render/ui: alt-overlay sprites + pipette pick`.

---

## Task 8 — Recipe codex + ratio hints (`src/ui/codex.ts`) — TDD for the data walk

**Files:** Create `src/ui/codex.ts`, `tests/codex.test.ts`. Modify `src/ui/hud.ts`
(mount + dock button `Codex`), `src/ui/tooltip.ts` callers, `src/style.css`.
**Produces:** `buildCodexIndex()`, `ratioLine(recipe)`, `buildCodex(root)` panel.

- [ ] **Step 1: failing test** `tests/codex.test.ts`:

```ts
import { buildCodexIndex, ratioLine } from '../src/ui/codex';
import { RECIPES } from '../src/sim/data';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

const idx = buildCodexIndex();
// every item is a raw deposit product or has >=1 producing recipe
for (const [item, e] of idx) {
  ok(e.sources.length > 0 || e.raw, `item ${item} has a source`);
}
// plate: produced by smelt_iron, consumed by assemble_science etc.
const plate = idx.get('plate')!;
ok(plate.sources.some((r) => r.id === 'smelt_iron'), 'plate made by smelt_iron');
ok(plate.uses.some((u) => u.kind === 'recipe' && u.id === 'assemble_circuit'), 'plate used in circuits');
ok(plate.uses.some((u) => u.kind === 'build'), 'plate used in build costs');
// ratio: smelt_iron makes 1/6 per tick; assemble_science consumes 1 gear? (phase 4 changes)
// today: assemble_science consumes 1 plate / 8 ticks; smelt_iron makes 1 plate / 6 ticks
const sci = RECIPES.find((r) => r.id === 'assemble_science')!;
const line = ratioLine(sci, 'plate');
ok(/smelter/i.test(line) && /0\.8/.test(line),
  `ratio line mentions smelters and 0.75→0.8 rounded (got "${line}")`);

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

  `ratioLine(recipe, inputItem)` spec: consumption rate = `amount/time`; pick the first
  recipe producing `inputItem`; production rate = `outputCount/time`; machines needed =
  consumption/production rounded to 1 decimal; return
  `` `1 ${DEFS[machine].label.toLowerCase()} needs ${n} ${DEFS[srcMachine].label.toLowerCase()}s for ${ITEM_LABEL[inputItem]}` ``.
  (UI floats are fine — this never touches the sim.)
- [ ] **Step 2:** implement `codex.ts`: `buildCodexIndex()` walks `RECIPES`
  (sources/uses), `BUILD_COSTS` (uses kind 'build'), `TECHS` (uses kind 'tech' via
  `costItem`); `raw` = items appearing as miner outputs (`ore`, `copper_ore` today —
  derive: items not produced by any recipe). Panel: search input + item list; item page:
  icon, `ITEM_INFO` desc, "Made by" rows (recipe line + `ratioLine` under each input),
  "Used in" rows; back button. Dock button `Codex` + a "?" affordance in item tooltips is
  **not** wired (tooltips are pointer-transparent) — instead the statusbar item chips get
  `click → codex.open(item)`.
- [ ] **Step 3:** tests PASS; build green; visual check (search "plate", navigate).
  Commit: `ui: recipe codex with ratio hints (+data-walk tests)`.

---

## Task 9 — Help panel + remove Explain mode

**Files:** Create `src/ui/help.ts`. Modify `src/ui/hud.ts`, `src/ui/hotbar.ts`,
`src/main.ts`, `src/render/renderer.ts`, `src/sim/types.ts`, `src/style.css`.

- [ ] **help.ts:** static panel (dock `?` button): controls table (desktop keys / touch
  gestures — includes the new `v`, right-click pipette, Ctrl+Z), "the loop" in 6 lines,
  buttons: Replay tutorial (`tutorial.reset()` from plan #7's controller), Open codex.
- [ ] **Remove Explain:** delete `EXPLAIN` from `types.ts`; in `renderer.ts` delete
  `explain` field, `setExplain`, and the `makeLabel` short-label sprite block in
  `buildModule` (delete `makeLabel` entirely if now unused); in `hotbar.ts` remove the
  Explain button + `toggleExplain` callback; in `hud.ts`/`main.ts` remove the wiring; in
  the `hint` line of `hud.ts`, refresh the text (mention long-press for info).
- [ ] Full suite + build; **visual sweep** (both viewports): no label sprites, tooltips
  cover the gap; hotbar dock reads `[Build →][↻ View][Pause][Speed][Alt][Research][Stats]
  [Codex][?][⚙][Reset]` — if the dock overflows on 390 px, move `Codex`/`?`/`Reset`
  into the settings sheet (judgment call, note it in the commit).
- [ ] Commit: `ui: help panel; remove Explain mode (tooltips/alt-overlay replace it)`.

---

## Task 10 — Phase gate

- [ ] Full: `npm test` green (incl. re-baselined determinism), `npm run build` green.
- [ ] FTUE sanity: fresh profile → tutorial still completes (plan #7 steps unaffected).
- [ ] Merge to `main`, push, verify live hash, update `PLAN-INDEX.md` (Phase 2 ✅) and the
  root `CLAUDE.md` known-backlog line (EXPLAIN entry is now stale — remove it).

**Acceptance (from master plan):** every interactive HUD element answers "what is this and
why can't I use it" via hover/long-press; a blocked smelter says why in the inspector;
research is a legible graph with a working queue; alerts arrive with working beacons;
alt-overlay makes a mixed base readable at a glance; pipette + codex work on touch; no
Explain remnants.
