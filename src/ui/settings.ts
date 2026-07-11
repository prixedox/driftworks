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
      current = { ...current, [key]: checkbox.checked, preset: resolvePreset({ ...current, [key]: checkbox.checked }) };
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
