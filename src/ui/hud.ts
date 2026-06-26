import type { Dir, Snapshot } from '../sim/types';
import { buildStatusBar } from './statusbar';
import { buildHotbar, type Tool } from './hotbar';
import { buildInspector, type InspectRow } from './inspector';
import { buildJoystick } from './joystick';
import { buildToasts } from './toasts';
import { buildResearch } from './research';

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
  selectResearch: (tech: string) => void;
  contributeResearch: () => void;
}
export interface Hud {
  setStats: (s: Snapshot) => void;
  setResearch: (s: Snapshot) => void;
  setDir: (d: Dir) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (ms: number) => void;
  showInspect: (title: string, rows: InspectRow[]) => void;
  hideInspect: () => void;
  pushToast: (text: string, kind?: 'info' | 'warn') => void;
}

export function buildHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const status = buildStatusBar(root);
  const research = buildResearch(root, { select: cb.selectResearch, contribute: cb.contributeResearch });
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
    researchToggle: () => research.toggle(),
  });
  hotbar.setActive('conveyor');
  const inspector = buildInspector(root, cb.closeInspect);
  buildJoystick(root, cb.move);
  const toasts = buildToasts(root);

  const hint = document.createElement('div');
  hint.className = 'dw-hint';
  hint.textContent = 'Walk: WASD / stick · rotate view: Q / E · 1–7 tools · tap to build · 🔍 inspect';
  root.append(hint);

  return {
    setStats: (s) => { status.update(s); hotbar.setUnlocked(s.unlocked); },
    setResearch: (s) => research.update(s),
    setDir: (d) => hotbar.setDir(d),
    setPaused: (p) => hotbar.setPaused(p),
    setSpeed: (ms) => hotbar.setSpeed(ms),
    showInspect: (t, rows) => inspector.show(t, rows),
    hideInspect: () => inspector.hide(),
    pushToast: (text, kind) => toasts.push(text, kind),
  };
}
