import { Application, Container, Graphics, Text } from 'pixi.js';
import { DEFS, DX, DY, EXPLAIN, ITEM_COLOR, type Dir, type ItemType, type Snapshot } from '../sim/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;
const TILE = 46; // world pixels per tile
const WALK_SPEED = 6.5; // tiles per second

// Presentation layer with a follow-camera over a large explorable world. You
// walk a character around tiled terrain; the camera keeps you centred and the
// world scrolls. Everything game-related lives inside `world` (a Container we
// reposition each frame); HUD/screen-space stays on the stage.
export class Renderer {
  readonly app = new Application();
  private parent!: HTMLElement;

  private world = new Container(); // everything in world space (moved by the camera)
  private terrain = new Graphics(); // ground + ore + grid (drawn once)
  private fx = new Graphics(); // animated belt flow / glows (per frame)
  private moduleLayer = new Container(); // bodies + labels (per snapshot)
  private packetLayer = new Container();
  private playerG = new Graphics();
  private packetSprites = new Map<number, Graphics>();

  private snap: Snapshot | null = null;
  private snapTime = 0;
  private terrainDrawn = false;
  private explain = true;
  private storageFlash = -1e9;
  private prevStored = 0;

  // Player + camera.
  private player = { x: 20.5, y: 13.5 };
  private move = { x: 0, y: 0 };
  private facing: Dir = 2;

  async init(parent: HTMLElement): Promise<void> {
    this.parent = parent;
    await this.app.init({
      background: 0x0c1014,
      width: parent.clientWidth,
      height: parent.clientHeight,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    parent.appendChild(this.app.canvas);
    this.world.addChild(this.terrain, this.fx, this.moduleLayer, this.packetLayer, this.playerG);
    this.app.stage.addChild(this.world);
    this.app.ticker.add(() => this.frame());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    this.app.renderer.resize(this.parent.clientWidth, this.parent.clientHeight);
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
    // ground
    g.rect(0, 0, w * TILE, h * TILE).fill(0x16201a);
    // faint tile grid
    for (let x = 0; x <= w; x++) g.moveTo(x * TILE, 0).lineTo(x * TILE, h * TILE);
    for (let y = 0; y <= h; y++) g.moveTo(0, y * TILE).lineTo(w * TILE, y * TILE);
    g.stroke({ width: 1, color: 0x1f2c24 });
    // ore deposits
    for (const cell of this.snap.ore) {
      const x = (cell % w) * TILE;
      const y = Math.floor(cell / w) * TILE;
      g.roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 5).fill({ color: 0x6e4a24 });
      g.circle(x + TILE * 0.32, y + TILE * 0.4, 3).circle(x + TILE * 0.64, y + TILE * 0.6, 3.5).fill({ color: 0xe8a35a });
    }
    // world border
    g.rect(0, 0, w * TILE, h * TILE).stroke({ width: 4, color: 0x2b3645 });
  }

  private arrow(g: Graphics, cell: number, dir: Dir): void {
    const cx = this.cx(cell);
    const cy = this.cy(cell);
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
    const s = TILE;
    for (const m of this.snap.modules) {
      const def = DEFS[m.type];
      const cx = this.cx(m.cell);
      const cy = this.cy(m.cell);
      const g = new Graphics();
      g.roundRect(cx - s / 2 + 3, cy - s / 2 + 3, s - 6, s - 6, 8)
        .fill({ color: def.color })
        .stroke({ width: 2, color: 0x000000, alpha: 0.25 });
      if (m.type === 'miner' || m.type === 'smelter') this.arrow(g, m.cell, m.dir);
      this.moduleLayer.addChild(g);
      this.moduleLayer.addChild(this.label(def.short, cx, cy - s * 0.16, Math.max(8, Math.floor(s * 0.17)), 0xffffff));
      if (this.explain && m.type !== 'conveyor') {
        this.moduleLayer.addChild(this.label(EXPLAIN[m.type], cx, cy + s * 0.62, Math.max(8, Math.floor(s * 0.15)), 0x9fb3c8));
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

  private glow(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
    if (alpha <= 0) return;
    g.circle(x, y, r).fill({ color, alpha });
  }

  private drawFx(t: number): void {
    const g = this.fx;
    g.clear();
    if (!this.snap) return;
    const s = TILE;
    const beat = (1 - t) * (1 - t);
    for (const m of this.snap.modules) {
      const cx = this.cx(m.cell);
      const cy = this.cy(m.cell);
      switch (m.type) {
        case 'conveyor':
          for (let k = 0; k < 3; k++) {
            const u = ((k / 3 + t) % 1) - 0.5;
            this.chevron(g, cx + DX[m.dir] * u * s, cy + DY[m.dir] * u * s, m.dir, s * 0.13, 0x5ad1c0, 0.55);
          }
          break;
        case 'miner':
          if (m.busy) this.glow(g, cx, cy, s * 0.5, 0xffcf6b, 0.34 * beat);
          break;
        case 'smelter': {
          const r = s * 0.34;
          g.circle(cx, cy, r).stroke({ width: 2, color: 0xffd24a, alpha: 0.45 });
          const p = m.progress ?? 0;
          if (p > 0) {
            g.moveTo(cx, cy);
            g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p));
            g.lineTo(cx, cy);
            g.fill({ color: 0xffd24a, alpha: 0.4 });
          }
          if (m.busy) this.glow(g, cx, cy, s * 0.5, 0xff7a4a, 0.14 + 0.28 * beat);
          break;
        }
        case 'generator':
          this.glow(g, cx, cy, s * 0.46, 0xffe27a, 0.1 + 0.12 * beat);
          break;
        case 'storage': {
          const since = (performance.now() - this.storageFlash) / 360;
          if (since >= 0 && since < 1) this.glow(g, cx, cy, s * 0.52, 0x6effb0, 0.4 * (1 - since));
          break;
        }
      }
    }
  }

  private drawPacket(g: Graphics, item: ItemType): void {
    const r = TILE * 0.17;
    g.clear();
    g.circle(0, 0, r * 1.9).fill({ color: ITEM_COLOR[item], alpha: 0.18 });
    if (item === 'ore') {
      g.circle(0, 0, r).fill({ color: ITEM_COLOR[item] }).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
    } else {
      g.roundRect(-r * 1.15, -r * 0.72, r * 2.3, r * 1.44, 3)
        .fill({ color: ITEM_COLOR[item] })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
    }
  }

  private drawPlayer(): void {
    const g = this.playerG;
    g.clear();
    const x = this.player.x * TILE;
    const y = this.player.y * TILE;
    const r = TILE * 0.32;
    g.circle(x, y + 2, r * 1.05).fill({ color: 0x000000, alpha: 0.25 }); // shadow
    g.circle(x, y, r).fill({ color: 0x5ad1c0 }).stroke({ width: 2.5, color: 0x0c1014 });
    // facing nub
    const nx = x + DX[this.facing] * r * 0.7;
    const ny = y + DY[this.facing] * r * 0.7;
    g.circle(nx, ny, r * 0.28).fill({ color: 0x0c1014 });
  }

  setSnapshot(s: Snapshot): void {
    const stored = s.storage.ore + s.storage.plate;
    if (stored > this.prevStored) this.storageFlash = performance.now();
    this.prevStored = stored;
    this.snap = s;
    this.snapTime = performance.now();
    if (!this.terrainDrawn) {
      this.drawTerrain();
      this.terrainDrawn = true;
    }
    this.drawModules();

    const seen = new Set<number>();
    for (const p of s.packets) {
      seen.add(p.id);
      if (!this.packetSprites.has(p.id)) {
        const g = new Graphics();
        this.drawPacket(g, p.item);
        this.packetLayer.addChild(g);
        this.packetSprites.set(p.id, g);
      }
    }
    for (const [id, g] of this.packetSprites) {
      if (!seen.has(id)) {
        g.destroy();
        this.packetSprites.delete(id);
      }
    }
  }

  setExplain(on: boolean): void {
    this.explain = on;
    this.drawModules();
  }

  /** Input vector for the player, components in -1..1. */
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

  redrawTerrain(): void {
    this.terrainDrawn = false;
  }

  private frame(): void {
    if (!this.snap) return;
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);

    // Walk the player and follow with the camera.
    const mag = Math.hypot(this.move.x, this.move.y);
    if (mag > 0.01) {
      const nx = this.move.x / Math.max(1, mag);
      const ny = this.move.y / Math.max(1, mag);
      this.player.x = clamp(this.player.x + nx * WALK_SPEED * dt, 0.5, this.snap.w - 0.5);
      this.player.y = clamp(this.player.y + ny * WALK_SPEED * dt, 0.5, this.snap.h - 0.5);
      this.facing = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 1 : 3) : ny > 0 ? 2 : 0;
    }
    this.world.x = Math.round(this.app.screen.width / 2 - this.player.x * TILE);
    this.world.y = Math.round(this.app.screen.height / 2 - this.player.y * TILE);

    const t = this.snap.paused ? 1 : Math.min(1, (performance.now() - this.snapTime) / Math.max(1, this.snap.pulseMs));
    for (const p of this.snap.packets) {
      const g = this.packetSprites.get(p.id);
      if (!g) continue;
      g.position.set(lerp(this.cx(p.prevCell), this.cx(p.cell), t), lerp(this.cy(p.prevCell), this.cy(p.cell), t));
    }
    this.drawFx(this.snap.paused ? 0 : t);
    this.drawPlayer();
  }

  /** Map a pointer position (CSS px relative to the canvas) to a grid cell, or -1. */
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
