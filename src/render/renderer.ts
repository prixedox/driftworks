import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { DEFS, DX, DY, EXPLAIN, ITEM_COLOR, type Dir, type ItemType, type Snapshot } from '../sim/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;
const TILE = 46;
const WALK_SPEED = 6.5;
const AURA_POOL = 40;
const PARTICLE_POOL = 220;
const MACH_H = 15; // extruded machine height (px) — the 2.5D "lift" off the floor

const darken = (c: number, f: number): number => {
  const r = Math.floor(((c >> 16) & 255) * f);
  const g = Math.floor(((c >> 8) & 255) * f);
  const b = Math.floor((c & 255) * f);
  return (r << 16) | (g << 8) | b;
};

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  tint: number;
}

// Neon-industrial presentation: a follow-camera over a tiled world, with
// additive-glow bloom, merged ore deposits, particles, and a vignette. The
// deterministic factory sim drives it; this layer is pure look + feel.
export class Renderer {
  readonly app = new Application();
  private parent!: HTMLElement;

  private world = new Container();
  private terrain = new Graphics();
  private auraLayer = new Container(); // additive machine/ambient glows (pooled)
  private moduleLayer = new Container();
  private fx = new Graphics();
  private packetLayer = new Container();
  private particleLayer = new Container(); // additive particles (pooled)
  private playerLayer = new Container();
  private playerG = new Graphics();
  private playerGlow!: Sprite;
  private vignette!: Sprite;

  private glowTex!: Texture;
  private auraPool: Sprite[] = [];
  private particlePool: Sprite[] = [];
  private particles: Particle[] = [];
  private packetSprites = new Map<number, { c: Container; glow: Sprite }>();

  private snap: Snapshot | null = null;
  private snapTime = 0;
  private lastOreSig = -1;
  private explain = true;
  private storageFlash = -1e9;
  private prevStored = 0;
  private emitAcc = 0;

  private player = { x: 20.5, y: 13.5 };
  private move = { x: 0, y: 0 };
  private facing: Dir = 2;
  private moving = false;

  async init(parent: HTMLElement): Promise<void> {
    this.parent = parent;
    await this.app.init({
      background: 0x090c11,
      width: parent.clientWidth,
      height: parent.clientHeight,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    parent.appendChild(this.app.canvas);

    this.glowTex = this.makeRadialTexture(['rgba(255,255,255,1)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']);

    // Glow / particle pools.
    for (let i = 0; i < AURA_POOL; i++) {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.auraLayer.addChild(s);
      this.auraPool.push(s);
    }
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.particleLayer.addChild(s);
      this.particlePool.push(s);
      this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, tint: 0xffffff });
    }

    this.playerGlow = new Sprite(this.glowTex);
    this.playerGlow.anchor.set(0.5);
    this.playerGlow.blendMode = 'add';
    this.playerGlow.tint = 0x5ad1c0;
    this.playerLayer.addChild(this.playerGlow, this.playerG);

    this.world.addChild(this.terrain, this.auraLayer, this.moduleLayer, this.fx, this.packetLayer, this.particleLayer, this.playerLayer);

    this.vignette = new Sprite(this.makeRadialTexture(['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(6,8,12,0.38)']));
    this.app.stage.addChild(this.world, this.vignette);

    this.app.ticker.add(() => this.frame());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private makeRadialTexture(stops: [string, string, string] | string[]): Texture {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.5, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(c);
  }

  private resize(): void {
    this.app.renderer.resize(this.parent.clientWidth, this.parent.clientHeight);
    if (this.vignette) {
      this.vignette.width = this.app.screen.width;
      this.vignette.height = this.app.screen.height;
    }
  }

  private cx(cell: number): number {
    const w = this.snap?.w ?? 40;
    return ((cell % w) + 0.5) * TILE;
  }

  private cy(cell: number): number {
    const w = this.snap?.w ?? 40;
    return (Math.floor(cell / w) + 0.5) * TILE;
  }

  private drawTerrain(): void {
    if (!this.snap) return;
    const g = this.terrain;
    const w = this.snap.w;
    const h = this.snap.h;
    g.clear();
    g.rect(0, 0, w * TILE, h * TILE).fill(0x18261d);
    // deterministic speckle texture so the ground isn't a flat slab
    let seed = 9871;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < w * h * 1.3; i++) {
      const px = rnd() * w * TILE;
      const py = rnd() * h * TILE;
      const shade = rnd() > 0.5 ? 0x0d140f : 0x172219;
      g.circle(px, py, 1 + rnd() * 2).fill({ color: shade, alpha: 0.6 });
    }
    // tile grid
    for (let x = 0; x <= w; x++) g.moveTo(x * TILE, 0).lineTo(x * TILE, h * TILE);
    for (let y = 0; y <= h; y++) g.moveTo(0, y * TILE).lineTo(w * TILE, y * TILE);
    g.stroke({ width: 1, color: 0x1a261d, alpha: 0.7 });

    // ore deposits: merged blobs (no gaps) + bright crystals + outlined edges
    const ore = new Set(this.snap.ore);
    for (const cell of ore) {
      const x = (cell % w) * TILE;
      const y = Math.floor(cell / w) * TILE;
      g.rect(x, y, TILE, TILE).fill({ color: 0xa06f30 });
      g.circle(x + TILE / 2, y + TILE / 2, TILE * 0.72).fill({ color: 0xe8a35a, alpha: 0.12 }); // ambient amber wash
    }
    for (const cell of ore) {
      const cxp = cell % w;
      const cyp = Math.floor(cell / w);
      const x = cxp * TILE;
      const y = cyp * TILE;
      for (let k = 0; k < 2; k++) {
        g.circle(x + (0.2 + rnd() * 0.6) * TILE, y + (0.2 + rnd() * 0.6) * TILE, 1.6 + rnd() * 2).fill({
          color: 0xffd07a,
          alpha: 0.85,
        });
      }
      // outline only on edges facing non-ore (auto-tiling the blob border)
      if (!ore.has(this.snap.w * cyp + (cxp - 1)) || cxp === 0) g.moveTo(x, y).lineTo(x, y + TILE);
      if (!ore.has(this.snap.w * cyp + (cxp + 1)) || cxp === w - 1) g.moveTo(x + TILE, y).lineTo(x + TILE, y + TILE);
      if (!ore.has(this.snap.w * (cyp - 1) + cxp) || cyp === 0) g.moveTo(x, y).lineTo(x + TILE, y);
      if (!ore.has(this.snap.w * (cyp + 1) + cxp) || cyp === h - 1) g.moveTo(x, y + TILE).lineTo(x + TILE, y + TILE);
    }
    g.stroke({ width: 2, color: 0xc98a3e, alpha: 0.8 });
    g.rect(0, 0, w * TILE, h * TILE).stroke({ width: 4, color: 0x2b3645 });

    // Raised ore crystals poking out of the deposit (drawn last so fills don't
    // disturb the edge-outline path above).
    for (const cell of ore) {
      if (rnd() > 0.4) continue;
      const ccx = (cell % w) * TILE + (0.3 + rnd() * 0.4) * TILE;
      const ccy = Math.floor(cell / w) * TILE + (0.3 + rnd() * 0.4) * TILE;
      g.ellipse(ccx + 2, ccy + 5, 5.5, 2.6).fill({ color: 0x000000, alpha: 0.22 }); // shadow
      g.poly([ccx, ccy - 9, ccx + 5, ccy - 1, ccx, ccy + 3, ccx - 5, ccy - 1]).fill({ color: 0xc98336 }); // crystal
      g.poly([ccx, ccy - 9, ccx + 5, ccy - 1, ccx, ccy - 1]).fill({ color: 0xffd98a }); // lit facet
    }
  }

  private arrow(g: Graphics, cell: number, dir: Dir, yoff = 0): void {
    const cx = this.cx(cell);
    const cy = this.cy(cell) + yoff;
    const ex = cx + DX[dir] * TILE * 0.34;
    const ey = cy + DY[dir] * TILE * 0.34;
    const bx = -DX[dir];
    const by = -DY[dir];
    const px = -DY[dir];
    const py = DX[dir];
    const sz = TILE * 0.12;
    g.poly([ex, ey, ex + bx * sz + px * sz, ey + by * sz + py * sz, ex + bx * sz - px * sz, ey + by * sz - py * sz]).fill({
      color: 0xffffff,
      alpha: 0.9,
    });
  }

  private label(text: string, x: number, y: number, size: number, color: number): Text {
    const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fontWeight: 'bold', fill: color } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    return t;
  }

  private drawModules(): void {
    if (!this.snap) return;
    for (const child of this.moduleLayer.removeChildren()) child.destroy();
    const w = this.snap.w;
    const s = TILE;
    const sz = s - 6;
    // Top rows first so lower (nearer) machines overlap the ones behind them.
    const mods = [...this.snap.modules].sort((a, b) => Math.floor(a.cell / w) - Math.floor(b.cell / w));
    for (const m of mods) {
      const cx = this.cx(m.cell);
      const cy = this.cy(m.cell);
      const x = cx - sz / 2;
      const y = cy - sz / 2;
      const g = new Graphics();

      if (m.type === 'conveyor') {
        // Belts are floor-level channels (no height).
        g.roundRect(x, y, sz, sz, 6).fill({ color: 0x222c36 });
        g.roundRect(x + 4, y + 4, sz - 8, sz - 8, 4).fill({ color: 0x2f3a47 });
        this.moduleLayer.addChild(g);
        continue;
      }

      const def = DEFS[m.type];
      g.ellipse(cx + 5, cy + sz * 0.42, sz * 0.55, sz * 0.28).fill({ color: 0x000000, alpha: 0.34 }); // ground shadow
      g.roundRect(x, y, sz, sz, 9).fill({ color: darken(def.color, 0.5) }); // base / front wall (the height)
      g.roundRect(x, y - MACH_H, sz, sz, 9).fill({ color: def.color }); // raised top face
      g.roundRect(x + 2, y - MACH_H + 2, sz - 4, sz * 0.4, 7).fill({ color: 0xffffff, alpha: 0.13 }); // sheen
      g.roundRect(x, y - MACH_H, sz, sz, 9).stroke({ width: 2.5, color: 0x080b0f, alpha: 0.9 });
      if (m.type === 'miner' || m.type === 'smelter') this.arrow(g, m.cell, m.dir, -MACH_H);
      this.moduleLayer.addChild(g);
      this.moduleLayer.addChild(this.label(def.short, cx, cy - MACH_H, Math.max(8, Math.floor(s * 0.17)), 0xffffff));
      if (this.explain) {
        this.moduleLayer.addChild(this.label(EXPLAIN[m.type], cx, cy + s * 0.5, Math.max(8, Math.floor(s * 0.15)), 0xa9bccf));
      }
    }
  }

  private chevron(g: Graphics, x: number, y: number, dir: Dir, size: number, color: number, alpha: number): void {
    const fx = x + DX[dir] * size;
    const fy = y + DY[dir] * size;
    const bx = x - DX[dir] * size;
    const by = y - DY[dir] * size;
    const px = -DY[dir];
    const py = DX[dir];
    g.moveTo(fx, fy).lineTo(bx + px * size, by + py * size);
    g.moveTo(fx, fy).lineTo(bx - px * size, by - py * size);
    g.stroke({ width: Math.max(2, size * 0.55), color, alpha });
  }

  /** Position a pooled additive glow sprite. Returns the next free index. */
  private aura(idx: number, x: number, y: number, diameter: number, tint: number, alpha: number): number {
    if (idx >= this.auraPool.length || alpha <= 0) return idx;
    const s = this.auraPool[idx];
    s.visible = true;
    s.position.set(x, y);
    s.tint = tint;
    s.alpha = alpha;
    s.scale.set(diameter / 128);
    return idx + 1;
  }

  private drawFx(t: number): void {
    const g = this.fx;
    g.clear();
    if (!this.snap) return;
    const s = TILE;
    const beat = (1 - t) * (1 - t);
    let ai = 0;
    for (const m of this.snap.modules) {
      const cx = this.cx(m.cell);
      const cy = this.cy(m.cell);
      const top = cy - MACH_H; // raised machines: effects sit on the top face
      switch (m.type) {
        case 'conveyor':
          for (let k = 0; k < 3; k++) {
            const u = ((k / 3 + t) % 1) - 0.5;
            this.chevron(g, cx + DX[m.dir] * u * s, cy + DY[m.dir] * u * s, m.dir, s * 0.13, 0x6fe6d4, 0.6);
          }
          break;
        case 'miner':
          if (m.busy) ai = this.aura(ai, cx, top, s * 2.0, 0xffcf6b, 0.45 * beat + 0.12);
          break;
        case 'smelter': {
          const r = s * 0.32;
          g.circle(cx, top, r).stroke({ width: 2, color: 0xffd24a, alpha: 0.45 });
          const p = m.progress ?? 0;
          if (p > 0) {
            g.moveTo(cx, top);
            g.arc(cx, top, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p));
            g.lineTo(cx, top);
            g.fill({ color: 0xffd24a, alpha: 0.4 });
          }
          if (m.busy) ai = this.aura(ai, cx, top, s * 2.2, 0xff7a4a, 0.45 * beat + 0.18);
          break;
        }
        case 'generator':
          ai = this.aura(ai, cx, top, s * 1.7, 0xffe27a, 0.16 + 0.14 * beat);
          break;
        case 'storage': {
          const since = (performance.now() - this.storageFlash) / 360;
          if (since >= 0 && since < 1) ai = this.aura(ai, cx, top, s * 2.0, 0x6effb0, 0.5 * (1 - since));
          break;
        }
      }
    }
    for (let i = ai; i < this.auraPool.length; i++) this.auraPool[i].visible = false;
  }

  private drawPacketCore(g: Graphics, item: ItemType): void {
    const r = TILE * 0.16;
    g.clear();
    const c = ITEM_COLOR[item];
    const d = darken(c, 0.6);
    const hw = item === 'plate' ? r * 1.25 : r; // plates are wider, flatter ingots
    const hh = item === 'plate' ? r * 0.7 : r;
    g.ellipse(0, r * 0.95, hw * 1.05, r * 0.42).fill({ color: 0x000000, alpha: 0.3 }); // shadow
    g.roundRect(-hw, -hh * 0.1, hw * 2, hh * 1.1, 3).fill({ color: d }); // front face
    g.roundRect(-hw, -hh * 0.9, hw * 2, hh * 1.1, 3)
      .fill({ color: c })
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 }); // raised top
  }

  private makePacket(item: ItemType): { c: Container; glow: Sprite } {
    const c = new Container();
    const glow = new Sprite(this.glowTex);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = ITEM_COLOR[item];
    glow.alpha = 0.55;
    glow.scale.set((TILE * 0.95) / 128);
    const core = new Graphics();
    this.drawPacketCore(core, item);
    c.addChild(glow, core);
    return { c, glow };
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, tint: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.max = life;
      p.size = size;
      p.tint = tint;
      return;
    }
  }

  private emit(dt: number): void {
    if (!this.snap) return;
    this.emitAcc += dt;
    const rnd = Math.random;
    for (const m of this.snap.modules) {
      if (!m.busy) continue;
      const cx = this.cx(m.cell);
      const cy = this.cy(m.cell);
      if (m.type === 'miner' && rnd() < dt * 14) {
        const a = rnd() * TAU;
        this.spawn(cx, cy, Math.cos(a) * 60, Math.sin(a) * 60 - 20, 0.4, 5, 0xffd27a);
      } else if (m.type === 'smelter' && rnd() < dt * 12) {
        this.spawn(cx + (rnd() - 0.5) * TILE * 0.4, cy, (rnd() - 0.5) * 14, -28 - rnd() * 26, 0.85, 7, 0xff8a4a);
      }
    }
    if (this.moving && rnd() < dt * 16) {
      const px = this.player.x * TILE;
      const py = this.player.y * TILE + TILE * 0.28;
      this.spawn(px + (rnd() - 0.5) * 10, py, (rnd() - 0.5) * 18, -8 - rnd() * 10, 0.5, 6, 0x8aa0b0);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const s = this.particlePool[i];
      if (!p.active) {
        if (s.visible) s.visible = false;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        s.visible = false;
        continue;
      }
      p.vy += 26 * dt; // gentle gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      s.visible = true;
      s.position.set(p.x, p.y);
      s.tint = p.tint;
      s.alpha = k * 0.9;
      s.scale.set((p.size * (0.6 + (1 - k) * 0.8)) / 128);
    }
  }

  private drawPlayer(time: number): void {
    const g = this.playerG;
    g.clear();
    const bob = this.moving ? Math.sin(time * 0.012) * 2 : Math.sin(time * 0.003) * 1;
    const x = this.player.x * TILE;
    const groundY = this.player.y * TILE;
    const r = TILE * 0.3;
    const y = groundY - r * 0.7 + bob; // body lifted off the floor for the 2.5D look
    g.ellipse(x, groundY + r * 0.4, r * 1.05, r * 0.4).fill({ color: 0x000000, alpha: 0.32 }); // ground shadow
    g.circle(x, y, r).fill({ color: 0x2bb5a4 }).stroke({ width: 3, color: 0x07100e });
    g.circle(x, y - r * 0.18, r * 0.6).fill({ color: 0x7df0e0, alpha: 0.85 }); // inner core
    const nx = x + DX[this.facing] * r * 0.6;
    const ny = y + DY[this.facing] * r * 0.6;
    g.circle(nx, ny, r * 0.22).fill({ color: 0x07100e }); // facing eye
    this.playerGlow.position.set(x, y);
    this.playerGlow.alpha = this.moving ? 0.5 : 0.34;
    this.playerGlow.scale.set((TILE * 2.0) / 128);
  }

  setSnapshot(s: Snapshot): void {
    const stored = s.storage.ore + s.storage.plate;
    if (stored > this.prevStored) this.storageFlash = performance.now();
    this.prevStored = stored;
    this.snap = s;
    this.snapTime = performance.now();
    if (s.ore.length !== this.lastOreSig) {
      this.lastOreSig = s.ore.length;
      this.drawTerrain();
    }
    this.drawModules();

    const seen = new Set<number>();
    for (const p of s.packets) {
      seen.add(p.id);
      if (!this.packetSprites.has(p.id)) {
        const sp = this.makePacket(p.item);
        this.packetLayer.addChild(sp.c);
        this.packetSprites.set(p.id, sp);
      }
    }
    for (const [id, sp] of this.packetSprites) {
      if (!seen.has(id)) {
        sp.c.destroy({ children: true });
        this.packetSprites.delete(id);
      }
    }
  }

  setExplain(on: boolean): void {
    this.explain = on;
    this.drawModules();
  }

  setMove(x: number, y: number): void {
    this.move.x = clamp(x, -1, 1);
    this.move.y = clamp(y, -1, 1);
  }

  getPlayer(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  setPlayer(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
  }

  private frame(): void {
    if (!this.snap) return;
    const now = performance.now();
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);

    const mag = Math.hypot(this.move.x, this.move.y);
    this.moving = mag > 0.05;
    if (this.moving) {
      const nx = this.move.x / Math.max(1, mag);
      const ny = this.move.y / Math.max(1, mag);
      this.player.x = clamp(this.player.x + nx * WALK_SPEED * dt, 0.5, this.snap.w - 0.5);
      this.player.y = clamp(this.player.y + ny * WALK_SPEED * dt, 0.5, this.snap.h - 0.5);
      this.facing = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 1 : 3) : ny > 0 ? 2 : 0;
    }
    this.world.x = Math.round(this.app.screen.width / 2 - this.player.x * TILE);
    this.world.y = Math.round(this.app.screen.height / 2 - this.player.y * TILE);

    const t = this.snap.paused ? 1 : Math.min(1, (now - this.snapTime) / Math.max(1, this.snap.pulseMs));
    for (const p of this.snap.packets) {
      const sp = this.packetSprites.get(p.id);
      if (!sp) continue;
      const px = lerp(this.cx(p.prevCell), this.cx(p.cell), t);
      const py = lerp(this.cy(p.prevCell), this.cy(p.cell), t);
      sp.c.position.set(px, py);
      sp.glow.alpha = 0.45 + 0.15 * Math.sin(now * 0.008 + p.id);
    }
    this.drawFx(this.snap.paused ? 0 : t);
    if (!this.snap.paused) this.emit(dt);
    this.updateParticles(this.snap.paused ? 0 : dt);
    this.drawPlayer(now);
  }

  screenToCell(px: number, py: number): number {
    if (!this.snap) return -1;
    const x = Math.floor((px - this.world.x) / TILE);
    const y = Math.floor((py - this.world.y) / TILE);
    if (x < 0 || y < 0 || x >= this.snap.w || y >= this.snap.h) return -1;
    return y * this.snap.w + x;
  }

  adjacentDir(from: number, to: number): Dir | -1 {
    if (!this.snap) return -1;
    const w = this.snap.w;
    const dx = (to % w) - (from % w);
    const dy = Math.floor(to / w) - Math.floor(from / w);
    if (dx === 1 && dy === 0) return 1;
    if (dx === -1 && dy === 0) return 3;
    if (dx === 0 && dy === 1) return 2;
    if (dx === 0 && dy === -1) return 0;
    return -1;
  }
}
