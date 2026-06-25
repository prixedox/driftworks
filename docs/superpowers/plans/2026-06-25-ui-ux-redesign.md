# DRIFTWORKS UI/UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DRIFTWORKS interface look and feel like a polished game — a themed HUD with an icon hotbar, a real build experience (ghost preview + highlights), and lively feedback — without changing gameplay or the simulation.

**Architecture:** UI stays a DOM/CSS overlay on top of the Three.js canvas, rebuilt on a design-token system + inline-SVG icons, with `hud.ts` split into focused modules (`theme.css`, `icons`, `statusbar`, `hotbar`, `inspector`, `toasts`, `joystick`, orchestrated by `hud`). The renderer gains read-only build affordances: `setGhost`, `setHighlight`, `setSelected`. `main.ts` remains the wiring layer.

**Tech Stack:** TypeScript (strict), Three.js (r0.169), Vite 5, vanilla DOM + CSS, GitHub Pages (Actions).

## Global Constraints

- **Do not modify `src/sim/*`** (world.ts, worker.ts, types.ts). The deterministic sim and the worker protocol stay exactly as-is. (`types.ts` may only be read.)
- **Build gate:** every task ends green on `npm run build` (runs `tsc --noEmit && vite build`). Strict TS — no unused locals/params, no `any` leaks.
- **No new runtime dependencies.** Icons are inline SVG strings; animations are CSS only; no UI framework.
- **UI = DOM overlay; 3D = Three.js canvas.** Don't render UI inside the canvas.
- **Palette tokens (use verbatim):** `--bg #0b1016`, `--panel rgba(18,24,32,.82)`, `--panel-2 #141b24`, `--border #2b3645`, `--accent #5ad1c0`, `--ore #e8a35a`, `--plate #8fd0ff`, `--danger #ff6b6b`, `--text #d8e0ea`, `--muted #8aa0b6`.
- **Verification harness:** headless Chrome at `/usr/bin/google-chrome` driven by `playwright-core` (already used; scripts live in the session scratchpad). Pure logic is unit-tested via `npx tsx`.
- **Per phase:** after the phase's last task is green and screenshot-verified, commit, push to `main`, and let the Pages Action deploy.
- **Commit message footer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

New files:
- `src/ui/theme.css` — design tokens + shared component base styles. Imported in `main.ts` **before** `./style.css`.
- `src/ui/icons.ts` — `ICONS: Record<string, string>` of inline SVG markup; `svgEl(name, cls?)` helper.
- `src/ui/statusbar.ts` — top status panel (pulse, power bar, ore/plate with icons). Exports `buildStatusBar(root): { update(s: Snapshot): void }`.
- `src/ui/hotbar.ts` — build/erase/inspect icon tiles + control dock + number-key shortcuts. Exports `buildHotbar(root, cb): { setActive(t): void; setDir(d): void; setPaused(p): void; setSpeed(ms): void; setExplain(on): void }`.
- `src/ui/inspector.ts` — machine popup. Exports `buildInspector(root, onClose): { show(title, rows): void; hide(): void }`.
- `src/ui/toasts.ts` — transient messages. Exports `buildToasts(root): { push(text: string, kind?: 'info'|'warn'): void }`.
- `src/ui/joystick.ts` — extracted thumbstick. Exports `buildJoystick(root, onMove): void`.
- `tests/placement.test.ts` — unit test for `placementValid`.

Modified files:
- `src/ui/hud.ts` — becomes a thin orchestrator composing the modules above; keeps the existing `Hud`/`HudCallbacks` surface (+ `pushToast`, `setGhostState` additions noted per task).
- `src/render/renderer.ts` — add `setGhost`, `setHighlight`, `setSelected` and their meshes.
- `src/main.ts` — wire ghost/highlight/selection, placement validity, shortcuts, toast triggers; import `theme.css`.
- `src/ui/placement.ts` — new pure module for `placementValid` (kept separate so it's testable without DOM/Three).

---

# PHASE 1 — Visual theme & design system

## Task 1: Design tokens + theme.css

**Files:**
- Create: `src/ui/theme.css`
- Modify: `src/main.ts:1` (add import above `./style.css`)

**Interfaces:**
- Produces: CSS custom properties on `:root` consumed by every later component: `--bg --panel --panel-2 --border --accent --ore --plate --danger --text --muted --r-sm --r-md --sp --shadow --glow`, plus base classes `.dw-panel`, `.dw-icon`.

- [ ] **Step 1: Create `src/ui/theme.css`**

```css
:root {
  --bg: #0b1016;
  --panel: rgba(18, 24, 32, 0.82);
  --panel-2: #141b24;
  --border: #2b3645;
  --accent: #5ad1c0;
  --ore: #e8a35a;
  --plate: #8fd0ff;
  --danger: #ff6b6b;
  --text: #d8e0ea;
  --muted: #8aa0b6;
  --r-sm: 8px;
  --r-md: 12px;
  --sp: 8px;
  --shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  --glow: 0 0 14px rgba(90, 209, 192, 0.55);
}

/* Glassy tech panel used across the HUD */
.dw-panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
  backdrop-filter: blur(6px);
}

.dw-icon {
  width: 22px;
  height: 22px;
  display: block;
}
.dw-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* HUD label convention */
.dw-label {
  font: 700 11px/1 ui-monospace, "SF Mono", monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.dw-num {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Import it before style.css in `src/main.ts`**

Change the top of `src/main.ts`:

```ts
import './ui/theme.css';
import './style.css';
```

- [ ] **Step 3: Build to verify it compiles & bundles**

Run: `npm run build`
Expected: `✓ built` with a CSS asset; no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/theme.css src/main.ts
git commit -m "UI: add design-token theme.css" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 2: Icon set (`icons.ts`)

**Files:**
- Create: `src/ui/icons.ts`

**Interfaces:**
- Produces: `ICONS: Record<string, string>` keyed by `miner|conveyor|smelter|storage|generator|erase|inspect|view|pause|play|speed|explain|reset|ore|plate|power`; helper `svgEl(name: string, cls = 'dw-icon'): HTMLElement`.

- [ ] **Step 1: Create `src/ui/icons.ts`**

Inline, single-color (`currentColor`) line SVGs so they inherit text color. Author one per key. Example shape for three; follow the same 24×24 viewBox / `stroke="currentColor"` pattern for the rest:

```ts
export const ICONS: Record<string, string> = {
  miner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l6-6"/><path d="M14 4l6 6"/><path d="M9 9l6 6"/><path d="M13 3a6 6 0 0 1 8 8"/></svg>`,
  conveyor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="14" r="3"/><circle cx="18" cy="14" r="3"/><path d="M6 11h12"/><path d="M10 8l3 0M9 5l3 0"/></svg>`,
  smelter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1.5 2-1 3 0 5 2 1 3 3 3 5a4 4 0 1 1-8 0c0-3 3-3 2-7 1 0 2-1 1-3z"/></svg>`,
  // storage, generator, erase, inspect, view, pause, play, speed, explain, reset,
  // ore, plate, power — author each in the same 24x24 stroke="currentColor" style.
};

export function svgEl(name: string, cls = 'dw-icon'): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = ICONS[name] ?? '';
  return span;
}
```

(Author the remaining keys listed in the comment — each is one 24×24 stroke icon; do not leave any referenced key undefined.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: green (module is referenced once it's used in later tasks; an unused export is fine for now since `noUnusedLocals` applies to locals, not exports).

- [ ] **Step 3: Commit**

```bash
git add src/ui/icons.ts
git commit -m "UI: add inline SVG icon set" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 3: Status bar module (`statusbar.ts`)

**Files:**
- Create: `src/ui/statusbar.ts`
- Modify: `src/style.css` (append status-bar styles)

**Interfaces:**
- Consumes: `Snapshot` from `../sim/types`; `svgEl` from `./icons`.
- Produces: `buildStatusBar(root: HTMLElement): { update(s: Snapshot): void }`.

- [ ] **Step 1: Create `src/ui/statusbar.ts`**

```ts
import type { Snapshot } from '../sim/types';
import { svgEl } from './icons';

export interface StatusBar {
  update(s: Snapshot): void;
}

export function buildStatusBar(root: HTMLElement): StatusBar {
  const bar = document.createElement('div');
  bar.className = 'dw-statusbar dw-panel';

  const pulse = chip('pulse', '0');
  const powerWrap = document.createElement('div');
  powerWrap.className = 'dw-stat dw-power';
  powerWrap.append(svgEl('power'));
  const powerFill = document.createElement('div');
  powerFill.className = 'dw-power-fill';
  const powerTrack = document.createElement('div');
  powerTrack.className = 'dw-power-track';
  powerTrack.append(powerFill);
  const powerNum = span('dw-num', '0/0');
  powerWrap.append(powerTrack, powerNum);

  const ore = chip('ore', '0');
  const plate = chip('plate', '0');
  bar.append(pulse.el, powerWrap, ore.el, plate.el);
  root.append(bar);

  return {
    update(s) {
      pulse.value.textContent = String(s.pulse);
      const prod = Math.max(1, s.power.produced);
      powerFill.style.width = `${Math.min(100, (s.power.used / prod) * 100)}%`;
      powerFill.classList.toggle('deficit', s.power.deficit);
      powerNum.textContent = `${s.power.used}/${s.power.produced}`;
      ore.value.textContent = String(s.storage.ore);
      plate.value.textContent = String(s.storage.plate);
    },
  };

  function chip(icon: string, v: string) {
    const el = document.createElement('div');
    el.className = 'dw-stat';
    el.append(svgEl(icon));
    const value = span('dw-num', v);
    el.append(value);
    return { el, value };
  }
  function span(cls: string, text: string) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }
}
```

- [ ] **Step 2: Append status-bar CSS to `src/style.css`**

```css
.dw-statusbar {
  position: fixed;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  z-index: 10;
}
.dw-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font: 700 14px/1 ui-monospace, monospace;
}
.dw-stat .dw-icon {
  color: var(--muted);
}
.dw-power-track {
  width: 54px;
  height: 7px;
  border-radius: 4px;
  background: #0d141c;
  border: 1px solid var(--border);
  overflow: hidden;
}
.dw-power-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.18s ease;
}
.dw-power-fill.deficit {
  background: var(--danger);
}
```

- [ ] **Step 3: Build** — `npm run build` → green.
- [ ] **Step 4: Commit**

```bash
git add src/ui/statusbar.ts src/style.css
git commit -m "UI: status bar module with power bar + item icons" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 4: Hotbar module (`hotbar.ts`)

**Files:**
- Create: `src/ui/hotbar.ts`
- Modify: `src/style.css` (append hotbar styles)

**Interfaces:**
- Consumes: `DEFS`, `Dir`, `ModuleType` from `../sim/types`; `svgEl` from `./icons`.
- Produces: type `Tool = ModuleType | 'erase' | 'inspect'`; `buildHotbar(root, cb): Hotbar` where
  `cb = { selectTool(t: Tool), rotate(), togglePause(), cycleSpeed(), toggleExplain(on: boolean), rotateView(d: number), reset() }`
  and `Hotbar = { setActive(t: Tool), setDir(d: Dir), setPaused(p: boolean), setSpeed(ms: number) }`.

- [ ] **Step 1: Create `src/ui/hotbar.ts`**

```ts
import { DEFS, type Dir, type ModuleType } from '../sim/types';
import { svgEl } from './icons';

export type Tool = ModuleType | 'erase' | 'inspect';

export interface HotbarCallbacks {
  selectTool: (t: Tool) => void;
  rotate: () => void;
  togglePause: () => void;
  cycleSpeed: () => void;
  toggleExplain: (on: boolean) => void;
  rotateView: (d: number) => void;
  reset: () => void;
}
export interface Hotbar {
  setActive: (t: Tool) => void;
  setDir: (d: Dir) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (ms: number) => void;
}

const TOOLS: Tool[] = ['miner', 'conveyor', 'smelter', 'storage', 'generator', 'erase', 'inspect'];
const DIR_GLYPH = ['↑', '→', '↓', '←'];
const ICON_KEY: Record<Tool, string> = {
  miner: 'miner', conveyor: 'conveyor', smelter: 'smelter', storage: 'storage',
  generator: 'generator', erase: 'erase', inspect: 'inspect',
};
const labelOf = (t: Tool) => (t === 'erase' ? 'Erase' : t === 'inspect' ? 'Info' : DEFS[t].label);

export function buildHotbar(root: HTMLElement, cb: HotbarCallbacks): Hotbar {
  const wrap = document.createElement('div');
  wrap.className = 'dw-hotbar';

  const tiles = document.createElement('div');
  tiles.className = 'dw-tiles dw-panel';
  const tileMap = new Map<Tool, HTMLElement>();
  TOOLS.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'dw-tile';
    b.title = labelOf(t);
    b.append(svgEl(ICON_KEY[t]));
    const key = document.createElement('span');
    key.className = 'dw-key';
    key.textContent = String(i + 1);
    b.append(key);
    b.addEventListener('click', () => cb.selectTool(t));
    tileMap.set(t, b);
    tiles.append(b);
  });

  const dock = document.createElement('div');
  dock.className = 'dw-dock dw-panel';
  const dirBtn = ctrl(`Build →`, () => cb.rotate());
  const viewBtn = ctrl('↻ View', () => cb.rotateView(1));
  const pauseBtn = ctrl('Pause', () => cb.togglePause());
  const speedBtn = ctrl('Speed', () => cb.cycleSpeed());
  let explainOn = true;
  const explainBtn = ctrl('Explain ✓', () => {
    explainOn = !explainOn;
    explainBtn.classList.toggle('active', explainOn);
    explainBtn.textContent = explainOn ? 'Explain ✓' : 'Explain';
    cb.toggleExplain(explainOn);
  });
  explainBtn.classList.add('active');
  const resetBtn = ctrl('Reset', () => cb.reset());
  dock.append(dirBtn, viewBtn, pauseBtn, speedBtn, explainBtn, resetBtn);

  wrap.append(tiles, dock);
  root.append(wrap);

  window.addEventListener('keydown', (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= TOOLS.length) cb.selectTool(TOOLS[n - 1]);
  });

  return {
    setActive(t) {
      for (const [k, b] of tileMap) b.classList.toggle('active', k === t);
    },
    setDir(d) {
      dirBtn.textContent = `Build ${DIR_GLYPH[d]}`;
    },
    setPaused(p) {
      pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    setSpeed(ms) {
      speedBtn.textContent = `Speed ${(150 / ms).toFixed(1)}×`;
    },
  };

  function ctrl(text: string, on: () => void) {
    const b = document.createElement('button');
    b.className = 'dw-ctrl';
    b.textContent = text;
    b.addEventListener('click', on);
    return b;
  }
}
```

- [ ] **Step 2: Append hotbar CSS to `src/style.css`**

```css
.dw-hotbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(8px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  z-index: 11;
}
.dw-tiles {
  display: flex;
  gap: 6px;
  padding: 7px;
}
.dw-tile {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--text);
  cursor: pointer;
  transition: transform 0.06s, border-color 0.12s, box-shadow 0.12s;
}
.dw-tile:active {
  transform: translateY(1px);
}
.dw-tile.active {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: var(--glow);
}
.dw-key {
  position: absolute;
  top: 2px;
  right: 4px;
  font: 700 9px/1 ui-monospace, monospace;
  color: var(--muted);
}
.dw-dock {
  display: flex;
  gap: 5px;
  padding: 5px 7px;
}
.dw-ctrl {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: var(--r-sm);
  padding: 7px 9px;
  font: 600 12px/1 system-ui, sans-serif;
  cursor: pointer;
}
.dw-ctrl:active {
  transform: translateY(1px);
}
.dw-ctrl.active {
  color: var(--accent);
}
```

- [ ] **Step 3: Build** — `npm run build` → green.
- [ ] **Step 4: Commit**

```bash
git add src/ui/hotbar.ts src/style.css
git commit -m "UI: icon hotbar + control dock + number-key shortcuts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 5: Extract inspector + joystick; refactor `hud.ts` into orchestrator

**Files:**
- Create: `src/ui/inspector.ts`, `src/ui/joystick.ts`
- Modify: `src/ui/hud.ts` (rewrite as orchestrator), `src/style.css` (move/keep inspector + joystick styles)

**Interfaces:**
- `buildInspector(root, onClose: () => void): { show(title: string, rows: { label: string; value: string }[]): void; hide(): void }`
- `buildJoystick(root, onMove: (x: number, y: number) => void): void`
- `hud.ts` keeps exporting `buildHud(root, cb): Hud` with the SAME `HudCallbacks` and `Hud` interfaces currently in `src/ui/hud.ts` (so `main.ts` keeps compiling), now delegating to `buildStatusBar`, `buildHotbar`, `buildInspector`, `buildJoystick`. `Tool` is re-exported from `./hotbar`.

- [ ] **Step 1: Create `src/ui/joystick.ts`** — move the existing `buildJoystick` body verbatim from `hud.ts` into its own file and `export` it (it already exists as a local function; copy it exactly, keep the `.dw-joy`/`.dw-joy-knob` markup).

- [ ] **Step 2: Create `src/ui/inspector.ts`**

```ts
export interface InspectRow {
  label: string;
  value: string;
}
export interface Inspector {
  show(title: string, rows: InspectRow[]): void;
  hide(): void;
}

export function buildInspector(root: HTMLElement, onClose: () => void): Inspector {
  const el = document.createElement('div');
  el.className = 'dw-inspect dw-panel';
  const head = document.createElement('div');
  head.className = 'dw-ins-head';
  const title = document.createElement('div');
  title.className = 'dw-ins-title';
  const close = document.createElement('button');
  close.className = 'dw-ins-close';
  close.textContent = '✕';
  close.addEventListener('click', () => {
    el.classList.remove('show');
    onClose();
  });
  head.append(title, close);
  const body = document.createElement('div');
  body.className = 'dw-ins-body';
  el.append(head, body);
  root.append(el);

  return {
    show(t, rows) {
      title.textContent = t;
      body.innerHTML = '';
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'dw-ins-row';
        const k = document.createElement('span');
        k.className = 'dw-ins-k';
        k.textContent = r.label;
        const v = document.createElement('span');
        v.className = 'dw-ins-v';
        v.textContent = r.value;
        row.append(k, v);
        body.append(row);
      }
      el.classList.add('show');
    },
    hide() {
      el.classList.remove('show');
    },
  };
}
```

- [ ] **Step 3: Rewrite `src/ui/hud.ts` as the orchestrator** — keep the exact `HudCallbacks` and `Hud` interfaces it exports today (verified signatures: `HudCallbacks` has `selectTool, rotate, togglePause, cycleSpeed, toggleExplain, move, rotateView, closeInspect, reset`; `Hud` has `setStats, setDir, setPaused, setSpeed, showInspect, hideInspect`; plus `InspectRow` and `Tool` are exported). Compose the sub-modules:

```ts
import type { Dir, Snapshot } from '../sim/types';
import { buildStatusBar } from './statusbar';
import { buildHotbar, type Tool } from './hotbar';
import { buildInspector, type InspectRow } from './inspector';
import { buildJoystick } from './joystick';

export type { Tool, InspectRow };

export interface HudCallbacks {
  selectTool: (t: Tool) => void;
  rotate: () => void;
  togglePause: () => void;
  cycleSpeed: () => void;
  toggleExplain: (on: boolean) => void;
  move: (x: number, y: number) => void;
  rotateView: (d: number) => void;
  closeInspect: () => void;
  reset: () => void;
}
export interface Hud {
  setStats: (s: Snapshot) => void;
  setDir: (d: Dir) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (ms: number) => void;
  showInspect: (title: string, rows: InspectRow[]) => void;
  hideInspect: () => void;
}

export function buildHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const status = buildStatusBar(root);
  const hotbar = buildHotbar(root, {
    selectTool: (t) => {
      cb.selectTool(t);
      hotbar.setActive(t);
    },
    rotate: cb.rotate,
    togglePause: cb.togglePause,
    cycleSpeed: cb.cycleSpeed,
    toggleExplain: cb.toggleExplain,
    rotateView: cb.rotateView,
    reset: cb.reset,
  });
  hotbar.setActive('conveyor');
  const inspector = buildInspector(root, cb.closeInspect);
  buildJoystick(root, cb.move);

  const hint = document.createElement('div');
  hint.className = 'dw-hint';
  hint.textContent = 'Walk: WASD / stick · rotate view: Q / E · 1–7 tools · tap to build · 🔍 inspect';
  root.append(hint);

  return {
    setStats: (s) => status.update(s),
    setDir: (d) => hotbar.setDir(d),
    setPaused: (p) => hotbar.setPaused(p),
    setSpeed: (ms) => hotbar.setSpeed(ms),
    showInspect: (t, rows) => inspector.show(t, rows),
    hideInspect: () => inspector.hide(),
  };
}
```

- [ ] **Step 4: Remove now-dead code from `style.css`** — delete the old `.dw-top`, `.dw-legend`, `.dw-leg`, `.dw-arrow`, `.dw-bar`, `.dw-btn` rules that the old HUD used (the new status bar/hotbar replace them). Keep `.dw-inspect*`, `.dw-joy*`, `.dw-hint`.

- [ ] **Step 5: Build** — `npm run build` → green (confirms `main.ts` still satisfies the unchanged `Hud`/`HudCallbacks`).

- [ ] **Step 6: Screenshot-verify the new HUD**

Create `scratchpad/shot.mjs` that launches google-chrome via playwright-core, navigates to a `vite preview` on a free port, clicks `Reset`, waits 3 s, and screenshots `hud.png`. Open `hud.png` and confirm: themed status bar (icons + power bar), icon hotbar with active tile, control dock, joystick — no leftover text-button row.

- [ ] **Step 7: Commit, push, deploy (end of Phase 1)**

```bash
git add src/ui/*.ts src/style.css
git commit -m "UI: split hud into modules; themed status bar + icon hotbar (Phase 1)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```
Watch the Pages Action to success; confirm the live bundle hash updates.

---

# PHASE 2 — Build & interaction UX

## Task 6: `placementValid` pure function (TDD)

**Files:**
- Create: `src/ui/placement.ts`, `tests/placement.test.ts`

**Interfaces:**
- Produces: `placementValid(cell: number, tool: Tool, snapshot: Snapshot): boolean`.
  Rules: `false` if a module already occupies `cell`; `inspect`/`erase` always return `false` (not placements); `miner` requires `snapshot.ore.includes(cell)`; all other build tools `true` on an empty cell.

- [ ] **Step 1: Write the failing test `tests/placement.test.ts`**

```ts
import { placementValid } from '../src/ui/placement';
import type { Snapshot } from '../src/sim/types';

const base = (over: Partial<Snapshot>): Snapshot => ({
  w: 4, h: 4, pulse: 0, pulseMs: 150, paused: false,
  modules: [], packets: [], storage: { ore: 0, plate: 0 },
  power: { produced: 0, used: 0, deficit: false }, ore: [], ...over,
});

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); fails++; } };

ok(placementValid(5, 'conveyor', base({})) === true, 'belt on empty');
ok(placementValid(5, 'miner', base({ ore: [5] })) === true, 'miner on ore');
ok(placementValid(5, 'miner', base({ ore: [] })) === false, 'miner off ore');
ok(placementValid(5, 'conveyor', base({ modules: [{ cell: 5, type: 'conveyor', dir: 1 }] })) === false, 'occupied');
ok(placementValid(5, 'inspect', base({})) === false, 'inspect not a placement');
ok(placementValid(5, 'erase', base({})) === false, 'erase not a placement');
console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx --yes tsx tests/placement.test.ts`
Expected: error — cannot find module `../src/ui/placement` (not created yet).

- [ ] **Step 3: Implement `src/ui/placement.ts`**

```ts
import type { Snapshot } from '../sim/types';
import type { Tool } from './hotbar';

export function placementValid(cell: number, tool: Tool, s: Snapshot): boolean {
  if (tool === 'inspect' || tool === 'erase') return false;
  if (s.modules.some((m) => m.cell === cell)) return false;
  if (tool === 'miner') return s.ore.includes(cell);
  return true;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx --yes tsx tests/placement.test.ts`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/placement.ts tests/placement.test.ts
git commit -m "UX: placementValid pure function + tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 7: Renderer build ghost + main wiring

**Files:**
- Modify: `src/render/renderer.ts` (add ghost mesh + `setGhost`), `src/main.ts` (compute target + validity, call `setGhost`)

**Interfaces:**
- Produces on `Renderer`: `setGhost(g: { cell: number; type: ModuleType; dir: Dir; valid: boolean } | null): void`.
- Consumes in `main.ts`: `placementValid` (Task 6), existing `renderer.screenToCell`, latest `Snapshot`.

- [ ] **Step 1: Add the ghost to `renderer.ts`** — add a field and method. Reuse a simple box at module size; tint green/red; low opacity; place via the existing `cw(cell)` helper and `MACH_H`.

```ts
// field (near other private fields):
private ghost = new Mesh(
  new BoxGeometry(0.84, MACH_H, 0.84),
  new MeshStandardMaterial({ color: 0x5ad1c0, transparent: true, opacity: 0.4, depthWrite: false }),
);

// in init(), after creating groups:
this.ghost.visible = false;
this.scene.add(this.ghost);

// public method:
setGhost(g: { cell: number; type: ModuleType; dir: Dir; valid: boolean } | null): void {
  if (!g) { this.ghost.visible = false; return; }
  const p = this.cw(g.cell);
  this.ghost.position.set(p.x, MACH_H / 2 + 0.15, p.z);
  (this.ghost.material as MeshStandardMaterial).color.setHex(g.valid ? 0x5ad1c0 : 0xff6b6b);
  this.ghost.visible = true;
}
```

(Imports `BoxGeometry`, `Mesh`, `MeshStandardMaterial` already exist in renderer.)

- [ ] **Step 2: Wire targeting + validity in `main.ts`** — import `placementValid`; track a hover/press target cell; show the ghost for build tools, hide for inspect/erase. Desktop: pointermove over canvas updates the ghost; Touch: show on pointerdown/move while pressing. Add after the existing pointer handlers:

```ts
import { placementValid } from './ui/placement';

const updateGhost = (cell: number) => {
  if (cell < 0 || tool === 'inspect' || tool === 'erase' || !latest) {
    renderer.setGhost(null);
    return;
  }
  renderer.setGhost({ cell, type: tool, dir, valid: placementValid(cell, tool, latest) });
};

canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'mouse' && !dragging) updateGhost(cellAt(ev));
});
canvas.addEventListener('pointerleave', () => renderer.setGhost(null));
```

Also call `renderer.setGhost(null)` inside the tool-select callback when the new tool is `inspect`/`erase`, and call `updateGhost(lastCell)` at the end of the build `pointerdown`/`pointermove` so the ghost tracks while dragging on touch.

- [ ] **Step 3: Build** — `npm run build` → green.

- [ ] **Step 4: Screenshot-verify** — script: select Miner, move mouse over an ore tile → screenshot `ghost_valid.png` (teal ghost); move over non-ore grass → `ghost_invalid.png` (red ghost). Confirm colors and that the ghost sits on the targeted tile.

- [ ] **Step 5: Commit**

```bash
git add src/render/renderer.ts src/main.ts
git commit -m "UX: build ghost preview (green valid / red invalid)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 8: Tile highlight + selection outline

**Files:**
- Modify: `src/render/renderer.ts` (`setHighlight`, `setSelected`), `src/main.ts` (drive them)

**Interfaces:**
- Produces on `Renderer`: `setHighlight(cells: number[]): void` (ore tiles when Miner active), `setSelected(cell: number | null): void` (outline inspected machine).

- [ ] **Step 1: Implement `setHighlight`** — an `InstancedMesh` of flat translucent quads at the given cells (rebuild on change; cap to keep it cheap). Implement with a thin box at y≈0.12, `color 0x5ad1c0`, `opacity 0.18`. Store the current cell-signature to skip rebuilds. Provide concrete code mirroring the ore-instancing pattern already in `buildWorld`.

- [ ] **Step 2: Implement `setSelected`** — a single wireframe/edges box (`EdgesGeometry` of the module box, `LineBasicMaterial` accent) positioned over the selected cell at machine height; `visible=false` when `null`. Import `EdgesGeometry`, `LineSegments`, `LineBasicMaterial` (LineSegments/LineBasicMaterial already imported; add `EdgesGeometry`).

- [ ] **Step 3: Drive from `main.ts`** — when `tool === 'miner'`, `renderer.setHighlight(latest.ore)`, else `renderer.setHighlight([])`. When inspecting (`inspectCell != null`), `renderer.setSelected(inspectCell)` else `setSelected(null)`. Call on tool-select and in the snapshot handler.

- [ ] **Step 4: Build** — `npm run build` → green.

- [ ] **Step 5: Screenshot-verify** — select Miner → `highlight.png` shows ore tiles tinted; Info-tap a machine → `selected.png` shows an outline on it.

- [ ] **Step 6: Commit, push, deploy (end of Phase 2)**

```bash
git add src/render/renderer.ts src/main.ts
git commit -m "UX: ore/target tile highlight + machine selection outline (Phase 2)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```
Watch the Action to success; confirm live.

---

# PHASE 3 — Feedback & juice

## Task 9: Toast / floating-text system

**Files:**
- Create: `src/ui/toasts.ts`
- Modify: `src/style.css` (toast styles), `src/ui/hud.ts` (expose `pushToast`), `src/main.ts` (emit on snapshot deltas)

**Interfaces:**
- Produces: `buildToasts(root): { push(text: string, kind?: 'info' | 'warn'): void }`. `hud.ts` adds `pushToast(text, kind?)` to the `Hud` interface, delegating to the toasts module.

- [ ] **Step 1: Create `src/ui/toasts.ts`**

```ts
export interface Toasts {
  push(text: string, kind?: 'info' | 'warn'): void;
}
export function buildToasts(root: HTMLElement): Toasts {
  const stack = document.createElement('div');
  stack.className = 'dw-toasts';
  root.append(stack);
  return {
    push(text, kind = 'info') {
      const t = document.createElement('div');
      t.className = `dw-toast ${kind}`;
      t.textContent = text;
      stack.append(t);
      // animate out, then remove
      setTimeout(() => t.classList.add('out'), 1400);
      setTimeout(() => t.remove(), 1900);
    },
  };
}
```

- [ ] **Step 2: Toast CSS in `style.css`**

```css
.dw-toasts {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  z-index: 14;
  pointer-events: none;
}
.dw-toast {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  font: 700 12px/1 system-ui, sans-serif;
  box-shadow: var(--shadow);
  animation: dw-toast-in 0.22s ease-out;
}
.dw-toast.warn {
  color: var(--danger);
  border-color: #5a2530;
}
.dw-toast.out {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.45s, transform 0.45s;
}
@keyframes dw-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Expose via `hud.ts`** — `const toasts = buildToasts(root);` and add `pushToast: (text, kind) => toasts.push(text, kind)` to the returned `Hud` (add `pushToast(text: string, kind?: 'info'|'warn'): void` to the `Hud` interface).

- [ ] **Step 4: Emit from `main.ts` on deltas** — keep `prevStored`/`prevDeficit`; in the snapshot handler:

```ts
if (latestPrev) {
  const dPlate = snap.storage.plate - latestPrev.storage.plate;
  if (dPlate > 0) hud.pushToast(`+${dPlate} plate`, 'info');
  if (snap.power.deficit && !latestPrev.power.deficit) hud.pushToast('Low power', 'warn');
}
latestPrev = snap;
```
(Throttle plate toasts to at most one per ~1.5 s with a timestamp guard so a fast belt doesn't spam.)

- [ ] **Step 5: Build** — green. **Screenshot-verify** a toast appears after production. **Commit.**

## Task 10: Inspector polish (progress bar + item icons)

**Files:**
- Modify: `src/ui/inspector.ts` (support a bar row + icon rows), `src/main.ts` (`describe()` passes a progress value), `src/style.css` (bar styles)

**Interfaces:**
- Extend `InspectRow` to `{ label: string; value: string; bar?: number /* 0..1 */; icon?: string }`. The inspector renders a fill bar when `bar` is set and an icon when `icon` is set. `describe()` (in `main.ts`) sets `bar` for the smelter "Progress" row using `m.progress`, and `icon` for ore/plate rows.

- [ ] **Step 1: Extend the inspector renderer** — when `r.bar != null`, append a `.dw-ins-bar` element with inner `.dw-ins-bar-fill` width `${r.bar*100}%`; when `r.icon`, prepend `svgEl(r.icon)`. Concrete DOM code mirrors Task 5's row builder.
- [ ] **Step 2: Bar CSS** — `.dw-ins-bar { height:6px; background:#0d141c; border-radius:4px; overflow:hidden } .dw-ins-bar-fill { height:100%; background:var(--accent); transition:width .15s }`.
- [ ] **Step 3: Update `describe()` in `main.ts`** — smelter Progress row: `{ label:'Progress', value:`${Math.round((m.progress??0)*100)}%`, bar: m.progress ?? 0 }`; ore/plate storage rows get `icon:'ore'|'plate'`.
- [ ] **Step 4: Build** — green. **Screenshot-verify** the smelter inspector shows an animated bar + item icons. **Commit.**

## Task 11: Micro-animations

**Files:**
- Modify: `src/style.css`

**Interfaces:** none (pure CSS).

- [ ] **Step 1: Add entrance + interaction animations** — panel fade/slide-in on load (`.dw-statusbar, .dw-hotbar { animation: dw-rise .3s ease-out }` with a `@keyframes dw-rise { from{opacity:0; transform:translateY(8px)} to{opacity:1;transform:none} }`), hotbar tile press already via `:active`, and an active-tile glow pulse (`@keyframes dw-pulse` on `.dw-tile.active` box-shadow). Keep subtle.
- [ ] **Step 2: Build** — green. **Screenshot-verify** no layout breakage. **Commit, push, deploy (end of Phase 3).**

```bash
git add -A
git commit -m "UI: feedback & juice — toasts, inspector bar, micro-animations (Phase 3)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Self-review notes (author)

- **Spec coverage:** P1 theme/tokens (T1), icons (T2), status bar w/ power bar + item icons (T3), icon hotbar + dock + shortcuts (T4), hud split into modules (T5). P2 placementValid (T6), ghost (T7), highlight + selection (T8). P3 toasts (T9), inspector polish (T10), micro-animations (T11). Sound = explicit non-goal (not planned). Touch ghost-under-finger handled in T7 Step 2.
- **Sim untouched:** no task edits `src/sim/*`.
- **Type consistency:** `Tool` defined in `hotbar.ts`, re-exported by `hud.ts`, consumed by `placement.ts`/`main.ts`. `setGhost`/`setHighlight`/`setSelected` signatures fixed in T7/T8 and consumed only by `main.ts`. `Hud` gains `pushToast` (T9) and `InspectRow` gains `bar?`/`icon?` (T10) — both additive.
- **Verification:** logic via `tsx` (T6); visuals via headless-Chrome screenshots each task; `npm run build` gate everywhere; deploy at the end of each phase.
</content>
