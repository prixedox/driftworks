// Render lab — the visual proving ground for the render kit.
//
// This is a standalone Three.js scene that uses ONLY the render kit modules
// (style / materials / models / scenery / effects / postfx) — no sim worker, no
// UI, no import of sim/world or sim/worker. The later agents who flesh out
// models.ts / scenery.ts / effects.ts open this page to see their work in
// isolation, lit and bloomed exactly like the game.
//
// Layout: a small ground patch, one of each of the 7 machine types in a row
// (miner + smelter sitting on ore), a short belt line with two packets riding
// it. Fixed 3/4 view with a slow auto-orbit.

import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from 'three';
import type { Dir, ModuleType, Snapshot } from './sim/types';
import { ITEM_COLOR } from './sim/types';
import { createMaterialKit } from './render/materials';
import { buildModuleModel, buildPlayerModel } from './render/models';
import { buildScenery } from './render/scenery';
import { Effects } from './render/effects';
import { PostFX } from './render/postfx';
import { LIGHT, MODULE_STYLE, PALETTE, TONE_EXPOSURE, darken } from './render/style';

// camera config mirrors renderer.ts (kept in sync by hand — same look)
const EL = (38 * Math.PI) / 180;
const VIEW_TILES = 17;
const CAM_DIST = 90;

// --- hand-made world ---------------------------------------------------------
const W = 14;
const H = 9;
const ROW = 4; // the demo row
const cell = (col: number, row: number): number => row * W + col;

// machine row: one of each of the 7 types, spaced across the row
const machineCols: { col: number; type: ModuleType; dir: Dir }[] = [
  { col: 1, type: 'miner', dir: 1 },
  { col: 2, type: 'smelter', dir: 1 },
  { col: 4, type: 'generator', dir: 0 },
  { col: 5, type: 'assembler', dir: 0 },
  { col: 6, type: 'lab', dir: 0 },
  { col: 7, type: 'storage', dir: 0 },
];
// a short belt line running east along a row below the machines
const beltRow = ROW + 2;
const beltCols = [3, 4, 5, 6, 7, 8];

// ore under the miner + smelter
const ore: number[] = [cell(1, ROW), cell(2, ROW), cell(1, ROW - 1), cell(2, ROW - 1)];

// two packets sitting on the belt (ore + science)
const packets = [
  { id: 1, item: 'ore' as const, x: beltCols[1] + 0.5, y: beltRow + 0.5, px: beltCols[1] + 0.5, py: beltRow + 0.5 },
  { id: 2, item: 'science' as const, x: beltCols[3] + 0.5, y: beltRow + 0.5, px: beltCols[3] + 0.5, py: beltRow + 0.5 },
];

// a complete Snapshot-shaped object (all required fields filled so it type-checks)
const snap: Snapshot = {
  w: W,
  h: H,
  pulse: 0,
  pulseMs: 250,
  paused: false,
  modules: [
    ...machineCols.map((m) => ({ cell: cell(m.col, ROW), type: m.type, dir: m.dir, busy: true })),
    ...beltCols.map((c) => ({ cell: cell(c, beltRow), type: 'conveyor' as ModuleType, dir: 1 as Dir })),
  ],
  packets,
  storage: { ore: 12, plate: 5, science: 2, copper_ore: 0, copper_plate: 0, circuit: 0 },
  power: { produced: 10, used: 6, deficit: false },
  ore,
  oreType: ore.map(() => 'iron' as const),
  inventory: { ore: 0, plate: 0, science: 0, copper_ore: 0, copper_plate: 0, circuit: 0 },
  unlocked: ['miner', 'conveyor', 'smelter', 'storage', 'generator', 'assembler', 'lab'],
  unlockedRecipes: ['smelt_iron', 'assemble_science'],
  research: { active: null, progress: 0, completed: [] },
  upgrades: [],
  clipboard: [],
  rates: {
    ore: { produced: 0, consumed: 0 },
    plate: { produced: 0, consumed: 0 },
    science: { produced: 0, consumed: 0 },
    copper_ore: { produced: 0, consumed: 0 },
    copper_plate: { produced: 0, consumed: 0 },
    circuit: { produced: 0, consumed: 0 },
  },
  minimap: new Uint8Array(W * H),
};

// --- scene -------------------------------------------------------------------
const app = document.getElementById('app')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = TONE_EXPOSURE;
renderer.outputColorSpace = SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(PALETTE.background);

const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
function updateFrustum(): void {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const halfH = VIEW_TILES / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.near = 0.1;
  camera.far = 400;
  camera.updateProjectionMatrix();
}
updateFrustum();

// lights from style.LIGHT (same rig as renderer)
scene.add(new AmbientLight(LIGHT.ambient, LIGHT.ambientIntensity));
scene.add(new HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity));
const key = new DirectionalLight(LIGHT.key, LIGHT.keyIntensity);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.radius = 3;
const sc = key.shadow.camera;
sc.left = -VIEW_TILES;
sc.right = VIEW_TILES;
sc.top = VIEW_TILES;
sc.bottom = -VIEW_TILES;
sc.near = 1;
sc.far = 160;
const target = new Vector3(W / 2, 0, H / 2);
key.position.set(target.x + 12, 22, target.z + 8);
key.target.position.copy(target);
scene.add(key, key.target);

// kit + scenery + models + effects + postfx
const kit = createMaterialKit();
const scenery = buildScenery(snap, kit);
scene.add(scenery.group);

const moduleGroup = new Group();
scene.add(moduleGroup);
const beltTex = kit.beltTexture();

type Anim = (dt: number, now: number, busy: boolean) => void;
const anims: { anim: Anim; busy: boolean }[] = [];
// emissive machine bodies we pulse to show off bloom (mirrors renderer's busy pulse)
const pulsing: { mat: MeshStandardMaterial; emissive: number }[] = [];

for (const m of snap.modules) {
  const built = buildModuleModel(m.type, m.dir, kit);
  built.group.position.set((m.cell % W) + 0.5, 0, Math.floor(m.cell / W) + 0.5);
  moduleGroup.add(built.group);
  if (built.anim) anims.push({ anim: built.anim, busy: !!m.busy });
  const emissive = MODULE_STYLE[m.type].emissive;
  if (built.body && m.busy && emissive) {
    pulsing.push({ mat: built.body.material as MeshStandardMaterial, emissive });
  }
}

// player model standing near the row
const player = buildPlayerModel(kit);
player.position.set(9.5, 0, ROW + 0.5);
scene.add(player);

// packet meshes on the belt
const packetGroup = new Group();
scene.add(packetGroup);
for (const p of snap.packets) {
  const c = ITEM_COLOR[p.item];
  const geo = new BoxGeometry(0.26, 0.26, 0.26);
  const mesh = new Mesh(geo, new MeshStandardMaterial({ color: c, emissive: darken(c, 0.5), emissiveIntensity: 1.0, roughness: 0.4 }));
  mesh.castShadow = true;
  mesh.position.set(p.x, 0.31, p.y);
  packetGroup.add(mesh);
}

const effects = new Effects(kit);
effects.attach(scene);

const postfx = new PostFX(renderer, scene, camera);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateFrustum();
  postfx.resize(window.innerWidth, window.innerHeight);
});

// --- animation loop ----------------------------------------------------------
let last = performance.now();
let az = Math.PI / 4;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // slow auto-orbit around the scene center
  az += dt * 0.12;
  const ce = Math.cos(EL);
  camera.position.set(target.x + Math.sin(az) * ce * CAM_DIST, Math.sin(EL) * CAM_DIST, target.z + Math.cos(az) * ce * CAM_DIST);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // scroll belt tread + run model anim hooks
  beltTex.offset.y = (beltTex.offset.y - dt * 0.9 + 1) % 1;
  for (const a of anims) a.anim(dt, now, a.busy);

  // pulse emissive machines so bloom is obvious in the proving ground
  const pulse = 0.5 + 0.6 * Math.abs(Math.sin(now * 0.004));
  for (const p of pulsing) {
    p.mat.emissive.setHex(p.emissive);
    p.mat.emissiveIntensity = pulse;
  }

  effects.update(dt, now, snap, {
    cellToWorld: (c: number) => ({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5 }),
  });

  postfx.render();
});
