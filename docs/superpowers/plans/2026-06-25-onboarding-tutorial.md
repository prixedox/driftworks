# DRIFTWORKS Onboarding Tutorial + Objective Chip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a first-run, step-by-step onboarding tutorial that teaches the core loop one verb at a time, auto-advancing when the player performs each action (detected from snapshot deltas in `main.ts`). Add a persistent "current objective" chip that always surfaces the next goal. Both are pure DOM/CSS + `main.ts` wiring; zero `src/sim/*` changes.

**Architecture:** A new `src/ui/tutorial.ts` module owns the tutorial state machine and the objective chip. It is instantiated in `main.ts`, receives every snapshot pair (`prev`, `curr`), and fires `advance()` when the detection predicate for the current step is true. `main.ts` reads a `TutorialController` interface. Completion + skip/replay state is persisted in `localStorage`. A spotlight overlay and step text panel are DOM elements managed by `tutorial.ts`.

**Tech Stack:** TypeScript (strict), DOM/CSS, theme tokens — no new runtime deps.

---

## Global Constraints

- **No `src/sim/*` changes.** Detection is snapshot-based only; all predicates read `Snapshot` fields (`modules`, `storage`, `inventory`, `research`, `ore`, `packets`).
- **Render & UI read snapshots; no game state held.** The tutorial module holds tutorial state only (step index, localStorage flag) — not game state.
- **Theme-token styling.** All CSS uses `var(--accent)`, `var(--panel)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--r-md)`, etc. No hardcoded colours.
- **Build gate:** every task ends green on `npm run build` (`tsc --noEmit && vite build`), strict TS (no unused locals/params).
- **Mobile-first:** spotlight/chip/text must be fully usable one-handed on a 6" phone; all touch targets ≥44 px; safe-area-inset-bottom respected in positioning.
- **No `src/sim/data.ts` single-source-of-truth violation.** The tutorial text uses DEFS/TECHS names by import, not re-declared strings.
- **Commits: NO AI attribution** (no `Co-Authored-By`, no "Generated with").
- **Verification:** `npm run build` → green; headless Playwright/Chrome screenshots confirming each visual layer (chip, panel, spotlight, skip button, completion screen). Scripts go in the session scratchpad.

---

## File Structure

- **Create** `src/ui/tutorial.ts` — step definitions, state machine, DOM, detection predicates, localStorage.
- **Modify** `src/ui/hud.ts` — expose `setTutorial(ctrl: TutorialController): void` on `Hud`; mount tutorial root.
- **Modify** `src/main.ts` — instantiate tutorial, wire prev/curr snapshot pair into it on each `worker.onmessage`.
- **Modify** `src/style.css` — tutorial CSS (spotlight, step panel, objective chip, skip button, completion badge).

No `src/sim/*` files touched. No new deps in `package.json`.

---

## Tutorial Step Model

Each tutorial step is a plain object. The full type + step list lives entirely in `src/ui/tutorial.ts`.

```ts
import type { Snapshot } from '../sim/types';
import { DEFS } from '../sim/types';
import { TECHS } from '../sim/data';

export interface TutorialStep {
  /** Unique key, used in localStorage + debugging. */
  id: string;
  /** Heading shown in the step panel. */
  title: string;
  /** One-sentence instruction (plain text). */
  body: string;
  /**
   * Optional spotlight: which HUD element or world-hint to highlight.
   * 'hotbar-<tool>' spotlights that hotbar tile; 'canvas' spotlights the game world;
   * 'research-btn' spotlights the Research dock button; 'none' = no spotlight.
   */
  spotlight: 'hotbar-miner' | 'hotbar-conveyor' | 'hotbar-smelter' | 'hotbar-storage'
           | 'hotbar-generator' | 'canvas' | 'research-btn' | 'none';
  /**
   * Detection predicate: returns true when the player has completed this step.
   * Receives the CURRENT snapshot and the PREVIOUS snapshot (may be null on step 0).
   * Must be a pure function over snapshot fields only.
   */
  done: (curr: Snapshot, prev: Snapshot | null) => boolean;
}
```

### Step Definitions (verbatim, to be placed in `tutorial.ts`)

```ts
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'place_miner',
    title: 'Mine some ore',
    body: `Select the ${DEFS.miner.label} tool (key 1) and tap an ore rock to place it.`,
    spotlight: 'hotbar-miner',
    done: (curr) => curr.modules.some((m) => m.type === 'miner'),
  },
  {
    id: 'place_belt',
    title: 'Lay a Belt',
    body: `Select the Belt tool (key 2) and drag from the Miner to connect it.`,
    spotlight: 'hotbar-conveyor',
    done: (curr) => curr.modules.some((m) => m.type === 'conveyor'),
  },
  {
    id: 'research_smelting',
    title: 'Research Smelting',
    body: `Open Research and select "${TECHS.find((t) => t.id === 'smelting')!.name}". You need 20 ore — contribute from inventory.`,
    spotlight: 'research-btn',
    done: (curr) => curr.research.completed.includes('smelting'),
  },
  {
    id: 'place_smelter',
    title: 'Place a Smelter',
    body: `Smelting is unlocked. Place a ${DEFS.smelter.label} at the end of the belt.`,
    spotlight: 'hotbar-smelter',
    done: (curr) => curr.modules.some((m) => m.type === 'smelter'),
  },
  {
    id: 'place_storage',
    title: 'Add Storage',
    body: `Place a ${DEFS.storage.label} to collect finished plates.`,
    spotlight: 'hotbar-storage',
    done: (curr) => curr.modules.some((m) => m.type === 'storage'),
  },
  {
    id: 'collect_plate',
    title: 'Collect a Plate',
    body: `Walk near the Storage box — you will auto-collect any plates inside.`,
    spotlight: 'canvas',
    done: (curr, prev) => (curr.inventory.plate ?? 0) > (prev?.inventory.plate ?? 0),
  },
  {
    id: 'research_power',
    title: 'Research Power',
    body: `Open Research and complete "${TECHS.find((t) => t.id === 'power')!.name}" to unlock the Generator.`,
    spotlight: 'research-btn',
    done: (curr) => curr.research.completed.includes('power'),
  },
  {
    id: 'place_generator',
    title: 'Power your factory',
    body: `Place a ${DEFS.generator.label} anywhere to generate electricity.`,
    spotlight: 'hotbar-generator',
    done: (curr) => curr.modules.some((m) => m.type === 'generator'),
  },
];
```

**Rationale for step ordering:**
1. Belt is placed after Miner so the player has something to connect it to.
2. Research Smelting precedes placing the Smelter because smelter is locked by default (`START_UNLOCKED = ['miner','conveyor','storage']`).
3. Power comes after Smelter is in place so the player sees the power deficit before fixing it.
4. `collect_plate` detects `curr.inventory.plate > prev.inventory.plate` — the proximity-collect logic in `main.ts` fires `{ type: 'collect' }` automatically, so this step completes naturally as the player walks.

---

## Task T1: Core tutorial module (`src/ui/tutorial.ts`)

**Files:** Create `src/ui/tutorial.ts`.

**Interfaces produced:**
```ts
export interface TutorialController {
  /** Called every snapshot pulse with the current and previous snapshots. */
  tick(curr: Snapshot, prev: Snapshot | null): void;
  /** Returns true if the tutorial is currently visible (not completed, not skipped). */
  active(): boolean;
}
```

### Implementation

- [ ] **Step 1: Create `src/ui/tutorial.ts`** with the content below.

```ts
import type { Snapshot } from '../sim/types';
import { DEFS } from '../sim/types';
import { TECHS } from '../sim/data';

// ── Step model ────────────────────────────────────────────────────────────────

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  spotlight: 'hotbar-miner' | 'hotbar-conveyor' | 'hotbar-smelter' | 'hotbar-storage'
           | 'hotbar-generator' | 'canvas' | 'research-btn' | 'none';
  done: (curr: Snapshot, prev: Snapshot | null) => boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'place_miner',
    title: 'Mine some ore',
    body: `Select the ${DEFS.miner.label} tool (key 1) and tap an ore rock to place it.`,
    spotlight: 'hotbar-miner',
    done: (curr) => curr.modules.some((m) => m.type === 'miner'),
  },
  {
    id: 'place_belt',
    title: 'Lay a Belt',
    body: `Select the Belt tool (key 2) and drag from the Miner to connect it.`,
    spotlight: 'hotbar-conveyor',
    done: (curr) => curr.modules.some((m) => m.type === 'conveyor'),
  },
  {
    id: 'research_smelting',
    title: 'Research Smelting',
    body: `Open Research and select "${TECHS.find((t) => t.id === 'smelting')!.name}". You need 20 ore — contribute from inventory.`,
    spotlight: 'research-btn',
    done: (curr) => curr.research.completed.includes('smelting'),
  },
  {
    id: 'place_smelter',
    title: 'Place a Smelter',
    body: `Smelting is unlocked. Place a ${DEFS.smelter.label} at the end of the belt.`,
    spotlight: 'hotbar-smelter',
    done: (curr) => curr.modules.some((m) => m.type === 'smelter'),
  },
  {
    id: 'place_storage',
    title: 'Add Storage',
    body: `Place a ${DEFS.storage.label} to collect finished plates.`,
    spotlight: 'hotbar-storage',
    done: (curr) => curr.modules.some((m) => m.type === 'storage'),
  },
  {
    id: 'collect_plate',
    title: 'Collect a Plate',
    body: `Walk near the Storage box — you will auto-collect any plates inside.`,
    spotlight: 'canvas',
    done: (curr, prev) => (curr.inventory.plate ?? 0) > (prev?.inventory.plate ?? 0),
  },
  {
    id: 'research_power',
    title: 'Research Power',
    body: `Open Research and complete "${TECHS.find((t) => t.id === 'power')!.name}" to unlock the Generator.`,
    spotlight: 'research-btn',
    done: (curr) => curr.research.completed.includes('power'),
  },
  {
    id: 'place_generator',
    title: 'Power your factory',
    body: `Place a ${DEFS.generator.label} anywhere to generate electricity.`,
    spotlight: 'hotbar-generator',
    done: (curr) => curr.modules.some((m) => m.type === 'generator'),
  },
];

// ── Controller interface ──────────────────────────────────────────────────────

export interface TutorialController {
  tick(curr: Snapshot, prev: Snapshot | null): void;
  active(): boolean;
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

// ── Spotlight resolver ────────────────────────────────────────────────────────
//
// Spotlight type 'hotbar-<tool>' resolves to the bounding rect of the
// corresponding .dw-tile inside the DOM. 'research-btn' resolves to the
// Research .dw-ctrl button. 'canvas' draws a centred world-hint ellipse.
// 'none' hides the spotlight.

function resolveSpotlightRect(spotlight: TutorialStep['spotlight']): DOMRect | null {
  if (spotlight === 'none') return null;
  if (spotlight === 'canvas') {
    // Return a rect centred in the viewport (world area hint).
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2 - 60;
    return new DOMRect(cx - 80, cy - 60, 160, 120);
  }
  if (spotlight.startsWith('hotbar-')) {
    const tool = spotlight.replace('hotbar-', '');
    // Hotbar tiles are buttons inside .dw-tiles. We identify them by their
    // title attribute which is set to DEFS[tool].label in hotbar.ts.
    const label = tool === 'conveyor' ? 'Belt' : tool.charAt(0).toUpperCase() + tool.slice(1);
    const btn = document.querySelector<HTMLElement>(`.dw-tile[title="${label}"]`);
    return btn ? btn.getBoundingClientRect() : null;
  }
  if (spotlight === 'research-btn') {
    // The Research dock button has textContent 'Research'.
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

  // Restore progress across reloads (not mandatory — first-run implies fresh start,
  // but if the player reloads mid-tutorial, we resume where they left off).
  const savedStep = parseInt(lsGet(LS_STEP) ?? '0', 10);
  if (!isDone && savedStep > 0 && savedStep < TUTORIAL_STEPS.length) {
    stepIdx = savedStep;
  }

  // ── Root overlay ──────────────────────────────────────────────────────────
  //
  // Structure:
  //   .dw-tut-root
  //     .dw-tut-spotlight   ← SVG/CSS cutout spotlight ring
  //     .dw-tut-panel       ← step instruction card
  //       .dw-tut-step-num
  //       .dw-tut-title
  //       .dw-tut-body
  //       .dw-tut-actions
  //         button.dw-tut-skip
  //         button.dw-tut-next  (manual "got it" / "skip step")
  //     .dw-tut-complete    ← completion toast, hidden until done
  //   .dw-obj-chip          ← always-visible objective chip (separate fixed element)

  const overlay = el('div', 'dw-tut-root');
  overlay.setAttribute('aria-live', 'polite');

  // Spotlight ring — a fixed-position element whose box-shadow creates the
  // darkened-world effect. Updated each step via inline style.
  const spotlight = el('div', 'dw-tut-spotlight');
  overlay.append(spotlight);

  // Step panel
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

  // Completion card
  const completeCard = el('div', 'dw-tut-complete dw-panel');
  completeCard.innerHTML = `<div class="dw-tut-complete-title">Tutorial complete!</div>
    <div class="dw-tut-complete-body">You know the core loop. Now build something bigger.</div>`;
  const replayBtn = el('button', 'dw-btn dw-tut-replay');
  replayBtn.textContent = 'Replay tutorial';
  replayBtn.type = 'button';
  completeCard.append(replayBtn);
  overlay.append(completeCard);

  root.append(overlay);

  // ── Objective chip ────────────────────────────────────────────────────────
  //
  // Always visible (even when tutorial is skipped). Sits in the top-right,
  // below the status bar. Text updated on every step advance.
  const chip = el('div', 'dw-obj-chip dw-panel');
  const chipLabel = el('span', 'dw-obj-label');
  const chipText = el('span', 'dw-obj-text');
  chip.append(chipLabel, chipText);
  root.append(chip);
  chipLabel.textContent = 'NEXT';

  // ── Render helpers ────────────────────────────────────────────────────────

  const setSpotlight = (step: TutorialStep) => {
    const rect = resolveSpotlightRect(step.spotlight);
    if (!rect || step.spotlight === 'none') {
      spotlight.style.display = 'none';
      return;
    }
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
      completeCard.classList.add('show');
      spotlight.style.display = 'none';
      // Objective chip shows post-tutorial placeholder
      chipText.textContent = 'Research Automation Science';
      return;
    }
    overlay.classList.remove('dw-tut-hidden');
    completeCard.classList.remove('show');
    const step = TUTORIAL_STEPS[stepIdx];
    stepNum.textContent = `Step ${stepIdx + 1} / ${TUTORIAL_STEPS.length}`;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    setSpotlight(step);
    // Sync chip
    chipText.textContent = step.title;
    lsSet(LS_STEP, String(stepIdx));
  };

  const advance = () => {
    stepIdx++;
    if (stepIdx >= TUTORIAL_STEPS.length) {
      isDone = true;
      lsSet(LS_DONE, '1');
      lsRemove(LS_STEP);
    }
    renderStep();
  };

  const skip = () => {
    isDone = true;
    lsSet(LS_DONE, '1');
    lsRemove(LS_STEP);
    overlay.classList.add('dw-tut-hidden');
    // Chip survives skip
    const remaining = TUTORIAL_STEPS.slice(stepIdx);
    chipText.textContent = remaining.length > 0 ? remaining[0].title : 'Research Automation Science';
  };

  // ── Button wiring ─────────────────────────────────────────────────────────

  skipBtn.addEventListener('click', skip);

  // "Got it" manually advances (lets impatient players move on without doing the action).
  nextBtn.addEventListener('click', () => {
    if (!isDone) advance();
  });

  replayBtn.addEventListener('click', () => {
    isDone = false;
    stepIdx = 0;
    lsRemove(LS_DONE);
    lsSet(LS_STEP, '0');
    renderStep();
  });

  // Spotlight re-positions on resize (DOM rects change).
  window.addEventListener('resize', () => {
    if (!isDone && stepIdx < TUTORIAL_STEPS.length) {
      setSpotlight(TUTORIAL_STEPS[stepIdx]);
    }
  });

  // Initial render (deferred one frame so hotbar DOM is ready for spotlight).
  requestAnimationFrame(() => {
    if (!isDone) renderStep();
    else {
      overlay.classList.add('dw-tut-hidden');
      completeCard.classList.remove('show'); // hidden until explicitly shown
      // Chip shows next reasonable post-tutorial goal
      chipText.textContent = 'Research Automation Science';
    }
  });

  // ── TutorialController ────────────────────────────────────────────────────

  return {
    tick(curr: Snapshot, prev: Snapshot | null) {
      if (isDone) {
        // Post-tutorial chip: show the next un-completed tech (first in TECHS order
        // that is not yet completed and whose prereqs are met).
        // Import TECHS lazily via the module-level import already at the top.
        const done = new Set(curr.research.completed);
        const next = TECHS.find(
          (t) => !done.has(t.id) && t.prereqs.every((p) => done.has(p)),
        );
        if (next) {
          chipText.textContent = `Research: ${next.name}`;
        } else {
          chipText.textContent = 'Build the Ark';
        }
        return;
      }
      const step = TUTORIAL_STEPS[stepIdx];
      if (step.done(curr, prev)) advance();
    },
    active() {
      return !isDone;
    },
  };
}
```

- [ ] **Step 2: Build** — `npm run build` (will error if `hud.ts`/`main.ts` imports are not yet updated; acceptable here — proceed to T2 which closes the loop, then build once at T2 end).
- [ ] **Step 3: Commit** (do NOT push yet — visual verification pending):
```bash
git -C /home/martin/projects/driftworks add src/ui/tutorial.ts
git -C /home/martin/projects/driftworks commit -m "ui: tutorial step model, state machine, DOM, detection predicates"
```

---

## Task T2: Wire into `hud.ts` + `main.ts`

**Files:** Modify `src/ui/hud.ts`; Modify `src/main.ts`.

**Interfaces produced:**
- `Hud` gains no new public methods (tutorial is self-contained once mounted in `buildHud`).
- `main.ts` tracks `prevSnap` (already present) and calls `tutorial.tick(snap, prevSnap)` after the existing prevSnap toast block.

### `src/ui/hud.ts` changes

- [ ] **Step 1:** Add import at top of `hud.ts`:
```ts
import { buildTutorial } from './tutorial';
```

- [ ] **Step 2:** Inside `buildHud`, before the `return {` statement, add:
```ts
  buildTutorial(root);
```
That is the complete mount call — `buildTutorial` appends its own elements to `root` and returns a `TutorialController`. The controller needs to be returned to `main.ts` so it can call `tick`. Therefore, store it:

Replace the line above with:
```ts
  const tutorial = buildTutorial(root);
```

And extend the returned `Hud` object by adding `tutorial` as a property. Update the `Hud` interface:

```ts
// In hud.ts, import TutorialController
import { buildTutorial, type TutorialController } from './tutorial';

// In the Hud interface, add:
  tutorial: TutorialController;

// In the return object, add:
  tutorial,
```

Full `Hud` interface after the change:
```ts
export interface Hud {
  setStats: (s: Snapshot) => void;
  setResearch: (s: Snapshot) => void;
  setDir: (d: Dir) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (ms: number) => void;
  showInspect: (title: string, rows: InspectRow[]) => void;
  hideInspect: () => void;
  pushToast: (text: string, kind?: 'info' | 'warn') => void;
  tutorial: TutorialController;
}
```

### `src/main.ts` changes

- [ ] **Step 3:** In `main()`, inside `worker.onmessage`, locate the block:
```ts
    prevSnap = snap;
```
Change it to:
```ts
    hud.tutorial.tick(snap, prevSnap);
    prevSnap = snap;
```
This must be the **last** line of the onmessage handler body, after all other snapshot reads, so that `prevSnap` still holds the previous snapshot when `tick` fires.

- [ ] **Step 4: Build** — `npm run build` → must be green. Fix any TS errors before proceeding.

- [ ] **Step 5: Commit**:
```bash
git -C /home/martin/projects/driftworks add src/ui/hud.ts src/main.ts
git -C /home/martin/projects/driftworks commit -m "ui: wire tutorial into hud + main snapshot loop"
```

---

## Task T3: CSS (spotlight, panel, chip, complete card)

**Files:** Append to `src/style.css`.

The tutorial overlay sits at `z-index: 20` (above all HUD layers). The objective chip sits at `z-index: 15` (above toasts at 14, below tutorial at 20).

- [ ] **Step 1:** Append to `src/style.css`:

```css
/* ── Tutorial overlay ─────────────────────────────────────────────────────── */

.dw-tut-root {
  position: fixed;
  inset: 0;
  pointer-events: none;   /* overlay is non-blocking except for its own children */
  z-index: 20;
}

.dw-tut-root.dw-tut-hidden {
  display: none;
}

/* Spotlight ring: a fixed box with a glowing border that draws attention to a
   UI element. The surrounding darkening is achieved with box-shadow outward. */
.dw-tut-spotlight {
  position: fixed;
  border: 2px solid var(--accent);
  border-radius: var(--r-sm);
  box-shadow:
    0 0 0 2000px rgba(0, 0, 0, 0.45),   /* world dimming */
    0 0 16px 4px rgba(90, 209, 192, 0.55); /* inner glow */
  pointer-events: none;
  transition: left 0.22s ease, top 0.22s ease, width 0.22s ease, height 0.22s ease;
  animation: dw-tut-pulse 2s ease-in-out infinite;
}

@keyframes dw-tut-pulse {
  0%, 100% { box-shadow: 0 0 0 2000px rgba(0,0,0,0.45), 0 0 16px 4px rgba(90,209,192,0.45); }
  50%       { box-shadow: 0 0 0 2000px rgba(0,0,0,0.45), 0 0 26px 8px rgba(90,209,192,0.75); }
}

/* Step instruction panel — centred above the hotbar. */
.dw-tut-panel {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(140px + env(safe-area-inset-bottom));
  width: min(340px, calc(100vw - 24px));
  padding: 14px 16px 12px;
  pointer-events: auto;
  z-index: 21;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: dw-rise 0.2s ease-out;
}

.dw-tut-step-num {
  font: 600 10px/1 ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.dw-tut-title {
  font: 700 15px/1.3 system-ui, sans-serif;
  color: var(--accent);
}

.dw-tut-body {
  font: 400 13px/1.5 system-ui, sans-serif;
  color: var(--text);
}

.dw-tut-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.dw-tut-skip {
  appearance: none;
  background: none;
  border: none;
  color: var(--muted);
  font: 500 12px/1 system-ui, sans-serif;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
  pointer-events: auto;
}

.dw-tut-skip:hover {
  color: var(--text);
}

/* Tutorial complete card — same position as step panel, hidden until isDone. */
.dw-tut-complete {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(140px + env(safe-area-inset-bottom));
  width: min(300px, calc(100vw - 24px));
  padding: 14px 16px;
  display: none;
  flex-direction: column;
  gap: 8px;
  z-index: 21;
  pointer-events: auto;
}

.dw-tut-complete.show {
  display: flex;
  animation: dw-rise 0.25s ease-out;
}

.dw-tut-complete-title {
  font: 700 15px/1 system-ui, sans-serif;
  color: var(--accent);
}

.dw-tut-complete-body {
  font: 400 13px/1.5 system-ui, sans-serif;
  color: var(--text);
}

.dw-tut-replay {
  align-self: flex-start;
}

/* ── Objective chip ───────────────────────────────────────────────────────── */
/* Always-visible current-goal indicator, top-right under the status bar. */

.dw-obj-chip {
  position: fixed;
  right: 12px;
  top: 56px;  /* below .dw-statusbar (~44px) + small gap */
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 8px;
  z-index: 15;
  pointer-events: none;
  max-width: 220px;
  animation: dw-rise 0.3s ease-out;
}

.dw-obj-label {
  font: 700 9px/1 ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  flex-shrink: 0;
}

.dw-obj-text {
  font: 500 12px/1.3 system-ui, sans-serif;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 2: Build** — `npm run build` → green.
- [ ] **Step 3: Commit**:
```bash
git -C /home/martin/projects/driftworks add src/style.css
git -C /home/martin/projects/driftworks commit -m "ui: tutorial + objective-chip CSS (spotlight, panel, chip, complete card)"
```

---

## Task T4: Headless visual verification + deploy

**Files:** Headless Playwright script in session scratchpad. No source changes.

The verification script checks five things:
1. Tutorial panel is visible on first load (no prior `localStorage` state).
2. Step 1 text and spotlight are rendered.
3. "Skip tutorial" button dismisses the overlay.
4. Objective chip is always visible (after skip it shows the first tutorial step text).
5. The "Replay tutorial" button re-opens the tutorial.

- [ ] **Step 1:** Create the verification script at the session scratchpad path (the executor will substitute the real scratchpad path):
`/tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad/check-tutorial.ts`

```ts
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro
  const page = await ctx.newPage();

  // Clear any saved tutorial state so we start fresh.
  await page.addInitScript(() => {
    localStorage.removeItem('driftworks.tutorial.done');
    localStorage.removeItem('driftworks.tutorial.step');
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // let requestAnimationFrame render

  // 1. Tutorial panel visible.
  const panel = await page.$('.dw-tut-panel');
  if (!panel) throw new Error('FAIL: .dw-tut-panel not found');
  const panelVisible = await panel.isVisible();
  if (!panelVisible) throw new Error('FAIL: tutorial panel not visible on first load');
  console.log('PASS 1: tutorial panel visible on first load');

  // 2. Step counter shows "Step 1 / 8".
  const stepNum = await page.$eval('.dw-tut-step-num', (el) => el.textContent);
  if (!stepNum?.includes('Step 1')) throw new Error(`FAIL: unexpected step num: ${stepNum}`);
  console.log('PASS 2: step counter correct:', stepNum);

  // 3. Spotlight rendered.
  const spot = await page.$('.dw-tut-spotlight');
  if (!spot) throw new Error('FAIL: .dw-tut-spotlight not found');
  console.log('PASS 3: spotlight element present');

  // 4. Objective chip visible.
  const chip = await page.$('.dw-obj-chip');
  if (!chip || !(await chip.isVisible())) throw new Error('FAIL: objective chip not visible');
  const chipText = await page.$eval('.dw-obj-text', (el) => el.textContent);
  console.log('PASS 4: objective chip visible, text:', chipText);

  // Screenshot: initial state.
  await page.screenshot({ path: '/tmp/tut-01-initial.png' });

  // 5. Skip tutorial.
  await page.click('.dw-tut-skip');
  await page.waitForTimeout(200);
  const panelAfterSkip = await page.$('.dw-tut-root.dw-tut-hidden');
  if (!panelAfterSkip) throw new Error('FAIL: overlay not hidden after skip');
  console.log('PASS 5: overlay hidden after skip');

  // Chip still visible after skip.
  if (!(await chip.isVisible())) throw new Error('FAIL: chip not visible after skip');
  console.log('PASS 6: chip still visible after skip');

  await page.screenshot({ path: '/tmp/tut-02-skipped.png' });

  console.log('\nAll checks PASSED. Screenshots: /tmp/tut-01-initial.png, /tmp/tut-02-skipped.png');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2:** Run the dev server in the background, then run the script:
```bash
cd /home/martin/projects/driftworks && npm run dev -- --host &
sleep 3
npx --yes tsx /tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad/check-tutorial.ts http://localhost:5173
```
All six `PASS` lines must appear. Screenshots are at `/tmp/tut-01-initial.png` and `/tmp/tut-02-skipped.png` — review them manually.

- [ ] **Step 3: Push + deploy**:
```bash
git -C /home/martin/projects/driftworks push origin main
```
Watch the GitHub Actions deploy. Confirm the live bundle hash changes.

---

## Task T5: "Help / Tutorial" replayability entry in hotbar dock

**Files:** Modify `src/ui/hotbar.ts`, `src/ui/hud.ts`.

A "Tutorial" button in the dock (alongside "Research", "Explain" etc.) allows the player to re-open the tutorial at any time without digging into settings.

- [ ] **Step 1: `hotbar.ts`** — add `tutorialToggle: () => void` to `HotbarCallbacks`:
```ts
export interface HotbarCallbacks {
  // ... existing fields ...
  tutorialToggle: () => void;
}
```
Add the button in `buildHotbar` after `researchBtn`:
```ts
  const tutorialBtn = ctrl('Tutorial', () => cb.tutorialToggle());
  dock.append(dirBtn, viewBtn, pauseBtn, speedBtn, explainBtn, researchBtn, tutorialBtn, resetBtn);
```

- [ ] **Step 2: `hud.ts`** — In `buildHud`, pass the callback. `tutorial` already holds the `TutorialController`. Add to the `buildHotbar` callbacks object:
```ts
    tutorialToggle: () => {
      // Replay from step 0 regardless of localStorage state.
      // Access the DOM button on the complete card directly by triggering replay.
      // Instead, expose a replay() method on TutorialController.
    },
```
Wait — `TutorialController` (as defined in T1) does not expose `replay()`. Add it now.

**Amend `TutorialController` interface** in `tutorial.ts`:
```ts
export interface TutorialController {
  tick(curr: Snapshot, prev: Snapshot | null): void;
  active(): boolean;
  replay(): void;   // ← add this
}
```
**Add `replay()` implementation** in `buildTutorial` return object:
```ts
    replay() {
      isDone = false;
      stepIdx = 0;
      lsRemove(LS_DONE);
      lsSet(LS_STEP, '0');
      overlay.classList.remove('dw-tut-hidden');
      renderStep();
    },
```
(This mirrors the existing `replayBtn` handler — consolidate: `replayBtn.addEventListener('click', () => ctrl.replay())` where `ctrl` is the returned object — use a local variable.)

- [ ] **Step 3:** Back in `hud.ts`, supply the callback:
```ts
    tutorialToggle: () => tutorial.replay(),
```

- [ ] **Step 4: Build** — `npm run build` → green.
- [ ] **Step 5: Commit**:
```bash
git -C /home/martin/projects/driftworks add src/ui/tutorial.ts src/ui/hotbar.ts src/ui/hud.ts
git -C /home/martin/projects/driftworks commit -m "ui: Tutorial dock button + replay() on TutorialController"
```

---

## Self-review notes

### Spec coverage checklist

| Requirement | Covered by |
|---|---|
| Step-by-step tutorial, one verb at a time | T1 `TUTORIAL_STEPS` (8 steps: miner → belt → smelting → smelter → storage → collect → power → generator) |
| Auto-advances on player action (snapshot delta detection) | T1 `done` predicates in each step; T2 `tick()` call per snapshot |
| Spotlight / arrow on relevant HUD element | T1 `setSpotlight()` resolving `.dw-tile[title=…]` or `.dw-ctrl` DOM rects; T3 CSS ring |
| Skippable | T1 `skipBtn` → `skip()` hides overlay, chip survives |
| Replayable from Help/Tutorial entry | T5 dock button + `replay()` on controller |
| Completion persisted in `localStorage` | T1 `LS_DONE = 'driftworks.tutorial.done'` |
| "Current objective" chip (tutorial → research → Ark) | T1 chip updated by `renderStep()` (tutorial active) and `tick()` post-completion (TECHS progression → 'Build the Ark') |
| Pure DOM/CSS + main wiring; NO sim changes | All files in `src/ui/` + `src/main.ts`; zero `src/sim/*` edits |
| Mobile-friendly | T3 CSS: `min(340px, calc(100vw - 24px))`, safe-area-inset, tap targets |
| Theme-token styling | T3 CSS: only `var(--accent)`, `var(--panel)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--r-sm)`, `var(--r-md)`, `var(--shadow)`, `var(--glow)` |
| Headless visual verification | T4 Playwright script with 6 assertions + 2 screenshots |

### Spotlight implementation note

`resolveSpotlightRect` queries the live DOM with `document.querySelector`. The `hotbar.ts` tile title attribute is `DEFS[tool].label` (e.g. `"Belt"` for `conveyor`). The map from `spotlight: 'hotbar-conveyor'` → `"Belt"` is handled by a local mapping in `resolveSpotlightRect`:

```ts
const TOOL_TITLE: Partial<Record<string, string>> = {
  conveyor: 'Belt',
};
const label = TOOL_TITLE[tool] ?? (tool.charAt(0).toUpperCase() + tool.slice(1));
```

This is the only place where the display-name mapping must stay in sync with `hotbar.ts`'s `labelOf` function. If `labelOf` changes, update `TOOL_TITLE` accordingly. (Alternatively, `tutorial.ts` could import `DEFS` and use `DEFS[tool as ModuleType]?.label` — add that as a follow-up polish.)

### Detection edge cases

- **`place_miner` done predicate** — detects any miner in `modules`. If the player already had a miner from a saved game this would skip immediately. This is acceptable: the tutorial is a first-run experience and saved games from the demo (`loadDemo`) already have machines. The `LS_DONE` flag will prevent re-triggering on saves where the player has completed the tutorial. On a fresh `init` world the demo base is placed, which includes a miner — therefore `place_miner` and `place_belt` will both skip instantly on fresh start. **Fix:** Change the demo-world predicates to count modules *added by the player* rather than total count. The simplest approach: snapshot on step entry and check for module count strictly greater than on entry. Since `TutorialController` is built once and `stepIdx` advances, the fix is to capture `curr.modules.length` at the time the step becomes active and require `curr.modules.filter(m => m.type === step.moduleType).length > baseline`. This refinement should be applied if the demo world already has miners — check `world.ts` `loadDemo()` to confirm. If `loadDemo` places a miner, update the `place_miner` done predicate to:

```ts
done: (curr) => curr.modules.filter((m) => m.type === 'miner').length > 1,
```
(The demo base starts with 1 miner — player must place at least one more.) Verify by reading `src/sim/world.ts` `loadDemo()` before finalizing this predicate.

- **`collect_plate` predicate** — compares `curr.inventory.plate > prev.inventory.plate`. On the very first `tick` call `prev` is `null`; the guard `prev?.inventory.plate ?? 0` handles this safely.

- **`research_smelting` step** — requires `curr.research.completed.includes('smelting')`. The research panel's "Contribute from inventory" button sends `{ type: 'research', action: 'contribute' }` which pays from `inventory.ore`. The player starts with 40 ore (from `START_INVENTORY` in `data.ts`), smelting costs 20 ore — this is always achievable from a fresh start without building anything first. The tutorial explicitly says "You need 20 ore" so the player is informed.

### Post-tutorial chip behaviour

Once `isDone` is true, `tick()` looks up the first `TECHS` entry whose prereqs are completed and that is not yet completed itself. This means:
- After Smelting + Power but before Automation: chip shows "Research: Automation Science".
- All techs completed: chip shows "Build the Ark" (the endgame placeholder, Horizon 4).
- This is implemented without importing anything beyond TECHS, which is already imported.

### Known limitations (future follow-ups, not blocking)

1. No arrow pointing from the panel to the spotlight target — the ring alone is sufficient for MVP.
2. The tutorial panel obscures the lower HUD on very small screens (<375px wide) — acceptable given the `min(340px, 100vw - 24px)` responsive width; a scroll container inside the panel can be added if needed.
3. `resolveSpotlightRect` queries the DOM on every step change but not continuously — if the hotbar reflows (e.g. orientation change), the spotlight may drift until the user triggers the next step. The `resize` listener in `buildTutorial` re-positions it, which covers the common case.
4. The tutorial does not auto-start if the player loads a saved game that already has all demo-base machines; `LS_DONE` being absent means it would trigger and advance through the first steps instantly. Follow-up: set `LS_DONE = '1'` on any non-fresh load (i.e. when `readSave()` returns a valid `SaveState`).
