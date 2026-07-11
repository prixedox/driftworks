import type { Snapshot } from '../sim/types';
import { DEFS, ITEM_COLOR, MINIMAP_ORE, MINIMAP_MODULE_ORDER } from '../sim/types';

const CELL_PX = 3; // pixels per tile cell
const PAD = 2;     // padding inside the canvas border

/** Three.js 0xRRGGBB → "r,g,b" for rgba(). */
function rgb(hex: number): string {
  return `${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff}`;
}

/**
 * Colour for a minimap layer value. Built from the SAME encoding the sim writes
 * (MINIMAP_ORE / MINIMAP_MODULE_ORDER) so the UI never reads ore[]/modules
 * directly — Phase 3 can swap the sim's layer source without touching this.
 */
function layerColor(v: number): string | null {
  if (v === 0) return null;
  if (v === MINIMAP_ORE) return `rgba(${rgb(ITEM_COLOR.ore)},0.5)`;
  const mod = MINIMAP_MODULE_ORDER[v - 2];
  if (!mod) return null;
  return `rgba(${rgb(DEFS[mod].color)},0.95)`;
}

export interface Minimap {
  update(s: Snapshot, px: number, py: number): void;
}

export function buildMinimap(root: HTMLElement): Minimap {
  const wrap = document.createElement('div');
  wrap.className = 'dw-minimap';
  const canvas = document.createElement('canvas');
  canvas.width = 40 * CELL_PX + PAD * 2;
  canvas.height = 26 * CELL_PX + PAD * 2;
  wrap.append(canvas);
  root.append(wrap);
  const ctx = canvas.getContext('2d')!;

  return {
    update(s, px, py) {
      const W = s.w * CELL_PX + PAD * 2;
      const H = s.h * CELL_PX + PAD * 2;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

      ctx.fillStyle = 'rgba(10,12,14,0.85)';
      ctx.fillRect(0, 0, W, H);

      // Draw the sim-provided layer: one cell per non-empty tile.
      const layer = s.minimap;
      for (let c = 0; c < layer.length; c++) {
        const color = layerColor(layer[c]);
        if (!color) continue;
        const cx = (c % s.w) * CELL_PX + PAD;
        const cy = Math.floor(c / s.w) * CELL_PX + PAD;
        ctx.fillStyle = color;
        // ore drawn as a small 2×2 blob; machines fill the whole cell
        if (layer[c] === MINIMAP_ORE) ctx.fillRect(cx, cy, 2, 2);
        else ctx.fillRect(cx, cy, CELL_PX, CELL_PX);
      }

      // Player dot — bright white 3×3, positioned from the renderer.
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(Math.round(px * CELL_PX + PAD - 1), Math.round(py * CELL_PX + PAD - 1), 3, 3);

      // Border
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    },
  };
}
