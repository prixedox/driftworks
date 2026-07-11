import { DEFS, type Dir, type ModuleType } from '../sim/types';
import { svgEl } from './icons';
import { BUILD_COSTS } from '../sim/data';

export type Tool = ModuleType | 'erase' | 'inspect' | 'blueprint';

export interface HotbarCallbacks {
  selectTool: (t: Tool) => void;
  rotate: () => void;
  togglePause: () => void;
  cycleSpeed: () => void;
  toggleExplain: (on: boolean) => void;
  rotateView: (d: number) => void;
  reset: () => void;
  researchToggle: () => void;
  settingsToggle: () => void;
}
export interface Hotbar {
  setActive: (t: Tool) => void;
  setDir: (d: Dir) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (ms: number) => void;
  setUnlocked: (unlocked: ModuleType[]) => void;
}

const TOOLS: Tool[] = ['miner', 'conveyor', 'smelter', 'storage', 'generator', 'assembler', 'lab', 'blueprint', 'erase', 'inspect'];
const DIR_GLYPH = ['↑', '→', '↓', '←'];
const ICON_KEY: Record<Tool, string> = {
  miner: 'miner', conveyor: 'conveyor', smelter: 'smelter', storage: 'storage',
  generator: 'generator', assembler: 'assembler', lab: 'lab', blueprint: 'blueprint', erase: 'erase', inspect: 'inspect',
};
const labelOf = (t: Tool) =>
  t === 'erase' ? 'Erase'
  : t === 'inspect' ? 'Info'
  : t === 'blueprint' ? 'Blueprint'
  : DEFS[t].label;

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
    if (t !== 'erase' && t !== 'inspect' && t !== 'blueprint') {
      const cost = document.createElement('span');
      cost.className = 'dw-cost';
      cost.textContent = String(BUILD_COSTS[t].amount);
      b.append(cost);
      const lockOverlay = document.createElement('span');
      lockOverlay.className = 'dw-lock';
      lockOverlay.style.display = 'none';
      lockOverlay.append(svgEl('lock'));
      b.append(lockOverlay);
    }
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
  const researchBtn = ctrl('Research', () => cb.researchToggle());
  const settingsBtn = ctrl('⚙ Settings', () => cb.settingsToggle());
  dock.append(dirBtn, viewBtn, pauseBtn, speedBtn, explainBtn, researchBtn, settingsBtn, resetBtn);

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
    setUnlocked(unlocked) {
      for (const [t, b] of tileMap) {
        if (t === 'erase' || t === 'inspect' || t === 'blueprint') continue;
        const isUnlocked = unlocked.includes(t);
        b.classList.toggle('locked', !isUnlocked);
        const lockEl = b.querySelector<HTMLElement>('.dw-lock');
        if (lockEl) lockEl.style.display = isUnlocked ? 'none' : 'grid';
      }
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
