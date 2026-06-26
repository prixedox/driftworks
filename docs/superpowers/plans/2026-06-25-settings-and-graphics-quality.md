# DRIFTWORKS Settings Panel + Graphics Quality Tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a **Settings panel** (gear button in the dock) with **graphics quality** controls: a Quality preset (Low / Medium / High), individual toggles for bloom/post-processing, shadows, and particles, plus a stubbed Audio volume control. Settings persist in `localStorage`, are applied live, and auto-detected on first load using device heuristics. The renderer gains a `setQuality(opts)` API that enables/disables PostFX, shadow maps, and the particle system. Low preset must measurably reduce GPU work on mobile.

**Architecture:** A new `src/ui/settings.ts` DOM panel is wired into `hud.ts` alongside the Research panel. A new `src/settings.ts` module owns the settings schema, `localStorage` persistence, and the device auto-detect heuristic. `Renderer.setQuality(opts)` is the only renderer-side change: it toggles `renderer.shadowMap.enabled`, `dirLight.castShadow`, `postfx.setEnabled()`, and `effects.setEnabled()`. No `src/sim/*` changes.

**Tech Stack:** TypeScript (strict), Three.js, Vite, DOM/CSS, `localStorage`. No new runtime deps.

---

## Global Constraints

- **No `src/sim/*` changes** — quality settings are purely presentation-layer.
- **Renderer remains snapshot-driven.** `setQuality` may be called at any time (between frames); it takes effect on the next frame.
- **Theme tokens only** — all new CSS uses `var(--accent)`, `var(--panel)`, `var(--border)`, `var(--text)`, `var(--muted)`, etc. from `src/ui/theme.css`. No hardcoded colors.
- **Build gate:** every task ends green on `npm run build` (`tsc --noEmit && vite build`), strict TS.
- **Commits:** do NOT add any Claude/AI attribution (no `Co-Authored-By`, no "Generated with").
- **Mobile performance:** the Low preset MUST disable all three systems (postfx, shadows, particles). Verify via headless screenshot that the scene renders correctly (no blank screen) in each preset.
- **Auto-detect default:** on first load, if the device heuristic flags a low-end device, the default preset is `'low'`; otherwise `'high'`. User choice stored in `localStorage` overrides this permanently.

---

## File Structure

- **Create `src/settings.ts`** — `QualityOpts`, `QualityPreset`, `PRESETS`, `loadSettings()`, `saveSettings()`, `detectDefault()`.
- **Modify `src/render/renderer.ts`** — add `setQuality(opts: QualityOpts): void`; expose `effects` and `postfx` sufficiently for internal use (both are already private fields).
- **Modify `src/render/effects.ts`** — add `setEnabled(on: boolean): void`.
- **Create `src/ui/settings.ts`** — `buildSettings(root, cb): SettingsPanel`. Pure DOM, no sim imports.
- **Modify `src/ui/hud.ts`** — add `HudCallbacks.applyQuality`, wire settings panel, add a gear button to the dock.
- **Modify `src/main.ts`** — load settings on startup, pass `applyQuality` callback, call `renderer.setQuality()` from the callback.
- **Append to `src/style.css`** — `.dw-settings` panel styles, toggle switch, preset buttons.

---

## Task 1: Settings schema + persistence module

**Files:** Create `src/settings.ts`.

**Interfaces produced:** `QualityOpts`, `QualityPreset` type, `PRESETS` map, `loadSettings()`, `saveSettings()`, `detectDefault()`.

- [ ] **Step 1: Create `src/settings.ts`**

```ts
// Graphics quality settings: schema, localStorage persistence, device auto-detect.
// Consumed by main.ts (initial apply) and src/ui/settings.ts (live changes).
// No Three.js imports here — keep it import-free of render deps.

export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualityOpts {
  preset: QualityPreset;
  bloom: boolean;     // PostFX EffectComposer (UnrealBloom)
  shadows: boolean;   // DirectionalLight.castShadow + renderer.shadowMap
  particles: boolean; // Effects particle system
}

export const PRESETS: Record<QualityPreset, Omit<QualityOpts, 'preset'>> = {
  low:    { bloom: false, shadows: false, particles: false },
  medium: { bloom: true,  shadows: false, particles: true  },
  high:   { bloom: true,  shadows: true,  particles: true  },
};

const STORAGE_KEY = 'driftworks.settings.v1';

/**
 * Detect a sensible default preset for this device.
 * Heuristics (both must pass for 'low'):
 *   1. navigator.maxTouchPoints > 0 (touch device — likely mobile)
 *   2. devicePixelRatio >= 2 (high-DPI → more fragment work) OR
 *      matchMedia('(pointer: coarse)') matches (coarse pointer → phone/tablet)
 * In practice this catches mid-range Android and older iPhones without
 * false-positives on desktop touch screens (they rarely have maxTouchPoints > 0
 * paired with a coarse pointer media query match).
 */
export function detectDefault(): QualityPreset {
  if (typeof window === 'undefined') return 'high';
  const touch = navigator.maxTouchPoints > 0;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hiDpr = (window.devicePixelRatio ?? 1) >= 2;
  return touch && (coarse || hiDpr) ? 'low' : 'high';
}

/** Load saved settings; falls back to auto-detected defaults on first run. */
export function loadSettings(): QualityOpts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<QualityOpts>;
      // validate the stored preset; individual toggles may deviate from the preset
      if (parsed.preset && parsed.preset in PRESETS) {
        return {
          preset: parsed.preset,
          bloom:     typeof parsed.bloom     === 'boolean' ? parsed.bloom     : PRESETS[parsed.preset].bloom,
          shadows:   typeof parsed.shadows   === 'boolean' ? parsed.shadows   : PRESETS[parsed.preset].shadows,
          particles: typeof parsed.particles === 'boolean' ? parsed.particles : PRESETS[parsed.preset].particles,
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  // First run: auto-detect.
  const preset = detectDefault();
  return { preset, ...PRESETS[preset] };
}

/** Persist settings to localStorage (best-effort; private mode may deny). */
export function saveSettings(opts: QualityOpts): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Build** — `npm run build` → green (no downstream consumers yet).

- [ ] **Step 3: Commit**
```bash
git -C /home/martin/projects/driftworks add src/settings.ts
git -C /home/martin/projects/driftworks commit -m "settings: quality schema, localStorage persistence, device auto-detect"
```

---

## Task 2: Renderer quality API + Effects enable/disable

**Files:** Modify `src/render/effects.ts`, `src/render/renderer.ts`.

**Interfaces produced:** `Effects.setEnabled(on: boolean): void`; `Renderer.setQuality(opts: QualityOpts): void`.

### 2a — Effects.setEnabled

The `Effects` class already has a `dispose()` method and a `group` field. Adding `setEnabled` simply shows/hides the Points group, which stops all draw calls for the particle cloud in one GPU draw-call skip. The particle simulation (`advance`) keeps running for one frame after disable to let existing particles drain — this is acceptable and avoids a visible pop (alternatively we zero all alpha on disable; see the note).

- [ ] **Step 1: Add `private enabled = true;` field to `Effects`** — insert after `private cursor = 0;` at line 125:

```ts
  /** When false, the Points group is hidden — no GPU draw call, no spawning. */
  private enabled = true;
```

- [ ] **Step 2: Add `setEnabled` method to `Effects`** — insert before `attach(scene: Scene)`:

```ts
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.group) this.group.visible = on;
    // When disabling, immediately zero all alpha so no ghost particles linger
    // if the group becomes visible again later.
    if (!on && this.alphaAttr) {
      (this.alphaAttr.array as Float32Array).fill(0);
      this.alphaAttr.needsUpdate = true;
      // Also kill all live slots so no particles resume on re-enable.
      this.life.fill(0);
      this.age.fill(0);
      this.cursor = 0;
      this.accum.clear();
      this.pktAccum.clear();
    }
  }
```

- [ ] **Step 3: Guard spawning in `update()`** — in `Effects.update()`, add an early return if disabled, after the existing `!this.group || s.paused` check:

Change:
```ts
    if (!this.group || s.paused) return;
```
To:
```ts
    if (!this.group || s.paused || !this.enabled) return;
```

### 2b — Renderer.setQuality

The renderer's `init()` already sets `shadowMap.enabled = true` and `dirLight.castShadow = true`. `PostFX.setEnabled(on)` already exists. We add the public method that coordinates all three levers.

- [ ] **Step 4: Import `QualityOpts` in `renderer.ts`** — add to the top-level imports (after the Three.js import block):

```ts
import type { QualityOpts } from '../settings';
```

- [ ] **Step 5: Add `setQuality` method to `Renderer`** — insert before the `get canvas()` getter:

```ts
  /**
   * Apply graphics quality options live. Safe to call at any time; takes effect
   * on the next frame. Toggling shadows requires re-enabling the shadow map on
   * the WebGLRenderer AND the directional light together — doing only one
   * produces no shadows (map disabled) or wasted shadow-map renders (light on,
   * map off).
   *
   * Shadow map enable/disable note: WebGL does not allow truly "disabling" the
   * shadow map mid-session on all drivers; instead we keep the map allocated but
   * set castShadow=false on the light, which stops the shadow pass entirely
   * (zero GPU cost for shadow generation). The renderer-level flag
   * shadowMap.enabled guards the per-object shadow receive. For Low preset both
   * are false.
   */
  setQuality(opts: QualityOpts): void {
    // PostFX (bloom + EffectComposer overhead)
    this.postfx.setEnabled(opts.bloom);

    // Shadows — disable castShadow on the key light to skip the shadow pass.
    // Also toggle per-object receive to avoid sampling a stale shadow map.
    this.renderer.shadowMap.enabled = opts.shadows;
    this.dirLight.castShadow = opts.shadows;
    // Force shadow map refresh on re-enable so it doesn't show a one-frame stale map.
    if (opts.shadows) this.dirLight.shadow.needsUpdate = true;

    // Particles
    this.effects.setEnabled(opts.particles);
  }
```

- [ ] **Step 6: Build** — `npm run build` → green.

- [ ] **Step 7: Commit**
```bash
git -C /home/martin/projects/driftworks add src/render/effects.ts src/render/renderer.ts
git -C /home/martin/projects/driftworks commit -m "render: Effects.setEnabled + Renderer.setQuality API (bloom/shadows/particles)"
```

---

## Task 3: Settings panel UI

**Files:** Create `src/ui/settings.ts`; append to `src/style.css`.

**Interfaces produced:** `SettingsPanel { update(opts: QualityOpts): void; toggle(): void }`, `SettingsCallbacks { apply(opts: QualityOpts): void }`.

The panel is styled as a right-side floating `.dw-panel`, hidden until toggled (like `.dw-research`). It contains:
- Three preset buttons (Low / Medium / High) — clicking one sets all three individual toggles and calls `cb.apply`.
- Three toggle rows: Bloom, Shadows, Particles — each with a custom CSS toggle switch and a label describing the trade-off.
- One stub row: Audio volume (a disabled range input labelled "coming soon").
- A "Save" indicator (shows "Settings saved" for 1.5 s on any change).

- [ ] **Step 1: Create `src/ui/settings.ts`**

```ts
import type { QualityOpts, QualityPreset } from '../settings';
import { PRESETS } from '../settings';

export interface SettingsPanel {
  update(opts: QualityOpts): void;
  toggle(): void;
}

export interface SettingsCallbacks {
  apply(opts: QualityOpts): void;
}

export function buildSettings(root: HTMLElement, cb: SettingsCallbacks): SettingsPanel {
  const panel = document.createElement('div');
  panel.className = 'dw-settings dw-panel';
  panel.setAttribute('aria-label', 'Graphics Settings');

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'dw-settings-header';
  const title = document.createElement('span');
  title.className = 'dw-label';
  title.textContent = 'Graphics Quality';
  header.append(title);
  panel.append(header);

  // --- Preset buttons ---
  const presetRow = document.createElement('div');
  presetRow.className = 'dw-settings-presets';
  const PRESET_LABELS: Record<QualityPreset, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };
  const presetBtns = new Map<QualityPreset, HTMLButtonElement>();
  (['low', 'medium', 'high'] as QualityPreset[]).forEach((p) => {
    const b = document.createElement('button');
    b.className = 'dw-settings-preset';
    b.textContent = PRESET_LABELS[p];
    b.addEventListener('click', () => {
      current = { preset: p, ...PRESETS[p] };
      syncToggles();
      cb.apply(current);
      flash();
    });
    presetBtns.set(p, b);
    presetRow.append(b);
  });
  panel.append(presetRow);

  // --- Individual toggle rows ---
  const TOGGLES: { key: keyof Omit<QualityOpts, 'preset'>; label: string; hint: string }[] = [
    { key: 'bloom',     label: 'Bloom / Post-FX', hint: 'Glow effect (GPU-heavy)' },
    { key: 'shadows',   label: 'Shadows',         hint: 'Dynamic shadow pass' },
    { key: 'particles', label: 'Particles',        hint: 'Smoke, sparks, dust' },
  ];

  const toggleEls = new Map<keyof Omit<QualityOpts, 'preset'>, HTMLInputElement>();

  TOGGLES.forEach(({ key, label, hint }) => {
    const row = document.createElement('label');
    row.className = 'dw-settings-row';

    const info = document.createElement('div');
    info.className = 'dw-settings-row-info';
    const lbl = document.createElement('span');
    lbl.className = 'dw-settings-label';
    lbl.textContent = label;
    const hintEl = document.createElement('span');
    hintEl.className = 'dw-settings-hint';
    hintEl.textContent = hint;
    info.append(lbl, hintEl);

    const switchWrap = document.createElement('span');
    switchWrap.className = 'dw-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'dw-toggle-input';
    const track = document.createElement('span');
    track.className = 'dw-toggle-track';
    const thumb = document.createElement('span');
    thumb.className = 'dw-toggle-thumb';
    track.append(thumb);
    switchWrap.append(checkbox, track);

    checkbox.addEventListener('change', () => {
      current = { ...current, [key]: checkbox.checked, preset: resolvePreset(current) };
      syncPresetBtns();
      cb.apply(current);
      flash();
    });

    row.append(info, switchWrap);
    panel.append(row);
    toggleEls.set(key, checkbox);
  });

  // --- Audio stub ---
  const audioRow = document.createElement('div');
  audioRow.className = 'dw-settings-row dw-settings-row--audio';
  const audioInfo = document.createElement('div');
  audioInfo.className = 'dw-settings-row-info';
  const audioLbl = document.createElement('span');
  audioLbl.className = 'dw-settings-label';
  audioLbl.textContent = 'Audio Volume';
  const audioHint = document.createElement('span');
  audioHint.className = 'dw-settings-hint';
  audioHint.textContent = 'Coming soon';
  audioInfo.append(audioLbl, audioHint);
  const audioRange = document.createElement('input');
  audioRange.type = 'range';
  audioRange.min = '0';
  audioRange.max = '100';
  audioRange.value = '80';
  audioRange.disabled = true;
  audioRange.className = 'dw-settings-range';
  audioRow.append(audioInfo, audioRange);
  panel.append(audioRow);

  // --- Saved flash ---
  const savedMsg = document.createElement('div');
  savedMsg.className = 'dw-settings-saved';
  savedMsg.textContent = 'Settings saved';
  panel.append(savedMsg);

  root.append(panel);

  let current: QualityOpts = { preset: 'high', bloom: true, shadows: true, particles: true };
  let flashTimer = 0;

  function syncToggles(): void {
    for (const [key, el] of toggleEls) {
      el.checked = current[key as keyof typeof current] as boolean;
    }
    syncPresetBtns();
  }

  function syncPresetBtns(): void {
    for (const [p, b] of presetBtns) {
      b.classList.toggle('active', current.preset === p);
    }
  }

  /**
   * After an individual toggle is changed, determine which preset (if any) the
   * combination matches; otherwise keep 'medium' as the "custom" label.
   */
  function resolvePreset(opts: QualityOpts): QualityPreset {
    for (const [p, vals] of Object.entries(PRESETS) as [QualityPreset, typeof PRESETS[QualityPreset]][]) {
      if (vals.bloom === opts.bloom && vals.shadows === opts.shadows && vals.particles === opts.particles) {
        return p;
      }
    }
    return 'medium';
  }

  function flash(): void {
    savedMsg.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => savedMsg.classList.remove('show'), 1500);
  }

  return {
    update(opts) {
      current = opts;
      syncToggles();
    },
    toggle() {
      panel.classList.toggle('show');
    },
  };
}
```

- [ ] **Step 2: Append to `src/style.css`** — add the following block at the end of the file:

```css
/* ── Settings panel ──────────────────────────────────────────────── */

.dw-settings {
  position: fixed;
  right: 16px;
  top: 96px;
  width: 260px;
  padding: 12px;
  z-index: 13;
  display: none;
  flex-direction: column;
  gap: 10px;
}

.dw-settings.show {
  display: flex;
}

.dw-settings-header {
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* Preset buttons row */
.dw-settings-presets {
  display: flex;
  gap: 6px;
}

.dw-settings-preset {
  flex: 1;
  padding: 6px 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--muted);
  font: 600 11px/1 ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}

.dw-settings-preset.active {
  border-color: var(--accent);
  color: var(--accent);
}

.dw-settings-preset:hover:not(.active) {
  border-color: var(--muted);
  color: var(--text);
}

/* Individual toggle rows */
.dw-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.dw-settings-row--audio {
  cursor: default;
  opacity: 0.5;
}

.dw-settings-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.dw-settings-label {
  font: 600 12px/1 system-ui, sans-serif;
  color: var(--text);
}

.dw-settings-hint {
  font: 400 10px/1 ui-monospace, monospace;
  color: var(--muted);
}

.dw-settings-range {
  width: 80px;
  accent-color: var(--accent);
}

/* Saved flash */
.dw-settings-saved {
  font: 600 11px/1 ui-monospace, monospace;
  color: var(--accent);
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s;
  height: 14px;
}

.dw-settings-saved.show {
  opacity: 1;
}

/* CSS toggle switch */
.dw-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.dw-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.dw-toggle-track {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--border);
  border: 1px solid var(--border);
  transition: background 0.15s, border-color 0.15s;
  cursor: pointer;
}

.dw-toggle-input:checked + .dw-toggle-track {
  background: var(--accent);
  border-color: var(--accent);
}

.dw-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  transition: transform 0.15s;
}

.dw-toggle-input:checked + .dw-toggle-track .dw-toggle-thumb {
  transform: translateX(16px);
}
```

- [ ] **Step 3: Build** — `npm run build` → green.

- [ ] **Step 4: Commit**
```bash
git -C /home/martin/projects/driftworks add src/ui/settings.ts src/style.css
git -C /home/martin/projects/driftworks commit -m "UI: settings panel (preset buttons, bloom/shadows/particles toggles, audio stub)"
```

---

## Task 4: HUD wiring — gear button + panel lifecycle

**Files:** Modify `src/ui/hud.ts`.

**Interfaces:** `HudCallbacks` gains `applyQuality(opts: QualityOpts): void`; `Hud` gains `initSettings(opts: QualityOpts): void` (called once on startup to seed the panel with the loaded settings). The dock gets a ⚙ button that toggles the panel.

- [ ] **Step 1: Edit `src/ui/hud.ts`** — apply all of the following changes:

**a. Add imports:**
```ts
import { buildSettings } from './settings';
import type { QualityOpts } from '../settings';
```

**b. Extend `HudCallbacks` interface** — add after `contributeResearch`:
```ts
  applyQuality: (opts: QualityOpts) => void;
```

**c. Extend `Hud` interface** — add after `pushToast`:
```ts
  initSettings: (opts: QualityOpts) => void;
}
```

**d. In `buildHud` function body** — mount the settings panel immediately after mounting the research panel:
```ts
  const settings = buildSettings(root, { apply: cb.applyQuality });
```

**e. Add a gear button to the dock** — in the `hotbar.ts` callback object `researchToggle` is already there. The settings toggle goes in `HotbarCallbacks` and `buildHotbar`. But to keep the diff minimal, wire it through `hud.ts` by appending a standalone dock button rather than plumbing it through `hotbar.ts`:

Instead, add a Settings button via a `HotbarCallbacks.settingsToggle` key (same pattern as `researchToggle`):

In `src/ui/hotbar.ts`, extend `HotbarCallbacks`:
```ts
  settingsToggle: () => void;
```

In `buildHotbar`, add after `researchBtn`:
```ts
  const settingsBtn = ctrl('⚙ Settings', () => cb.settingsToggle());
  dock.append(dirBtn, viewBtn, pauseBtn, speedBtn, explainBtn, researchBtn, settingsBtn, resetBtn);
```

Back in `hud.ts`, pass the callback:
```ts
    researchToggle: () => research.toggle(),
    settingsToggle: () => settings.toggle(),
```

**f. Extend `buildHud` return object** — add:
```ts
    initSettings: (opts) => settings.update(opts),
```
(Reuse `settings.update` for init — it syncs both toggles and preset buttons.)

- [ ] **Step 2: Build** — `npm run build` → green. Fix any TS errors (missing callback member in the hud call-site in `main.ts` will be fixed in Task 5).

- [ ] **Step 3: Commit**
```bash
git -C /home/martin/projects/driftworks add src/ui/hud.ts src/ui/hotbar.ts
git -C /home/martin/projects/driftworks commit -m "HUD: gear/settings button in dock, settings panel wired into hud"
```

---

## Task 5: main.ts wiring — load, apply, persist

**Files:** Modify `src/main.ts`.

This is the thinnest task: load settings on startup, pass `applyQuality` into the HUD callbacks, call `renderer.setQuality()` from the callback, and seed the panel via `hud.initSettings()`.

- [ ] **Step 1: Import settings helpers in `src/main.ts`** — add near the top imports:
```ts
import { loadSettings, saveSettings } from './settings';
import type { QualityOpts } from './settings';
```

- [ ] **Step 2: Load settings before `buildHud`** — in `main()`, after `await renderer.init(root)`:
```ts
  const currentQuality = loadSettings();
  renderer.setQuality(currentQuality);
```

- [ ] **Step 3: Add `applyQuality` to the `buildHud` callbacks object** — in the callbacks object passed to `buildHud`, add after `contributeResearch`:
```ts
    applyQuality: (opts: QualityOpts) => {
      renderer.setQuality(opts);
      saveSettings(opts);
    },
```

- [ ] **Step 4: Seed the panel after `buildHud`** — after `hud.setDir(dir)`:
```ts
  hud.initSettings(currentQuality);
```

- [ ] **Step 5: Build** — `npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git -C /home/martin/projects/driftworks add src/main.ts
git -C /home/martin/projects/driftworks commit -m "main: load/apply/persist quality settings on startup and live change"
```

---

## Task 6: Verification — headless screenshots + visual smoke-test

All visual checks use `google-chrome` driven by `playwright-core` (scripts in the session scratchpad). `chromium-cli` is NOT installed; use `google-chrome`.

### What to verify

1. **High preset (default on desktop):** bloom visible (glowing packets + machines), shadows cast on the ground plane, particles visible above smelter/miner. The Settings panel should be hidden; clicking ⚙ Settings opens it with the High preset active.

2. **Low preset (simulate mobile):** open the Settings panel, click "Low". Bloom gone (direct renderer.render path — no EffectComposer overlay). No shadow on the ground. No particles. The scene must still render (machines, packets, terrain visible) — not a black screen.

3. **Medium preset:** bloom on, no shadows, particles on.

4. **Individual toggle:** from High, uncheck "Shadows" → scene immediately loses shadows; the preset buttons should show no active highlight (resolves to 'medium', which happens to match). Recheck → shadows return.

5. **Persistence:** change to Low, reload the page → Low preset still selected; bloom/shadows/particles all disabled.

### Headless script outline (write to scratchpad)

```ts
// Scratchpad: /tmp/claude-1000/-home-martin-projects/2fd9b84e-.../scratchpad/verify-settings.ts
// Run with: npx --yes tsx <path>
import { chromium } from 'playwright-core';
import * as fs from 'fs';

const SCRATCHPAD = '/tmp/claude-1000/-home-martin-projects/2fd9b84e-f893-4afd-9db9-73a5149769d8/scratchpad';

(async () => {
  // Requires the dev server running: npm run dev -- --host (port 5173)
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2500); // let the renderer init + first snapshot

  // Screenshot: High (default desktop)
  await page.screenshot({ path: `${SCRATCHPAD}/quality-high.png` });

  // Open settings, click Low
  await page.click('button:has-text("⚙ Settings")');
  await page.waitForTimeout(200);
  await page.click('.dw-settings-preset:has-text("Low")');
  await page.waitForTimeout(500); // let the frame render
  await page.screenshot({ path: `${SCRATCHPAD}/quality-low.png` });

  // Click Medium
  await page.click('.dw-settings-preset:has-text("Medium")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCRATCHPAD}/quality-medium.png` });

  // Persistence: set Low, reload, screenshot
  await page.click('.dw-settings-preset:has-text("Low")');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SCRATCHPAD}/quality-reload-low.png` });
  // Check: settings panel should open to Low after reload
  await page.click('button:has-text("⚙ Settings")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCRATCHPAD}/quality-reload-settings.png` });

  await browser.close();
  console.log('Screenshots written to', SCRATCHPAD);
  console.log('Manually inspect: high should have visible glow/shadows/particles;');
  console.log('                  low should be flat/no-glow/no-particles but fully rendered.');
})();
```

- [ ] **Step 1:** Start the dev server: `npm --prefix /home/martin/projects/driftworks run dev -- --host` (background).

- [ ] **Step 2:** Write the script above to the scratchpad, run it: `npx --yes tsx <path>`. Review each screenshot:
  - `quality-high.png`: glowing belt packets, shadow on ground from machines, smoke/dust particles above smelter.
  - `quality-low.png`: same scene but flat — no glow ring around packets, no ground shadow, no particle cloud. Machines, terrain, and packets must all be visible.
  - `quality-medium.png`: glow on packets, no ground shadow, particles visible.
  - `quality-reload-low.png`: Low preset persisted after reload — scene flat.
  - `quality-reload-settings.png`: Settings panel open with "Low" button highlighted.

- [ ] **Step 3:** If any screenshot shows a blank/black screen, the renderer `setQuality` call is not falling back to direct render. Confirm that `PostFX.setEnabled(false)` causes `PostFX.render()` to call `this.renderer.render(this.scene, this.camera)` — this is already implemented in `postfx.ts` (the `if (this.enabled)` branch is there). No code change needed if the code is correct.

- [ ] **Step 4: Final build + commit**
```bash
git -C /home/martin/projects/driftworks add -A
git -C /home/martin/projects/driftworks commit -m "verify: settings panel + quality presets confirmed via headless screenshots"
```

- [ ] **Step 5: Push and deploy**
```bash
git -C /home/martin/projects/driftworks push origin main
```
Watch the Pages Action to success; confirm the live bundle hash updates.

---

## Self-review notes (author)

### Spec coverage
- Preset picker (Low/Medium/High): Task 3 + Task 4 (UI) + Task 5 (apply).
- Individual bloom toggle: `postfx.setEnabled()` (already existed) wired through `Renderer.setQuality`.
- Individual shadows toggle: `renderer.shadowMap.enabled` + `dirLight.castShadow` in `Renderer.setQuality`.
- Individual particles toggle: `Effects.setEnabled()` (new) wired through `Renderer.setQuality`.
- Persisted in `localStorage`: `loadSettings()` / `saveSettings()` in `src/settings.ts` (Task 1 + Task 5).
- Applied live: `cb.applyQuality` in `main.ts` calls `renderer.setQuality()` synchronously; next frame picks it up.
- Auto-detect default: `detectDefault()` in `src/settings.ts` uses `maxTouchPoints` + coarse pointer + DPR heuristic.
- Audio volume stub: disabled `<input type="range">` row in the settings panel with "coming soon" hint.
- Mobile performance (Low preset reduces GPU work): shadows off = no shadow-map render pass; bloom off = no EffectComposer (direct renderer.render); particles off = Points group hidden + buffers zeroed. All three together are the main GPU cost items on mobile at typical factory sizes.

### Architecture decisions
- `src/settings.ts` is a **pure data module** (no Three.js, no DOM). Importable by both `main.ts` and `src/ui/settings.ts` without circular deps.
- `Renderer.setQuality` keeps all render-layer knobs inside `src/render/` — `main.ts` just calls the method with the opaque `QualityOpts` shape.
- The `Effects.setEnabled` zeroes the live pool on disable so re-enabling shows a clean slate rather than old particles teleporting. This is 1 ms of CPU work at disable time, irrelevant for live toggle.
- Shadow note: `renderer.shadowMap.enabled = false` prevents per-object shadow receives but does NOT free the shadow map from GPU memory in WebGL. Setting `castShadow = false` on the directional light is the correct way to stop the shadow render pass entirely without reallocating. Both flags together are Belt-and-Suspenders for Low preset.
- The Settings panel sits at `right: 16px; top: 96px` — same position as the Inspector panel (`.dw-inspect`). They should not be open simultaneously in practice (Settings is opened from the dock, not from a cell tap), but if they are, they will overlap. That is acceptable for Horizon 1; a future UI reshuffle can stack them.

### Known limitations / follow-up
- Auto-detect fires only on first load (no stored preference). If a user upgrades their phone, they will need to manually change the preset.
- The shadow `needsUpdate` flag only forces one shadow-map update on re-enable. This is correct — the map stays current every frame while `castShadow` is true.
- Audio stub is purely a `disabled` range input. When audio is implemented (Horizon 5), replace it with a real volume control that calls an `AudioManager.setVolume()` API.
- `npm run build` (tsc strict) will catch any missed import of `QualityOpts` — Task 2 imports from `'../settings'` (relative to `src/render/`), which resolves to `src/settings.ts`. Verify the relative path: `src/render/renderer.ts` → `../settings` → `src/settings.ts`. Correct.
