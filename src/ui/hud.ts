import type { Dir, Snapshot } from '../sim/types';
import { buildStatusBar } from './statusbar';
import { buildHotbar, type Tool } from './hotbar';
import { buildInspector, type InspectRow } from './inspector';
import { buildJoystick } from './joystick';
import { buildToasts } from './toasts';
import { buildResearch } from './research';
import { buildSettings } from './settings';
import type { QualityOpts } from '../settings';
import { buildStats, type SparklineHistory } from './stats';
import { buildMinimap } from './minimap';

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
  /** Forward-compat hook for recipe changes; inspector rows currently call the sim directly. */
  selectRecipe: (cell: number, recipe: string) => void;
  applyQuality: (opts: QualityOpts) => void;
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
  initSettings: (opts: QualityOpts) => void;
  setStatsHistory: (s: Snapshot, history: SparklineHistory) => void;
  updateMinimap: (s: Snapshot, px: number, py: number) => void;
}

export function buildHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const status = buildStatusBar(root);
  const research = buildResearch(root, { select: cb.selectResearch, contribute: cb.contributeResearch });
  const settings = buildSettings(root, { apply: cb.applyQuality });
  const statsPanel = buildStats(root);
  const minimap = buildMinimap(root);
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
    settingsToggle: () => settings.toggle(),
    statsToggle: () => statsPanel.toggle(),
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
    initSettings: (opts) => settings.update(opts),
    setStatsHistory: (s, history) => statsPanel.update(s, history),
    updateMinimap: (s, px, py) => minimap.update(s, px, py),
  };
}
