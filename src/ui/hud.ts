import { DEFS, ITEM_COLOR, ITEM_LABEL, type Dir, type ItemType, type ModuleType, type Snapshot } from '../sim/types';

type Tool = ModuleType | 'erase' | 'inspect';

export interface InspectRow {
  label: string;
  value: string;
}

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

const DIR_GLYPH = ['↑', '→', '↓', '←'];
const TOOLS: Tool[] = ['miner', 'conveyor', 'smelter', 'storage', 'generator', 'erase', 'inspect'];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function legendChip(item: ItemType): HTMLElement {
  const chip = el('span', 'dw-leg');
  const dot = el('span', 'dw-dot');
  dot.style.background = hex(ITEM_COLOR[item]);
  chip.append(dot, document.createTextNode(ITEM_LABEL[item]));
  return chip;
}

/** A virtual thumbstick for walking on touch devices (also draggable with a mouse). */
function buildJoystick(root: HTMLElement, onMove: (x: number, y: number) => void): void {
  const base = el('div', 'dw-joy');
  const knob = el('div', 'dw-joy-knob');
  base.appendChild(knob);
  root.appendChild(base);
  const R = 38; // max knob travel
  let active = false;

  const update = (ev: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    let dx = ev.clientX - (rect.left + rect.width / 2);
    let dy = ev.clientY - (rect.top + rect.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > R) {
      dx = (dx / mag) * R;
      dy = (dy / mag) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, dy / R);
  };
  const end = (ev: PointerEvent) => {
    active = false;
    knob.style.transform = 'translate(0,0)';
    onMove(0, 0);
    base.releasePointerCapture?.(ev.pointerId);
  };
  base.addEventListener('pointerdown', (ev) => {
    active = true;
    base.setPointerCapture?.(ev.pointerId);
    update(ev);
  });
  base.addEventListener('pointermove', (ev) => {
    if (active) update(ev);
  });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}

export function buildHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const top = el('div', 'dw-top');
  const pulseEl = el('span', 'dw-stat dw-pulse', '● Pulse 0');
  const powerEl = el('span', 'dw-stat', '⚡ 0/0');
  const oreEl = el('span', 'dw-stat', 'Ore 0');
  const plateEl = el('span', 'dw-stat', 'Plate 0');
  top.append(pulseEl, powerEl, oreEl, plateEl);

  const legend = el('div', 'dw-legend');
  legend.append(legendChip('ore'), el('span', 'dw-arrow', '→ smelt →'), legendChip('plate'));

  const bar = el('div', 'dw-bar');
  const toolButtons = new Map<Tool, HTMLElement>();
  let active: Tool = 'conveyor';
  const setActive = (t: Tool) => {
    active = t;
    for (const [k, b] of toolButtons) b.classList.toggle('active', k === active);
  };

  for (const t of TOOLS) {
    const label = t === 'erase' ? 'Erase' : t === 'inspect' ? '🔍 Info' : DEFS[t].label;
    const btn = el('button', 'dw-btn', label);
    btn.addEventListener('click', () => {
      cb.selectTool(t);
      setActive(t);
    });
    toolButtons.set(t, btn);
    bar.appendChild(btn);
  }

  const rotateBtn = el('button', 'dw-btn dw-ctrl', `Build ${DIR_GLYPH[1]}`);
  rotateBtn.addEventListener('click', () => cb.rotate());
  const viewBtn = el('button', 'dw-btn dw-ctrl', '↻ View');
  viewBtn.addEventListener('click', () => cb.rotateView(1));
  const pauseBtn = el('button', 'dw-btn dw-ctrl', 'Pause');
  pauseBtn.addEventListener('click', () => cb.togglePause());
  const speedBtn = el('button', 'dw-btn dw-ctrl', 'Speed');
  speedBtn.addEventListener('click', () => cb.cycleSpeed());

  let explainOn = true;
  const explainBtn = el('button', 'dw-btn dw-ctrl active', 'Explain ✓');
  explainBtn.addEventListener('click', () => {
    explainOn = !explainOn;
    explainBtn.classList.toggle('active', explainOn);
    explainBtn.textContent = explainOn ? 'Explain ✓' : 'Explain';
    cb.toggleExplain(explainOn);
  });

  const resetBtn = el('button', 'dw-btn dw-ctrl', 'Reset');
  resetBtn.addEventListener('click', () => cb.reset());

  bar.append(rotateBtn, viewBtn, pauseBtn, speedBtn, explainBtn, resetBtn);

  const hint = el(
    'div',
    'dw-hint',
    'Walk: WASD / stick · rotate view: Q / E · tap to build, drag belts · 🔍 Info to inspect. Miners go on ore.',
  );

  // Inspector popup (shows a machine's contents/status).
  const inspect = el('div', 'dw-inspect');
  const insTitle = el('div', 'dw-ins-title');
  const insClose = el('button', 'dw-ins-close', '✕');
  insClose.addEventListener('click', () => {
    inspect.classList.remove('show');
    cb.closeInspect();
  });
  const insHead = el('div', 'dw-ins-head');
  insHead.append(insTitle, insClose);
  const insBody = el('div', 'dw-ins-body');
  inspect.append(insHead, insBody);

  root.append(top, legend, hint, bar, inspect);
  buildJoystick(root, cb.move);
  setActive('conveyor');

  return {
    setStats(s) {
      pulseEl.textContent = `● ${s.pulse}`;
      powerEl.textContent = `⚡ ${s.power.used}/${s.power.produced}`;
      powerEl.classList.toggle('deficit', s.power.deficit);
      oreEl.textContent = `Ore ${s.storage.ore}`;
      plateEl.textContent = `Plate ${s.storage.plate}`;
    },
    setDir(d) {
      rotateBtn.textContent = `Build ${DIR_GLYPH[d]}`;
    },
    setPaused(p) {
      pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    setSpeed(ms) {
      speedBtn.textContent = `Speed ${(150 / ms).toFixed(1)}×`;
    },
    showInspect(title, rows) {
      insTitle.textContent = title;
      insBody.innerHTML = '';
      for (const r of rows) {
        const row = el('div', 'dw-ins-row');
        row.append(el('span', 'dw-ins-k', r.label), el('span', 'dw-ins-v', r.value));
        insBody.appendChild(row);
      }
      inspect.classList.add('show');
    },
    hideInspect() {
      inspect.classList.remove('show');
    },
  };
}
