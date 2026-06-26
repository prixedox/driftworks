// Procedural PBR material kit.
//
// Every material the renderer / models / scenery use is minted here, so the
// later model + scenery agents never `new MeshStandardMaterial` directly — they
// ask the kit. Materials and the small canvas textures that detail them are
// cached (per color where it makes sense) and tracked for a single dispose().
//
// Imports are deliberately limited to `three` and `./style` so this stays a leaf
// module the parallel agents can rely on.

import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { PALETTE, darken } from './style';

export interface MaterialKit {
  /** Bare/brushed metal in the given color. */
  metal(color: number, opts?: { roughness?: number; metalness?: number }): MeshStandardMaterial;
  /** Painted machine shell in the given color (subtle painted-metal detail). */
  painted(color: number): MeshStandardMaterial;
  /** The conveyor belt surface (scrolling chevron tread). */
  belt(): MeshStandardMaterial;
  /** The scrolling tread texture (renderer animates `.offset.y`). */
  beltTexture(): CanvasTexture;
  /** Tiling dirt/rock ground. */
  ground(): MeshStandardMaterial;
  /** Diagonal hazard stripes. */
  warningStripe(): MeshStandardMaterial;
  /** Unlit-ish emissive accent (glows under bloom). */
  emissiveAccent(color: number): MeshStandardMaterial;
  /** Free every geometry/texture/material this kit created. */
  dispose(): void;
}

// ---- procedural canvas texture helpers -------------------------------------

/** Draw a faint per-pixel value-noise wash, returns the 2d context's canvas. */
function noiseCanvas(size: number, base: string, jitter: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // sparse soft speckle so the surface isn't a flat plastic plane
  const dots = Math.floor(size * size * 0.05);
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = (Math.random() - 0.5) * jitter;
    ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** Vertical brushed streaks → a cheap roughness/detail map for metal. */
function brushedCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x++) {
    const v = 128 + (Math.random() - 0.5) * 70;
    ctx.strokeStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();
  }
  return c;
}

export function createMaterialKit(): MaterialKit {
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();

  const track = <M extends MeshStandardMaterial>(m: M): M => {
    materials.add(m);
    return m;
  };
  const trackTex = <T extends Texture>(t: T): T => {
    textures.add(t);
    return t;
  };

  // shared detail maps (one each, reused across colors)
  let brushedTex: CanvasTexture | null = null;
  const brushed = (): CanvasTexture => {
    if (!brushedTex) {
      brushedTex = trackTex(new CanvasTexture(brushedCanvas(128)));
      brushedTex.wrapS = brushedTex.wrapT = RepeatWrapping;
    }
    return brushedTex;
  };
  let paintTex: CanvasTexture | null = null;
  const paint = (): CanvasTexture => {
    if (!paintTex) {
      paintTex = trackTex(new CanvasTexture(noiseCanvas(128, '#7f7f7f', 0.18)));
      paintTex.wrapS = paintTex.wrapT = RepeatWrapping;
    }
    return paintTex;
  };

  const metalCache = new Map<string, MeshStandardMaterial>();
  const paintedCache = new Map<number, MeshStandardMaterial>();
  const emissiveCache = new Map<number, MeshStandardMaterial>();

  let beltTex: CanvasTexture | null = null;
  let beltMat: MeshStandardMaterial | null = null;
  let groundTex: CanvasTexture | null = null;
  let groundMat: MeshStandardMaterial | null = null;
  let warningMat: MeshStandardMaterial | null = null;

  function metal(color: number, opts?: { roughness?: number; metalness?: number }): MeshStandardMaterial {
    const roughness = opts?.roughness ?? 0.55;
    const metalness = opts?.metalness ?? 0.85;
    const key = `${color}|${roughness}|${metalness}`;
    let m = metalCache.get(key);
    if (!m) {
      m = track(
        new MeshStandardMaterial({
          color,
          roughness,
          metalness,
          roughnessMap: brushed(),
        }),
      );
      metalCache.set(key, m);
    }
    return m;
  }

  function painted(color: number): MeshStandardMaterial {
    let m = paintedCache.get(color);
    if (!m) {
      const tex = paint();
      m = track(
        new MeshStandardMaterial({
          color,
          roughness: 0.72,
          metalness: 0.12,
          roughnessMap: tex,
        }),
      );
      paintedCache.set(color, m);
    }
    return m;
  }

  function beltTexture(): CanvasTexture {
    if (!beltTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#283139';
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = '#56cbb8';
      x.lineWidth = 7;
      x.lineCap = 'round';
      // chevrons pointing "up" (-V); the texture scrolls to animate the tread
      for (let i = -1; i < 3; i++) {
        const yy = i * 32;
        x.beginPath();
        x.moveTo(10, yy + 26);
        x.lineTo(32, yy + 8);
        x.lineTo(54, yy + 26);
        x.stroke();
      }
      beltTex = trackTex(new CanvasTexture(c));
      beltTex.wrapS = beltTex.wrapT = RepeatWrapping;
    }
    return beltTex;
  }

  function belt(): MeshStandardMaterial {
    if (!beltMat) {
      beltMat = track(new MeshStandardMaterial({ map: beltTexture(), roughness: 0.7, metalness: 0.05 }));
    }
    return beltMat;
  }

  function ground(): MeshStandardMaterial {
    if (!groundMat) {
      // low-contrast dirt/rock: base mid tone with sparse dark+light speckle
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const mid = new Color(PALETTE.groundMid);
      ctx.fillStyle = `#${mid.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
      const dark = new Color(PALETTE.groundDark);
      const light = new Color(PALETTE.groundLight);
      // blotches of darker/lighter rock
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 1 + Math.random() * 3;
        const col = Math.random() < 0.5 ? dark : light;
        ctx.fillStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${0.08 + Math.random() * 0.18})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      groundTex = trackTex(new CanvasTexture(c));
      groundTex.wrapS = groundTex.wrapT = RepeatWrapping;
      groundTex.colorSpace = SRGBColorSpace;
      groundMat = track(new MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));
    }
    return groundMat;
  }

  function warningStripe(): MeshStandardMaterial {
    if (!warningMat) {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const warn = new Color(PALETTE.warning);
      const dk = new Color(PALETTE.warningDark);
      ctx.fillStyle = `#${warn.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = `#${dk.getHexString()}`;
      ctx.lineWidth = 12;
      for (let i = -size; i < size * 2; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
      }
      const tex = trackTex(new CanvasTexture(c));
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      warningMat = track(new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 }));
    }
    return warningMat;
  }

  function emissiveAccent(color: number): MeshStandardMaterial {
    let m = emissiveCache.get(color);
    if (!m) {
      m = track(
        new MeshStandardMaterial({
          color: darken(color, 0.3),
          emissive: color,
          emissiveIntensity: 1.2,
          roughness: 0.4,
          metalness: 0,
        }),
      );
      emissiveCache.set(color, m);
    }
    return m;
  }

  function dispose(): void {
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    materials.clear();
    textures.clear();
    metalCache.clear();
    paintedCache.clear();
    emissiveCache.clear();
    brushedTex = paintTex = beltTex = groundTex = null;
    beltMat = groundMat = warningMat = null;
  }

  return { metal, painted, belt, beltTexture, ground, warningStripe, emissiveAccent, dispose };
}
