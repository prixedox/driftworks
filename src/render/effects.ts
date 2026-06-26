// Particle / transient effects layer.
//
// Lightweight, legible additive FX that make the factory feel alive without
// obscuring machine state: smelter smoke + embers, miner dust, generator
// exhaust/flicker, and a soft sparkle riding each packet. Everything runs off a
// SINGLE fixed-size particle pool drawn as one `Points` cloud with an additive,
// depth-write-off shader, so the cost is bounded (a few hundred soft sprites)
// and bloom does the heavy lifting for the glow.
//
// The renderer constructs Effects, calls attach(scene) once, then update() each
// frame with the latest snapshot + a cellToWorld helper. Keep the seam stable.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  type Scene,
} from 'three';
import { ITEM_COLOR, type Snapshot } from '../sim/types';
import { PALETTE } from './style';
import type { MaterialKit } from './materials';

export interface EffectHelpers {
  /** Map a sim cell index to its tile-center world position. */
  cellToWorld(cell: number): { x: number; z: number };
}

/** Hard cap on live sprites. Cheap on phones; bloom makes a little go far. */
const MAX_PARTICLES = 560;

/** Machine body top (models.ts MACH_H = 0.72) — emit smoke just above it. */
const MACH_TOP = 0.72;
/** World Y the belt packets ride at (renderer/lab agree on 0.31). */
const PACKET_Y = 0.31;

// A drifting-vertex point shader: per-particle size + alpha + color, soft sprite,
// additive. This is a RAW ShaderMaterial, so we declare the `color` attribute and
// the vColor varying ourselves (THREE only auto-injects those for built-ins).
const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 color;
  uniform float uViewportH; // framebuffer height in px
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mv;
    gl_Position = clip;
    // Convert a world-space radius (aSize) into a pixel point size that works for
    // BOTH orthographic and perspective cameras: offset the point by aSize in
    // view-space X, project it, and measure the clip-space delta in pixels.
    vec4 clipEdge = projectionMatrix * (mv + vec4(aSize, 0.0, 0.0, 0.0));
    float ndcDx = clipEdge.x / max(clipEdge.w, 1e-4) - clip.x / max(clip.w, 1e-4);
    gl_PointSize = max(abs(ndcDx) * 0.5 * uViewportH, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    // additive: the sprite's soft alpha shapes the splat, vAlpha is the fade
    // envelope, vColor is the tint. No real alpha channel needed (additive).
    float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/** Build a soft round radial-gradient sprite (white core → transparent edge). */
function makeSpriteTexture(): CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class Effects {
  // The kit is retained per the seam; particles use their own additive material.
  private kit: MaterialKit;

  private group: Points | null = null;
  private geom: BufferGeometry | null = null;
  private mat: ShaderMaterial | null = null;
  private sprite: CanvasTexture | null = null;

  // Pool storage (Structure-of-Arrays). Index i is one particle slot.
  private px = new Float32Array(MAX_PARTICLES * 3); // packed positions (also the buffer)
  private vx = new Float32Array(MAX_PARTICLES * 3); // velocities
  private age = new Float32Array(MAX_PARTICLES);
  private life = new Float32Array(MAX_PARTICLES); // 0 = dead slot
  private size0 = new Float32Array(MAX_PARTICLES); // birth size
  private size1 = new Float32Array(MAX_PARTICLES); // death size (smoke expands)
  private alpha0 = new Float32Array(MAX_PARTICLES); // peak alpha
  private drag = new Float32Array(MAX_PARTICLES); // per-particle velocity damping/s
  // Per-particle base color, stays constant; alpha attribute fades it out.
  private colArr = new Float32Array(MAX_PARTICLES * 3);

  // GPU-side buffers (reused, never re-allocated per frame).
  private posAttr: BufferAttribute | null = null;
  private colAttr: BufferAttribute | null = null;
  private sizeAttr: BufferAttribute | null = null;
  private alphaAttr: BufferAttribute | null = null;

  private cursor = 0; // round-robin allocation hint

  // Per-emitter spawn accumulators (keyed by cell) so throttling is smooth and
  // independent of frame rate. Cleared lazily; map size ~= machine count.
  private accum = new Map<number, number>();
  // Packet sparkle throttles, keyed by packet id.
  private pktAccum = new Map<number, number>();

  // Scratch — never allocate in update().
  private tmpCol = new Color();

  constructor(kit: MaterialKit) {
    this.kit = kit;
  }

  /** Framebuffer height in px (matches the renderer/composer pixel-ratio clamp),
   *  used to convert world-space particle radii into pixel point sizes. */
  private viewportH(): number {
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return Math.max(1, h * dpr);
  }

  /** Add the effects group(s) to the scene. */
  attach(scene: Scene): void {
    void this.kit;
    this.sprite = makeSpriteTexture();

    const geom = new BufferGeometry();
    // position buffer IS this.px so we mutate in place then flag for upload.
    this.posAttr = new BufferAttribute(this.px, 3);
    this.posAttr.setUsage(DynamicDrawUsage);
    this.colAttr = new BufferAttribute(this.colArr, 3);
    this.colAttr.setUsage(DynamicDrawUsage);
    this.sizeAttr = new BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.sizeAttr.setUsage(DynamicDrawUsage);
    this.alphaAttr = new BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.alphaAttr.setUsage(DynamicDrawUsage);

    geom.setAttribute('position', this.posAttr);
    // raw shader declares the `color` attribute itself (no vertexColors injection)
    geom.setAttribute('color', this.colAttr);
    geom.setAttribute('aSize', this.sizeAttr);
    geom.setAttribute('aAlpha', this.alphaAttr);
    geom.setDrawRange(0, MAX_PARTICLES);

    const mat = new ShaderMaterial({
      uniforms: {
        uTex: { value: this.sprite },
        uViewportH: { value: this.viewportH() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });

    const points = new Points(geom, mat);
    points.frustumCulled = false;
    points.renderOrder = 2; // draw after opaque machines

    this.geom = geom;
    this.mat = mat;
    this.group = points;
    scene.add(points);
  }

  /** Per-frame update driven by the renderer. */
  update(dt: number, _now: number, s: Snapshot, h: EffectHelpers): void {
    // Not attached, or sim paused → freeze: leave the buffers as-is (particles
    // simply hang in place until play resumes). No spawning, no aging.
    if (!this.group || s.paused) return;
    // clamp dt so a tab-switch hitch can't fling particles across the map
    const d = Math.min(dt, 0.05);

    // keep the point-size pixel scale in sync with the (possibly resized) canvas
    if (this.mat) this.mat.uniforms.uViewportH.value = this.viewportH();

    this.spawn(d, s, h);
    this.advance(d);
    this.flush();
  }

  // ---- emission --------------------------------------------------------------

  private spawn(dt: number, s: Snapshot, h: EffectHelpers): void {
    const seen = new Set<number>();

    for (const m of s.modules) {
      if (!m.busy) continue;
      const w = h.cellToWorld(m.cell);
      seen.add(m.cell);
      switch (m.type) {
        case 'smelter':
          this.emitSmelter(m.cell, w.x, w.z, dt);
          break;
        case 'miner':
          this.emitMiner(m.cell, w.x, w.z, dt);
          break;
        case 'generator':
          this.emitGenerator(m.cell, w.x, w.z, dt);
          break;
        case 'assembler':
        case 'lab':
          this.emitWork(m.cell, w.x, w.z, dt, m.type === 'lab' ? PALETTE.packetGlow : 0x9a6bff);
          break;
        default:
          break;
      }
    }

    // packet sparkle — a gentle twinkle riding each packet
    const live = new Set<number>();
    for (const p of s.packets) {
      live.add(p.id);
      this.emitPacket(p.id, p.x, p.y, p.item, dt);
    }
    // prune accumulators for emitters/packets that vanished so the maps stay small
    if (this.accum.size > seen.size + 8) {
      for (const k of this.accum.keys()) if (!seen.has(k)) this.accum.delete(k);
    }
    if (this.pktAccum.size > live.size + 8) {
      for (const k of this.pktAccum.keys()) if (!live.has(k)) this.pktAccum.delete(k);
    }
  }

  /** Smelter: slow grey smoke from the chimney + a few warm embers near the door. */
  private emitSmelter(cell: number, x: number, z: number, dt: number): void {
    // smoke ~12/s, embers ~10/s (handled via shared accumulator with fractional rate)
    const key = cell;
    const prev = this.accum.get(key) ?? 0;
    let acc = prev + dt * 12; // smoke units/s
    while (acc >= 1) {
      acc -= 1;
      this.emitSmoke(x, z);
    }
    this.accum.set(key, acc);

    // embers: a couple per ~100ms, sampled stochastically so they sparkle
    if (Math.random() < dt * 9) this.emitEmber(x, z);
    if (Math.random() < dt * 5) this.emitEmber(x, z);
  }

  private emitSmoke(x: number, z: number): void {
    const i = this.alloc();
    if (i < 0) return;
    const jx = (Math.random() - 0.5) * 0.22;
    const jz = (Math.random() - 0.5) * 0.22;
    this.setPos(i, x + jx, MACH_TOP + 0.12, z + jz);
    // gentle lateral drift so the plume puffs out instead of reading as a line
    this.setVel(i, (Math.random() - 0.5) * 0.22, 0.4 + Math.random() * 0.2, (Math.random() - 0.5) * 0.22);
    this.life[i] = 2.0 + Math.random() * 0.9;
    this.age[i] = 0;
    this.size0[i] = 0.55 + Math.random() * 0.25;
    this.size1[i] = 1.7 + Math.random() * 0.7; // billows out as it rises
    this.alpha0[i] = 0.3 + Math.random() * 0.1; // dim grey: a soft column, not a wall
    this.drag[i] = 0.35;
    // warm-grey ash (slightly hot near the smelter)
    this.setCol(i, 0.48, 0.43, 0.4);
  }

  private emitEmber(x: number, z: number): void {
    const i = this.alloc();
    if (i < 0) return;
    const jx = (Math.random() - 0.5) * 0.34;
    const jz = (Math.random() - 0.5) * 0.34;
    this.setPos(i, x + jx, MACH_TOP * 0.55 + Math.random() * 0.2, z + jz);
    this.setVel(i, jx * 0.6, 0.55 + Math.random() * 0.5, jz * 0.6);
    this.life[i] = 0.7 + Math.random() * 0.5;
    this.age[i] = 0;
    this.size0[i] = 0.16 + Math.random() * 0.1;
    this.size1[i] = 0.05;
    this.alpha0[i] = 0.9 + Math.random() * 0.4; // bright → blooms
    this.drag[i] = 1.4;
    this.setColHex(i, 0xff7a2e);
  }

  /** Miner: short-lived tan/grey dust kicked up at the drill point (low). */
  private emitMiner(cell: number, x: number, z: number, dt: number): void {
    const key = cell;
    let acc = (this.accum.get(key) ?? 0) + dt * 16; // dust units/s
    while (acc >= 1) {
      acc -= 1;
      this.emitDust(x, z);
    }
    this.accum.set(key, acc);
  }

  private emitDust(x: number, z: number): void {
    const i = this.alloc();
    if (i < 0) return;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.3;
    const jx = Math.cos(ang) * rad;
    const jz = Math.sin(ang) * rad;
    this.setPos(i, x + jx, 0.08 + Math.random() * 0.08, z + jz);
    this.setVel(i, jx * 1.4, 0.18 + Math.random() * 0.25, jz * 1.4);
    this.life[i] = 0.55 + Math.random() * 0.4;
    this.age[i] = 0;
    this.size0[i] = 0.22 + Math.random() * 0.12;
    this.size1[i] = 0.5 + Math.random() * 0.2;
    this.alpha0[i] = 0.2 + Math.random() * 0.08; // dust is faint, never hides the drill
    this.drag[i] = 2.2;
    // tan/grey
    this.setCol(i, 0.55, 0.46, 0.34);
  }

  /** Generator: faint exhaust wisps + a subtle electric-blue flicker glow. */
  private emitGenerator(cell: number, x: number, z: number, dt: number): void {
    const key = cell;
    let acc = (this.accum.get(key) ?? 0) + dt * 7; // exhaust units/s
    while (acc >= 1) {
      acc -= 1;
      this.emitExhaust(x, z);
    }
    this.accum.set(key, acc);
    // electric flicker: occasional bright blue spark hovering at the top
    if (Math.random() < dt * 8) this.emitFlicker(x, z);
  }

  private emitExhaust(x: number, z: number): void {
    const i = this.alloc();
    if (i < 0) return;
    const jx = (Math.random() - 0.5) * 0.26;
    const jz = (Math.random() - 0.5) * 0.26;
    this.setPos(i, x + jx, MACH_TOP + 0.06, z + jz);
    this.setVel(i, (Math.random() - 0.5) * 0.2, 0.26 + Math.random() * 0.16, (Math.random() - 0.5) * 0.2);
    this.life[i] = 1.3 + Math.random() * 0.6;
    this.age[i] = 0;
    this.size0[i] = 0.36 + Math.random() * 0.18;
    this.size1[i] = 1.0 + Math.random() * 0.4;
    this.alpha0[i] = 0.14 + Math.random() * 0.05; // very faint wisp
    this.drag[i] = 0.6;
    this.setCol(i, 0.4, 0.46, 0.52); // cool grey wisp
  }

  private emitFlicker(x: number, z: number): void {
    const i = this.alloc();
    if (i < 0) return;
    const jx = (Math.random() - 0.5) * 0.5;
    const jz = (Math.random() - 0.5) * 0.5;
    this.setPos(i, x + jx, MACH_TOP * 0.7 + Math.random() * MACH_TOP, z + jz);
    this.setVel(i, 0, 0.05, 0);
    this.life[i] = 0.16 + Math.random() * 0.14; // a blink
    this.age[i] = 0;
    this.size0[i] = 0.3 + Math.random() * 0.2;
    this.size1[i] = 0.12;
    this.alpha0[i] = 0.55 + Math.random() * 0.35; // electric-blue blink (kept tame)
    this.drag[i] = 0.5;
    this.setColHex(i, PALETTE.packetGlow);
  }

  /** Assembler / lab: quiet motes drifting up, tinted to the machine accent. */
  private emitWork(cell: number, x: number, z: number, dt: number, hex: number): void {
    const key = cell;
    let acc = (this.accum.get(key) ?? 0) + dt * 6;
    while (acc >= 1) {
      acc -= 1;
      const i = this.alloc();
      if (i < 0) break;
      const jx = (Math.random() - 0.5) * 0.4;
      const jz = (Math.random() - 0.5) * 0.4;
      this.setPos(i, x + jx, MACH_TOP * 0.6 + Math.random() * 0.3, z + jz);
      this.setVel(i, jx * 0.2, 0.3 + Math.random() * 0.2, jz * 0.2);
      this.life[i] = 0.9 + Math.random() * 0.5;
      this.age[i] = 0;
      this.size0[i] = 0.18 + Math.random() * 0.12;
      this.size1[i] = 0.06;
      this.alpha0[i] = 0.4 + Math.random() * 0.25;
      this.drag[i] = 1.0;
      this.setColHex(i, hex);
    }
    this.accum.set(key, acc);
  }

  /** Packet sparkle — a soft additive twinkle tracking the moving packet. */
  private emitPacket(id: number, tileX: number, tileY: number, item: keyof typeof ITEM_COLOR, dt: number): void {
    let acc = (this.pktAccum.get(id) ?? 0) + dt * 14; // twinkles/s
    const hex = ITEM_COLOR[item];
    while (acc >= 1) {
      acc -= 1;
      const i = this.alloc();
      if (i < 0) break;
      const jx = (Math.random() - 0.5) * 0.22;
      const jy = (Math.random() - 0.5) * 0.18;
      const jz = (Math.random() - 0.5) * 0.22;
      this.setPos(i, tileX + jx, PACKET_Y + 0.12 + jy, tileY + jz);
      this.setVel(i, jx * 0.3, 0.12 + Math.random() * 0.1, jz * 0.3);
      this.life[i] = 0.45 + Math.random() * 0.35;
      this.age[i] = 0;
      this.size0[i] = 0.14 + Math.random() * 0.12;
      this.size1[i] = 0.02;
      this.alpha0[i] = 0.55 + Math.random() * 0.4; // bright tint → blooms with the packet
      this.drag[i] = 0.4;
      this.setColHex(i, hex);
    }
    this.pktAccum.set(id, acc);
  }

  // ---- simulation ------------------------------------------------------------

  private advance(dt: number): void {
    const px = this.px;
    const vx = this.vx;
    const life = this.life;
    const age = this.age;
    const sizeBuf = this.sizeAttr!.array as Float32Array;
    const alphaBuf = this.alphaAttr!.array as Float32Array;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const l = life[i];
      if (l <= 0) {
        // dead: park it off-frustum-irrelevant and zero its visible size/alpha
        sizeBuf[i] = 0;
        alphaBuf[i] = 0;
        continue;
      }
      let a = age[i] + dt;
      if (a >= l) {
        life[i] = 0;
        sizeBuf[i] = 0;
        alphaBuf[i] = 0;
        continue;
      }
      age[i] = a;

      const b = i * 3;
      // velocity damping (exponential-ish, frame-rate independent enough)
      const damp = 1 - Math.min(1, this.drag[i] * dt);
      vx[b] *= damp;
      vx[b + 1] *= damp;
      vx[b + 2] *= damp;
      px[b] += vx[b] * dt;
      px[b + 1] += vx[b + 1] * dt;
      px[b + 2] += vx[b + 2] * dt;

      const t = a / l; // 0..1 normalized life
      // size lerps birth → death
      sizeBuf[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // alpha: quick rise then ease-out fade, scaled by peak alpha
      const env = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      alphaBuf[i] = this.alpha0[i] * (env < 0 ? 0 : env);
    }
  }

  private flush(): void {
    this.posAttr!.needsUpdate = true;
    this.colAttr!.needsUpdate = true;
    this.sizeAttr!.needsUpdate = true;
    this.alphaAttr!.needsUpdate = true;
  }

  // ---- pool helpers ----------------------------------------------------------

  /** Find a free (or oldest-reclaimable) slot. Round-robin keeps it O(1)-ish. */
  private alloc(): number {
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (this.life[i] <= 0) return i;
    }
    return -1; // pool saturated this frame — drop the spawn (cheap + safe)
  }

  private setPos(i: number, x: number, y: number, z: number): void {
    const b = i * 3;
    this.px[b] = x;
    this.px[b + 1] = y;
    this.px[b + 2] = z;
  }

  private setVel(i: number, x: number, y: number, z: number): void {
    const b = i * 3;
    this.vx[b] = x;
    this.vx[b + 1] = y;
    this.vx[b + 2] = z;
  }

  private setCol(i: number, r: number, g: number, b: number): void {
    const o = i * 3;
    this.colArr[o] = r;
    this.colArr[o + 1] = g;
    this.colArr[o + 2] = b;
  }

  private setColHex(i: number, hex: number): void {
    this.tmpCol.setHex(hex);
    const o = i * 3;
    this.colArr[o] = this.tmpCol.r;
    this.colArr[o + 1] = this.tmpCol.g;
    this.colArr[o + 2] = this.tmpCol.b;
  }

  /** Free any GPU resources this layer created. */
  dispose(): void {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    this.geom?.dispose();
    this.mat?.dispose();
    this.sprite?.dispose();
    this.geom = null;
    this.mat = null;
    this.sprite = null;
    this.group = null;
    this.posAttr = this.colAttr = this.sizeAttr = this.alphaAttr = null;
    this.accum.clear();
    this.pktAccum.clear();
  }
}
