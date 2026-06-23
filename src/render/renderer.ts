import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
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
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { DEFS, ITEM_COLOR, type Dir, type ItemType, type ModuleType, type Snapshot } from '../sim/types';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const WALK_SPEED = 6.5; // tiles / second
const MACH_H = 0.72; // machine height in world units (1 unit = 1 tile)
const EL = (38 * Math.PI) / 180; // camera elevation angle
const VIEW_TILES = 17; // vertical tiles visible (ortho zoom)
const CAM_DIST = 90; // camera distance (ortho: only affects clipping, not scale)

const darken = (c: number, f: number): number => {
  const r = Math.floor(((c >> 16) & 255) * f);
  const g = Math.floor(((c >> 8) & 255) * f);
  const b = Math.floor((c & 255) * f);
  return (r << 16) | (g << 8) | b;
};

interface ModEntry {
  group: Group;
  type: ModuleType;
  dir: Dir;
  body?: Mesh; // for busy emissive pulse
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

  private worldGroup = new Group(); // ground + grid + ore (rebuilt on ore change)
  private moduleGroup = new Group();
  private packetGroup = new Group();
  private player3d = new Group();

  private modMap = new Map<number, ModEntry>();
  private packetMap = new Map<number, Mesh>();
  private matCache = new Map<number, MeshStandardMaterial>();
  private disposables: (BufferGeometry | Material)[] = [];
  private beltTex!: CanvasTexture;
  private beltMat!: MeshStandardMaterial;

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
    parent.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0x0b1016);
    this.updateFrustum();

    this.beltTex = this.makeBeltTexture();
    this.beltMat = new MeshStandardMaterial({ map: this.beltTex, roughness: 0.7, metalness: 0.05 });

    this.scene.add(new AmbientLight(0x8a98ad, 0.75));
    this.scene.add(new HemisphereLight(0xbfe0ff, 0x16240f, 0.55));
    const dir = new DirectionalLight(0xfff1d6, 1.2);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
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

    window.addEventListener('resize', () => this.onResize());
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private onResize(): void {
    this.renderer.setSize(this.parent.clientWidth, this.parent.clientHeight);
    this.updateFrustum();
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

  private mat(color: number): MeshStandardMaterial {
    let m = this.matCache.get(color);
    if (!m) {
      m = new MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08 });
      this.matCache.set(color, m);
    }
    return m;
  }

  private cw(cell: number): Vector3 {
    const w = this.snap?.w ?? 40;
    return new Vector3((cell % w) + 0.5, 0, Math.floor(cell / w) + 0.5);
  }

  private buildPlayer(): void {
    const body = new Mesh(new CylinderGeometry(0.26, 0.3, 0.5, 16), new MeshStandardMaterial({ color: 0x2bb5a4, roughness: 0.5 }));
    body.position.y = 0.35;
    body.castShadow = true;
    const head = new Mesh(new SphereGeometry(0.22, 16, 12), new MeshStandardMaterial({ color: 0x7df0e0, emissive: 0x176b60, emissiveIntensity: 0.5 }));
    head.position.y = 0.78;
    head.castShadow = true;
    const nose = new Mesh(new ConeGeometry(0.09, 0.22, 12), new MeshStandardMaterial({ color: 0x0c1611 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.5, 0.3);
    this.player3d.add(body, head, nose);
  }

  // ---- world (ground + grid + ore) ----
  private buildWorld(s: Snapshot): void {
    for (const child of this.worldGroup.children.slice()) this.worldGroup.remove(child);
    const w = s.w;
    const h = s.h;

    const ground = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ color: 0x16241a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(w / 2, 0, h / 2);
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // grid lines over the play field
    const pts: number[] = [];
    for (let x = 0; x <= w; x++) pts.push(x, 0.02, 0, x, 0.02, h);
    for (let z = 0; z <= h; z++) pts.push(0, 0.02, z, w, 0.02, z);
    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.worldGroup.add(new LineSegments(lg, new LineBasicMaterial({ color: 0x24332a, transparent: true, opacity: 0.5 })));

    // ore deposits (instanced raised tiles) + crystals
    const ore = s.ore;
    if (ore.length) {
      const oreGeo = new BoxGeometry(0.98, 0.1, 0.98);
      const oreMat = new MeshStandardMaterial({ color: 0x9a6a2e, roughness: 0.95 });
      const tiles = new InstancedMesh(oreGeo, oreMat, ore.length);
      tiles.receiveShadow = true;
      const m = new Matrix4();
      const crystalPos: number[] = [];
      let seed = 1234;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      ore.forEach((cell, i) => {
        const p = this.cw(cell);
        m.makeTranslation(p.x, 0.05, p.z);
        tiles.setMatrixAt(i, m);
        if (rnd() < 0.4) crystalPos.push(p.x + (rnd() - 0.5) * 0.4, 0, p.z + (rnd() - 0.5) * 0.4);
      });
      tiles.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(tiles);
      this.disposables.push(oreGeo, oreMat);

      if (crystalPos.length) {
        const cGeo = new ConeGeometry(0.12, 0.12, 5);
        const cMat = new MeshStandardMaterial({ color: 0xf0b25a, emissive: 0x6b4410, emissiveIntensity: 0.4, roughness: 0.6 });
        const crystals = new InstancedMesh(cGeo, cMat, crystalPos.length / 3);
        crystals.castShadow = true;
        for (let i = 0; i < crystalPos.length / 3; i++) {
          m.makeTranslation(crystalPos[i * 3], 0.13, crystalPos[i * 3 + 2]);
          crystals.setMatrixAt(i, m);
        }
        crystals.instanceMatrix.needsUpdate = true;
        this.worldGroup.add(crystals);
        this.disposables.push(cGeo, cMat);
      }
    }
  }

  // ---- machines ----
  private orientArrow(mesh: Mesh, dir: Dir): void {
    // cone points +Y by default; lay it flat pointing along the grid direction
    if (dir === 1) mesh.rotation.z = -Math.PI / 2; // +X (east)
    else if (dir === 3) mesh.rotation.z = Math.PI / 2; // -X (west)
    else if (dir === 2) mesh.rotation.x = Math.PI / 2; // +Z (south)
    else mesh.rotation.x = -Math.PI / 2; // -Z (north)
  }

  private makeBeltTexture(): CanvasTexture {
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
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
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
    const g = new Group();
    const p = this.cw(m.cell);
    g.position.set(p.x, 0, p.z);
    let body: Mesh | undefined;

    if (m.type === 'conveyor') {
      const belt = new Mesh(new BoxGeometry(0.92, 0.16, 0.92), this.beltMat);
      belt.position.y = 0.13; // sits above the ore deposit layer so belts stay visible on ore
      belt.rotation.y = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][m.dir];
      belt.receiveShadow = true;
      g.add(belt);
    } else {
      const def = DEFS[m.type];
      body = new Mesh(new BoxGeometry(0.84, MACH_H, 0.84), this.mat(def.color));
      body.position.y = MACH_H / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      if (m.type === 'miner' || m.type === 'smelter') {
        const ar = new Mesh(new ConeGeometry(0.13, 0.32, 4), this.mat(0xffffff));
        this.orientArrow(ar, m.dir);
        ar.position.y = MACH_H + 0.04;
        g.add(ar);
      }
      const label = this.makeLabel(def.short);
      label.position.y = MACH_H + 0.55;
      label.visible = this.explain;
      label.userData.isLabel = true;
      g.add(label);
    }
    return { group: g, type: m.type, dir: m.dir, body };
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

  /** Snap the camera 90° (d = -1 left, +1 right). */
  rotateView(d: number): void {
    this.azTarget += (d < 0 ? -1 : 1) * (Math.PI / 2);
  }

  private frame(): void {
    if (!this.snap) {
      this.renderer.render(this.scene, this.camera);
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

    // busy machines pulse their emissive
    const pulse = 0.4 + 0.4 * Math.abs(Math.sin(now * 0.006));
    for (const m of this.snap.modules) {
      const e = this.modMap.get(m.cell);
      if (!e?.body) continue;
      const mat = e.body.material as MeshStandardMaterial;
      if (m.busy) {
        mat.emissive.setHex(DEFS[m.type].color);
        mat.emissiveIntensity = pulse;
      } else {
        mat.emissiveIntensity = 0;
      }
    }

    this.renderer.render(this.scene, this.camera);
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
