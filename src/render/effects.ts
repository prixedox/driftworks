// Particle / transient effects layer.
//
// STUB STAGE: every method is a no-op. A later agent fills this in (sparks,
// smelter heat shimmer, packet trails, power arcs, etc.) WITHOUT touching the
// renderer — the renderer already constructs Effects, attaches it to the scene,
// and calls update() each frame with a fresh snapshot + a cellToWorld helper.
//
// Keep this seam stable. The renderer relies on exactly this shape.

import type { Scene } from 'three';
import type { Snapshot } from '../sim/types';
import type { MaterialKit } from './materials';

export interface EffectHelpers {
  /** Map a sim cell index to its tile-center world position. */
  cellToWorld(cell: number): { x: number; z: number };
}

export class Effects {
  // The kit is retained for the later agent to mint particle materials from.
  private kit: MaterialKit;

  constructor(kit: MaterialKit) {
    this.kit = kit;
  }

  /** Add the effects group(s) to the scene. */
  attach(_scene: Scene): void {
    // no-op (later: build + add particle systems)
    void this.kit;
  }

  /** Per-frame update driven by the renderer. */
  update(_dt: number, _now: number, _s: Snapshot, _h: EffectHelpers): void {
    // no-op
  }

  /** Free any GPU resources this layer created. */
  dispose(): void {
    // no-op
  }
}
