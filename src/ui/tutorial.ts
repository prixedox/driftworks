import type { ModuleType, Snapshot } from '../sim/types';
import { DEFS } from '../sim/types';
import { TECHS } from '../sim/data';

// ── Step model ────────────────────────────────────────────────────────────────
//
// `done(curr, entry)` — entry is the snapshot captured when the step BECAME
// active (its baseline), not the immediately-previous tick. This makes "place X"
// steps robust to the demo base that loadDemo() pre-places: a step completes
// only when the player adds a NEW machine (count grows past the baseline), never
// because a machine already existed at step start.

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  spotlight: 'hotbar-miner' | 'hotbar-conveyor' | 'hotbar-smelter' | 'hotbar-storage'
           | 'hotbar-generator' | 'canvas' | 'research-btn' | 'none';
  done: (curr: Snapshot, entry: Snapshot) => boolean;
}

const count = (s: Snapshot, type: ModuleType): number =>
  s.modules.reduce((n, m) => (m.type === type ? n + 1 : n), 0);

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'place_miner',
    title: 'Mine some ore',
    body: `Select the ${DEFS.miner.label} tool (key 1) and tap an ore rock to place one.`,
    spotlight: 'hotbar-miner',
    done: (c, e) => count(c, 'miner') > count(e, 'miner'),
  },
  {
    id: 'place_belt',
    title: 'Lay a Belt',
    body: `Select the ${DEFS.conveyor.label} tool (key 2) and drag from the Miner to carry its ore.`,
    spotlight: 'hotbar-conveyor',
    done: (c, e) => count(c, 'conveyor') > count(e, 'conveyor'),
  },
  {
    id: 'research_smelting',
    title: 'Research Smelting',
    body: `Open Research and complete "${TECHS.find((t) => t.id === 'smelting')!.name}". It costs 20 ore — contribute from your inventory.`,
    spotlight: 'research-btn',
    done: (c) => c.research.completed.includes('smelting'),
  },
  {
    id: 'place_smelter',
    title: 'Place a Smelter',
    body: `Smelting is unlocked. Place a ${DEFS.smelter.label} at the end of a belt to turn ore into plates.`,
    spotlight: 'hotbar-smelter',
    done: (c, e) => count(c, 'smelter') > count(e, 'smelter'),
  },
  {
    id: 'place_storage',
    title: 'Add Storage',
    body: `Place a ${DEFS.storage.label} at the belt's end to collect finished plates.`,
    spotlight: 'hotbar-storage',
    done: (c, e) => count(c, 'storage') > count(e, 'storage'),
  },
  {
    id: 'collect_plate',
    title: 'Collect a Plate',
    body: `Walk near a ${DEFS.storage.label} box — you auto-collect whatever is inside.`,
    spotlight: 'canvas',
    done: (c, e) => (c.inventory.plate ?? 0) > (e.inventory.plate ?? 0),
  },
  {
    id: 'research_power',
    title: 'Research Power',
    body: `Open Research and complete "${TECHS.find((t) => t.id === 'power')!.name}" to unlock the Generator.`,
    spotlight: 'research-btn',
    done: (c) => c.research.completed.includes('power'),
  },
  {
    id: 'place_generator',
    title: 'Power your factory',
    body: `Place a ${DEFS.generator.label} to generate electricity — machines need power to run.`,
    spotlight: 'hotbar-generator',
    done: (c, e) => count(c, 'generator') > count(e, 'generator'),
  },
];

// ── Controller interface ──────────────────────────────────────────────────────

export interface TutorialController {
  tick(curr: Snapshot, prev: Snapshot | null): void;
  active(): boolean;
  replay(): void;
}

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_DONE = 'driftworks.tutorial.done';
const LS_STEP = 'driftworks.tutorial.step';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* quota or private mode */ }
}
function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/** Resolve a spotlight target to a live DOM rect (or null to hide the ring). */
function resolveSpotlightRect(spotlight: TutorialStep['spotlight']): DOMRect | null {
  if (spotlight === 'none') return null;
  if (spotlight === 'canvas') {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2 - 60;
    return new DOMRect(cx - 80, cy - 60, 160, 120);
  }
  if (spotlight.startsWith('hotbar-')) {
    const tool = spotlight.slice('hotbar-'.length) as ModuleType;
    // Tiles carry title={DEFS[tool].label} (hotbar.ts) — the single source of truth.
    const label = DEFS[tool]?.label;
    const btn = label ? document.querySelector<HTMLElement>(`.dw-tile[title="${label}"]`) : null;
    return btn ? btn.getBoundingClientRect() : null;
  }
  if (spotlight === 'research-btn') {
    const btn = Array.from(document.querySelectorAll<HTMLElement>('.dw-ctrl')).find(
      (b) => b.textContent?.trim() === 'Research',
    );
    return btn ? btn.getBoundingClientRect() : null;
  }
  return null;
}

// ── buildTutorial ─────────────────────────────────────────────────────────────

export function buildTutorial(root: HTMLElement): TutorialController {
  let stepIdx = 0;
  let isDone = lsGet(LS_DONE) === '1';
  let entrySnap: Snapshot | null = null; // baseline captured when the current step became active

  const savedStep = parseInt(lsGet(LS_STEP) ?? '0', 10);
  if (!isDone && savedStep > 0 && savedStep < TUTORIAL_STEPS.length) stepIdx = savedStep;

  const overlay = el('div', 'dw-tut-root');
  overlay.setAttribute('aria-live', 'polite');

  const spotlight = el('div', 'dw-tut-spotlight');
  overlay.append(spotlight);

  const panel = el('div', 'dw-tut-panel dw-panel');
  const stepNum = el('div', 'dw-tut-step-num');
  const titleEl = el('div', 'dw-tut-title');
  const bodyEl = el('div', 'dw-tut-body');
  const actions = el('div', 'dw-tut-actions');
  const skipBtn = el('button', 'dw-tut-skip');
  skipBtn.textContent = 'Skip tutorial';
  skipBtn.type = 'button';
  const nextBtn = el('button', 'dw-tut-next dw-btn');
  nextBtn.textContent = 'Got it';
  nextBtn.type = 'button';
  actions.append(skipBtn, nextBtn);
  panel.append(stepNum, titleEl, bodyEl, actions);
  overlay.append(panel);

  const completeCard = el('div', 'dw-tut-complete dw-panel');
  completeCard.innerHTML = `<div class="dw-tut-complete-title">Tutorial complete!</div>
    <div class="dw-tut-complete-body">You know the core loop. Now build something bigger.</div>`;
  const replayBtn = el('button', 'dw-btn dw-tut-replay');
  replayBtn.textContent = 'Replay tutorial';
  replayBtn.type = 'button';
  completeCard.append(replayBtn);
  overlay.append(completeCard);

  root.append(overlay);

  // Always-visible objective chip.
  const chip = el('div', 'dw-obj-chip dw-panel');
  const chipLabel = el('span', 'dw-obj-label');
  const chipText = el('span', 'dw-obj-text');
  chip.append(chipLabel, chipText);
  root.append(chip);
  chipLabel.textContent = 'NEXT';

  const setSpotlight = (step: TutorialStep) => {
    const rect = resolveSpotlightRect(step.spotlight);
    if (!rect || step.spotlight === 'none') { spotlight.style.display = 'none'; return; }
    const pad = 10;
    spotlight.style.display = 'block';
    spotlight.style.left = `${rect.left - pad}px`;
    spotlight.style.top = `${rect.top - pad}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;
  };

  const renderStep = () => {
    if (isDone) {
      overlay.classList.add('dw-tut-hidden');
      spotlight.style.display = 'none';
      chipText.textContent = 'Research more tech';
      return;
    }
    overlay.classList.remove('dw-tut-hidden');
    completeCard.classList.remove('show');
    const step = TUTORIAL_STEPS[stepIdx];
    stepNum.textContent = `Step ${stepIdx + 1} / ${TUTORIAL_STEPS.length}`;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    setSpotlight(step);
    chipText.textContent = step.title;
    lsSet(LS_STEP, String(stepIdx));
  };

  /** Advance to the next step. `curr` (if given) becomes the new step's baseline. */
  const advance = (curr: Snapshot | null) => {
    stepIdx++;
    entrySnap = curr; // null → re-captured on the next tick
    if (stepIdx >= TUTORIAL_STEPS.length) {
      isDone = true;
      lsSet(LS_DONE, '1');
      lsRemove(LS_STEP);
      overlay.classList.add('dw-tut-hidden');
      completeCard.classList.add('show');
      spotlight.style.display = 'none';
      chipText.textContent = 'Research more tech';
      return;
    }
    renderStep();
  };

  const skip = () => {
    isDone = true;
    lsSet(LS_DONE, '1');
    lsRemove(LS_STEP);
    overlay.classList.add('dw-tut-hidden');
    const remaining = TUTORIAL_STEPS.slice(stepIdx);
    chipText.textContent = remaining.length > 0 ? remaining[0].title : 'Research more tech';
  };

  const replay = () => {
    isDone = false;
    stepIdx = 0;
    entrySnap = null;
    lsRemove(LS_DONE);
    lsSet(LS_STEP, '0');
    completeCard.classList.remove('show');
    overlay.classList.remove('dw-tut-hidden');
    renderStep();
  };

  skipBtn.addEventListener('click', skip);
  nextBtn.addEventListener('click', () => { if (!isDone) advance(null); });
  replayBtn.addEventListener('click', replay);

  window.addEventListener('resize', () => {
    if (!isDone && stepIdx < TUTORIAL_STEPS.length) setSpotlight(TUTORIAL_STEPS[stepIdx]);
  });

  // Deferred one frame so the hotbar DOM exists for spotlight resolution.
  requestAnimationFrame(() => {
    if (!isDone) renderStep();
    else {
      overlay.classList.add('dw-tut-hidden');
      chipText.textContent = 'Research more tech';
    }
  });

  return {
    tick(curr: Snapshot) {
      if (isDone) {
        const done = new Set(curr.research.completed);
        const next = TECHS.find((t) => !done.has(t.id) && t.prereqs.every((p) => done.has(p)));
        chipText.textContent = next ? `Research: ${next.name}` : 'Build the Ark';
        return;
      }
      if (!entrySnap) { entrySnap = curr; return; } // capture baseline, complete no earlier than next tick
      const step = TUTORIAL_STEPS[stepIdx];
      if (step.done(curr, entrySnap)) advance(curr);
    },
    active() { return !isDone; },
    replay,
  };
}
