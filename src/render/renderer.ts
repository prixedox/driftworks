import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { DEFS, ITEM_COLOR, type Dir, type ItemType, type ModuleType, type Snapshot } from '../sim/types';
import { createMaterialKit, type MaterialKit } from './materials';
import { buildModuleModel, buildPlayerModel } from './models';
import { buildScenery, type Scenery } from './scenery';
import { Effects } from './effects';
import { PostFX } from './postfx';
import { FOG, LIGHT, PALETTE, TONE_EXPOSURE, darken } from './style';
import type { QualityOpts } from '../settings';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const WALK_SPEED = 6.5; // tiles / second
const MACH_H = 0.72; // machine height in world units (1 unit = 1 tile)
const EL = (38 * Math.PI) / 180; // camera elevation angle
const VIEW_TILES = 17; // vertical tiles visible (ortho zoom)
const CAM_DIST = 90; // camera distance (ortho: only affects clipping, not scale)

interface ModEntry {
  group: Group;
  type: ModuleType;
  dir: Dir;
  body?: Mesh; // for busy emissive pulse
  anim?: (dt: number, now: number, busy: boolean) => void; // optional per-frame model hook
}

// 3D presentation layer (Three.js). Fixed isometric orthographic camera that
// snaps in 90° steps; the deterministic sim is unchanged — this only reads
// Snapshots. World coords: X = column, Z = row, Y = up; 1 unit = 1 tile.
export class Renderer {
  private parent!: HTMLElement;
  private renderer!: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private dirLight!: DirectionalLight;
  private raycaster = new Raycaster();

  private kit!: MaterialKit;
  private postfx!: PostFX;
  private effects!: Effects;
  private scenery?: Scenery;

  private worldGroup = new Group(); // ground + grid + ore (rebuilt on ore change)
  private moduleGroup = new Group();
  private packetGroup = new Group();
  private player3d = new Group();

  private ghost = new Mesh(new BoxGeometry(0.84, MACH_H, 0.84), new MeshStandardMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.4, depthWrite: false }));
  private highlight = new Group();
  private highlightSig = '';
  private selected = new LineSegments(new EdgesGeometry(new BoxGeometry(0.92, MACH_H, 0.92)), new LineBasicMaterial({ color: PALETTE.accent }));

  private modMap = new Map<number, ModEntry>();
  private packetMap = new Map<number, Mesh>();
  private disposables: (BufferGeometry | Material)[] = [];
  private beltTex!: CanvasTexture;

  private snap: Snapshot | null = null;
  private snapTime = 0;
  private lastOreSig = -1;
  private explain = true;
  private last = 0;

  private player = { x: 20.5, y: 13.5 };
  private move = { x: 0, y: 0 };
  private az = Math.PI / 4; // current azimuth (animated)
  private azTarget = Math.PI / 4; // 90°-snap target

  async init(parent: HTMLElement): Promise<void> {
    this.parent = parent;
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_EXPOSURE;
    this.renderer.outputColorSpace = SRGBColorSpace;
    parent.appendChild(this.renderer.domElement);

    this.scene.background = new Color(PALETTE.background);
    // Subtle exponential fog for depth at the map edges. Color matches the
    // background + sky-dome horizon so the far fringe of the map dissolves into
    // the sky instead of ending on a hard line. The sky dome opts out of fog
    // (its material has fog:false) so the backdrop stays crisp. Low density keeps
    // the playable area near the player perfectly clear.
    this.scene.fog = new FogExp2(FOG.color, FOG.density);
    this.updateFrustum();

    this.kit = createMaterialKit();
    this.beltTex = this.kit.beltTexture();

    // Light rig from style.LIGHT: ambient + hemisphere fill, warm directional key.
    this.scene.add(new AmbientLight(LIGHT.ambient, LIGHT.ambientIntensity));
    this.scene.add(new HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity));
    const dir = new DirectionalLight(LIGHT.key, LIGHT.keyIntensity);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.0004;
    dir.shadow.radius = 3;
    const sc = dir.shadow.camera;
    sc.left = -VIEW_TILES;
    sc.right = VIEW_TILES;
    sc.top = VIEW_TILES;
    sc.bottom = -VIEW_TILES;
    sc.near = 1;
    sc.far = 160;
    this.dirLight = dir;
    this.scene.add(dir, dir.target);

    this.buildPlayer();
    this.scene.add(this.worldGroup, this.moduleGroup, this.packetGroup, this.player3d);

    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.scene.add(this.highlight);
    this.selected.visible = false;
    this.scene.add(this.selected);

    this.effects = new Effects(this.kit);
    this.effects.attach(this.scene);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);

    window.addEventListener('resize', () => this.onResize());
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * Apply graphics quality options live. Safe to call at any time; takes effect
   * on the next frame. Toggling shadows requires re-enabling the shadow map on
   * the WebGLRenderer AND the directional light together — doing only one
   * produces no shadows (map disabled) or wasted shadow-map renders (light on,
   * map off).
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

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private onResize(): void {
    this.renderer.setSize(this.parent.clientWidth, this.parent.clientHeight);
    this.updateFrustum();
    this.postfx.resize(this.parent.clientWidth, this.parent.clientHeight);
  }

  private updateFrustum(): void {
    const aspect = this.parent.clientWidth / Math.max(1, this.parent.clientHeight);
    const halfH = VIEW_TILES / 2;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
  }

  private cw(cell: number): Vector3 {
    const w = this.snap?.w ?? 40;
    return new Vector3((cell % w) + 0.5, 0, Math.floor(cell / w) + 0.5);
  }

  private buildPlayer(): void {
    const model = buildPlayerModel(this.kit);
    this.player3d.add(...model.children.slice());
  }

  // ---- world (ground + grid + ore) — built by the scenery seam ----
  private buildWorld(s: Snapshot): void {
    for (const child of this.worldGroup.children.slice()) this.worldGroup.remove(child);
    this.scenery?.dispose();
    this.scenery = buildScenery(s, this.kit);
    this.worldGroup.add(this.scenery.group);
  }

  private makeLabel(text: string): Sprite {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 34px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 34);
    const sp = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false }));
    sp.scale.set(1.3, 0.65, 1);
    return sp;
  }

  private buildModule(m: { cell: number; type: ModuleType; dir: Dir }): ModEntry {
    const built = buildModuleModel(m.type, m.dir, this.kit);
    const g = built.group;
    const p = this.cw(m.cell);
    g.position.set(p.x, 0, p.z);

    // The renderer still owns the label sprite (added for every non-belt machine).
    if (m.type !== 'conveyor') {
      const label = this.makeLabel(DEFS[m.type].short);
      label.position.y = MACH_H + 0.55;
      label.visible = this.explain;
      label.userData.isLabel = true;
      g.add(label);
    }
    return { group: g, type: m.type, dir: m.dir, body: built.body, anim: built.anim };
  }

  // ---- packets ----
  private buildPacket(item: ItemType): Mesh {
    const c = ITEM_COLOR[item];
    const geo = item === 'plate' ? new BoxGeometry(0.34, 0.12, 0.24) : new BoxGeometry(0.26, 0.26, 0.26);
    const mesh = new Mesh(geo, new MeshStandardMaterial({ color: c, emissive: darken(c, 0.4), emissiveIntensity: 0.6, roughness: 0.4 }));
    mesh.castShadow = true;
    this.disposables.push(geo, mesh.material as Material);
    return mesh;
  }

  setSnapshot(s: Snapshot): void {
    this.snap = s;
    this.snapTime = performance.now();

    if (s.ore.length !== this.lastOreSig) {
      this.lastOreSig = s.ore.length;
      this.buildWorld(s);
    }

    // modules: rebuild only changed cells
    const seen = new Set<number>();
    for (const m of s.modules) {
      seen.add(m.cell);
      const cur = this.modMap.get(m.cell);
      if (!cur || cur.type !== m.type || cur.dir !== m.dir) {
        if (cur) this.disposeModule(cur);
        const entry = this.buildModule(m);
        this.moduleGroup.add(entry.group);
        this.modMap.set(m.cell, entry);
      }
    }
    for (const [cell, cur] of this.modMap) {
      if (!seen.has(cell)) {
        this.disposeModule(cur);
        this.modMap.delete(cell);
      }
    }

    // packets
    const ids = new Set<number>();
    for (const p of s.packets) {
      ids.add(p.id);
      if (!this.packetMap.has(p.id)) {
        const mesh = this.buildPacket(p.item);
        this.packetGroup.add(mesh);
        this.packetMap.set(p.id, mesh);
      }
    }
    for (const [id, mesh] of this.packetMap) {
      if (!ids.has(id)) {
        this.packetGroup.remove(mesh);
        this.packetMap.delete(id);
      }
    }
  }

  private disposeModule(e: ModEntry): void {
    this.moduleGroup.remove(e.group);
    e.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
      }
      if (o instanceof Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  setExplain(on: boolean): void {
    this.explain = on;
    for (const e of this.modMap.values()) {
      e.group.traverse((o) => {
        if (o.userData.isLabel) o.visible = on;
      });
    }
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

  setGhost(g: { cell: number; type: ModuleType; dir: Dir; valid: boolean } | null): void {
    if (!g) {
      this.ghost.visible = false;
      return;
    }
    const p = this.cw(g.cell);
    this.ghost.position.set(p.x, MACH_H / 2 + 0.18, p.z);
    (this.ghost.material as MeshStandardMaterial).color.setHex(g.valid ? 0x5ad1c0 : 0xff6b6b);
    this.ghost.visible = true;
  }

  setHighlight(cells: number[]): void {
    const sig = cells.join(',');
    if (sig === this.highlightSig) return;
    this.highlightSig = sig;
    for (const c of this.highlight.children.slice()) {
      this.highlight.remove(c);
      if (c instanceof InstancedMesh) {
        c.geometry.dispose();
        (c.material as MeshStandardMaterial).dispose();
      }
    }
    if (!cells.length) return;
    const geo = new BoxGeometry(0.9, 0.05, 0.9);
    const mat = new MeshStandardMaterial({ color: 0x5ad1c0, transparent: true, opacity: 0.16, depthWrite: false });
    const im = new InstancedMesh(geo, mat, cells.length);
    const m = new Matrix4();
    cells.forEach((cell, i) => {
      const p = this.cw(cell);
      m.makeTranslation(p.x, 0.17, p.z);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    this.highlight.add(im);
  }

  setSelected(cell: number | null): void {
    if (cell == null) {
      this.selected.visible = false;
      return;
    }
    const p = this.cw(cell);
    this.selected.position.set(p.x, MACH_H / 2, p.z);
    this.selected.visible = true;
  }

  /** Snap the camera 90° (d = -1 left, +1 right). */
  rotateView(d: number): void {
    this.azTarget += (d < 0 ? -1 : 1) * (Math.PI / 2);
  }

  private frame(): void {
    if (!this.snap) {
      this.postfx.render();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    // smooth 90° camera snap
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 9);
    const tx = this.player.x;
    const tz = this.player.y;
    const ce = Math.cos(EL);
    this.camera.position.set(tx + Math.sin(this.az) * ce * CAM_DIST, Math.sin(EL) * CAM_DIST, tz + Math.cos(this.az) * ce * CAM_DIST);
    this.camera.lookAt(tx, 0, tz);
    this.camera.updateMatrixWorld();

    // view-relative walking
    const fwd = new Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    const mag = Math.hypot(this.move.x, this.move.y);
    if (mag > 0.05) {
      const wx = right.x * this.move.x + fwd.x * -this.move.y;
      const wz = right.z * this.move.x + fwd.z * -this.move.y;
      const len = Math.hypot(wx, wz) || 1;
      this.player.x = clamp(this.player.x + (wx / len) * WALK_SPEED * dt, 0.5, this.snap.w - 0.5);
      this.player.y = clamp(this.player.y + (wz / len) * WALK_SPEED * dt, 0.5, this.snap.h - 0.5);
      this.player3d.rotation.y = Math.atan2(wx, wz);
    }
    const bob = mag > 0.05 ? Math.abs(Math.sin(now * 0.012)) * 0.08 : 0;
    this.player3d.position.set(this.player.x, bob, this.player.y);

    // light tracks the player so shadows stay in view
    this.dirLight.position.set(tx + 12, 22, tz + 8);
    this.dirLight.target.position.set(tx, 0, tz);
    this.dirLight.target.updateMatrixWorld();

    // packet interpolation along belts
    const t = this.snap.paused ? 1 : clamp((now - this.snapTime) / Math.max(1, this.snap.pulseMs), 0, 1);
    for (const p of this.snap.packets) {
      const mesh = this.packetMap.get(p.id);
      if (!mesh) continue;
      mesh.position.set(p.px + (p.x - p.px) * t, 0.31, p.py + (p.y - p.py) * t);
    }
    if (!this.snap.paused) this.beltTex.offset.y = (this.beltTex.offset.y - dt * 0.9 + 1) % 1;

    // busy machines pulse their emissive + run any model anim hook
    const pulse = 0.4 + 0.4 * Math.abs(Math.sin(now * 0.006));
    for (const m of this.snap.modules) {
      const e = this.modMap.get(m.cell);
      if (!e) continue;
      e.anim?.(dt, now, !!m.busy);
      if (!e.body) continue;
      const mat = e.body.material as MeshStandardMaterial;
      if (m.busy) {
        mat.emissive.setHex(DEFS[m.type].color);
        mat.emissiveIntensity = pulse;
      } else {
        mat.emissiveIntensity = 0;
      }
    }

    // transient effects layer (no-op stub for now)
    const w = this.snap.w;
    this.effects.update(dt, now, this.snap, {
      cellToWorld: (cell: number) => ({ x: (cell % w) + 0.5, z: Math.floor(cell / w) + 0.5 }),
    });

    this.postfx.render();
  }

  /** Pointer (canvas CSS px) -> grid cell via raycast onto the ground plane. */
  screenToCell(px: number, py: number): number {
    if (!this.snap) return -1;
    const el = this.renderer.domElement;
    const ndc = new Vector2((px / el.clientWidth) * 2 - 1, -(py / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-6) return -1;
    const tt = -o.y / d.y;
    if (tt < 0) return -1;
    const col = Math.floor(o.x + d.x * tt);
    const row = Math.floor(o.z + d.z * tt);
    if (col < 0 || row < 0 || col >= this.snap.w || row >= this.snap.h) return -1;
    return row * this.snap.w + col;
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
