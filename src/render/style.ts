// Single source of visual truth for the renderer + render kit.
//
// Everything that decides "what DRIFTWORKS looks like" lives here: the palette,
// per-module material intent (color / accent / emissive), the bloom tuning, the
// light rig, and a couple of tiny pure helpers shared across the render modules.
// The kit modules (materials/models/scenery/effects) and the renderer import from
// here so the look can be retuned in one place without touching geometry code.

import { DEFS, type ModuleType } from '../sim/types';

/** Faction + neutral palette. Hex ints (Three.js Color-friendly). */
export const PALETTE = {
  /** Faction teal — used for accents, holograms, selection. */
  accent: 0x5ad1c0,
  /** Neutral machine metals (dark → light) for procedural shading. */
  metalDark: 0x1c2128,
  metalMid: 0x3a444f,
  metalLight: 0x707d88,
  /** Ground tones. */
  groundDark: 0x10180f,
  groundMid: 0x16241a,
  groundLight: 0x223225,
  /** Ore deposit / rock tones. */
  oreRock: 0x9a6a2e,
  oreCrystal: 0xf0b25a,
  /** Glow used by item packets travelling along belts. */
  packetGlow: 0x6bd0ff,
  /** Hazard stripe colors. */
  warning: 0xf2b21c,
  warningDark: 0x14110a,
  /** Scene background — matched to the sky dome's horizon tone so the flat
   *  background, the gradient dome, and the fog all agree (no hard seam). */
  background: 0x141826,
} as const;

/** Per-module visual intent. Seeded from DEFS colors; accents/emissives chosen
 *  so glowing machines (smelter / generator / assembler / lab) bloom while
 *  passive ones (storage / conveyor / miner) stay matte. */
export interface ModuleStyle {
  color: number;
  accent: number;
  emissive: number;
}

export const MODULE_STYLE: Record<ModuleType, ModuleStyle> = {
  miner: { color: DEFS.miner.color, accent: 0xffb347, emissive: 0 }, // amber accent, no glow
  conveyor: { color: DEFS.conveyor.color, accent: PALETTE.accent, emissive: 0 },
  smelter: { color: DEFS.smelter.color, accent: 0xff8a3d, emissive: 0xff5a1e }, // hot
  storage: { color: DEFS.storage.color, accent: PALETTE.accent, emissive: 0 },
  generator: { color: DEFS.generator.color, accent: 0x9fe2ff, emissive: 0x6bd0ff }, // electric
  assembler: { color: DEFS.assembler.color, accent: 0xc7a9ff, emissive: 0x9a6bff },
  lab: { color: DEFS.lab.color, accent: 0xa9d6ff, emissive: 0x6bb6ff },
};

/** UnrealBloom tuning. Threshold raised so ONLY the brightest emissives
 *  (packets, smelter door, generator vents, lab core, player visor) bloom —
 *  matte shells, ground, and the warm ore veins stay grounded and do not flare
 *  into a field of stars. Strength eased a touch to keep the glow tasteful. */
export const BLOOM = { strength: 0.5, radius: 0.5, threshold: 0.86 } as const;

/** Light rig. Colors + intensities; the renderer wires positions/shadows. */
export const LIGHT = {
  /** Warm directional key light. */
  key: 0xfff1d6,
  keyIntensity: 1.4,
  /** Hemisphere fill (sky / ground bounce). */
  hemiSky: 0xbfe0ff,
  hemiGround: 0x16240f,
  hemiIntensity: 0.55,
  /** Flat ambient fill. */
  ambient: 0x8a98ad,
  ambientIntensity: 0.65,
} as const;

/** Tone-mapping exposure used with ACESFilmicToneMapping. Eased slightly below
 *  1.0 so the combined (models + scenery + effects) scene isn't blown out. */
export const TONE_EXPOSURE = 0.98;

/** Exponential distance fog for depth at the map edges. Color matches the
 *  background / sky horizon; density is low so the playable area stays clear and
 *  only the far map fringe softens into the sky. The renderer owns the scene, so
 *  it applies this (the lab uses its own small fog or none). */
export const FOG = { color: 0x141826, density: 0.014 } as const;

/** Multiply an RGB hex int by a scalar factor (per-channel, clamped low end). */
export function darken(c: number, f: number): number {
  const r = Math.floor(((c >> 16) & 255) * f);
  const g = Math.floor(((c >> 8) & 255) * f);
  const b = Math.floor((c & 255) * f);
  return (r << 16) | (g << 8) | b;
}

/** Deterministic LCG used for scattering ore crystals etc. Returns [0,1). */
export function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
