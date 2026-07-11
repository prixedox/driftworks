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
