// Module + player models.
//
// Detailed, recognizable Factorio-style machines composed from primitives, all
// materials sourced from the MaterialKit (materials.ts) + MODULE_STYLE/PALETTE
// (style.ts) so the look stays tunable in one place. The seam the renderer fills:
//
//   - `group`  → positioned at the tile; the renderer owns the label sprite +
//                selection outline (do NOT add them here).
//   - `body`   → the main shell Mesh (single MeshStandardMaterial). The renderer
//                drives the busy emissive pulse on it (machines of a type share a
//                cached material, so they pulse together — the global-Pulse look).
//                Belts have no body.
//   - `anim(dt,now,busy)` → per-frame hook; spin drills / fans / tool heads via
//                child meshes captured in a closure.
//
// Footprint stays <= ~0.9 tile; height ~MACH_H so labels (at MACH_H+0.55) clear.

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { DEFS, type Dir, type ModuleType } from '../sim/types';
import type { MaterialKit } from './materials';
import { MODULE_STYLE, PALETTE, darken } from './style';

/** Machine height in world units (1 unit = 1 tile). Matches renderer. */
const MACH_H = 0.72;

export interface BuiltModule {
  group: Group;
  /** The shell mesh the renderer pulses for "busy"; undefined for belts. */
  body?: Mesh;
  /** Optional per-frame animation hook (dt seconds, now ms, busy flag). */
  anim?: (dt: number, now: number, busy: boolean) => void;
}

/** Yaw (about +Y) that turns a +Z-facing feature toward grid `dir`.
 *  0=N/-Z, 1=E/+X, 2=S/+Z, 3=W/-X. */
function dirYaw(dir: Dir): number {
  // +Z is "south" (dir 2). Rotate from there.
  return [Math.PI, -Math.PI / 2, 0, Math.PI / 2][dir];
}

/** Mark a solid mesh as a shadow caster (+ optional receiver). */
function solid(m: Mesh, receive = true): Mesh {
  m.castShadow = true;
  m.receiveShadow = receive;
  return m;
}

// ---------------------------------------------------------------------------
// Per-machine builders. Each returns the shell `body` (a single painted Mesh)
// and, where useful, an `anim` closure that spins captured child meshes.
// ---------------------------------------------------------------------------

function buildMiner(dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.miner;

  // four stubby legs lifting the rig
  const legGeo = new BoxGeometry(0.12, 0.18, 0.12);
  const legMat = kit.metal(PALETTE.metalDark);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const leg = solid(new Mesh(legGeo, legMat));
    leg.position.set(sx * 0.32, 0.09, sz * 0.32);
    group.add(leg);
  }

  // chamfered housing — the shell the renderer pulses (octagonal cylinder reads
  // as a bevelled box but cheaper to recognize than a cube)
  const body = solid(new Mesh(new CylinderGeometry(0.46, 0.5, MACH_H - 0.18, 8), kit.painted(style.color)));
  body.position.y = 0.18 + (MACH_H - 0.18) / 2;
  body.rotation.y = Math.PI / 8; // flat face forward
  group.add(body);

  // hazard band around the housing
  const band = solid(new Mesh(new CylinderGeometry(0.47, 0.47, 0.14, 8, 1, true), kit.warningStripe()));
  band.position.y = 0.32;
  band.rotation.y = Math.PI / 8;
  group.add(band);

  // narrow gearbox collar the drill rises out of (sits low so the bit shows)
  const cap = solid(new Mesh(new CylinderGeometry(0.16, 0.22, 0.12, 12), kit.metal(PALETTE.metalLight)));
  cap.position.y = MACH_H - 0.06;
  group.add(cap);

  // angled output chute toward `dir`
  const chute = solid(new Mesh(new BoxGeometry(0.34, 0.16, 0.3), kit.metal(PALETTE.metalMid)));
  const chuteGrp = new Group();
  chute.position.set(0, -0.02, 0.42);
  chute.rotation.x = 0.5;
  chuteGrp.add(chute);
  chuteGrp.rotation.y = dirYaw(dir);
  chuteGrp.position.y = 0.3;
  group.add(chuteGrp);

  // vertical drill bit (shaft + cone tip) rising above the housing — spins about
  // Y when busy. Pivot sits at the collar; the bit protrudes clearly on top.
  const drill = new Group();
  const shaft = solid(new Mesh(new CylinderGeometry(0.075, 0.075, 0.34, 8), kit.metal(PALETTE.metalLight, { roughness: 0.35 })));
  shaft.position.y = 0.17;
  const tip = solid(new Mesh(new ConeGeometry(0.13, 0.3, 8), kit.metal(0xcfd6dd, { roughness: 0.25 })));
  tip.position.y = 0.49;
  const accentRing = solid(new Mesh(new TorusGeometry(0.11, 0.035, 8, 14), kit.emissiveAccent(style.accent)));
  accentRing.rotation.x = Math.PI / 2;
  accentRing.position.y = 0.05;
  drill.add(shaft, tip, accentRing);
  drill.position.y = MACH_H - 0.02;
  group.add(drill);

  let spin = 0;
  const anim = (dt: number, _now: number, busy: boolean): void => {
    spin += dt * (busy ? 9 : 1.5);
    drill.rotation.y = spin;
  };

  void DEFS.miner;
  return { group, body, anim };
}

function buildSmelter(dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.smelter;

  // tapered furnace body (wider at base) — the pulsing shell
  const body = solid(new Mesh(new CylinderGeometry(0.34, 0.46, MACH_H - 0.02, 6), kit.painted(style.color)));
  body.position.y = (MACH_H - 0.02) / 2;
  body.rotation.y = Math.PI / 6; // present a flat face forward
  group.add(body);

  // riveted metal trim rings (ribbed look)
  const ringMat = kit.metal(PALETTE.metalMid);
  for (const y of [0.16, 0.42]) {
    const ring = solid(new Mesh(new CylinderGeometry(0.42 - (y - 0.16) * 0.4, 0.42 - (y - 0.16) * 0.4, 0.06, 6), ringMat));
    ring.position.y = y;
    ring.rotation.y = Math.PI / 6;
    group.add(ring);
  }

  // glowing front door facing `dir` — blooms; renderer's busy pulse adds more
  const doorGrp = new Group();
  const door = solid(new Mesh(new BoxGeometry(0.34, 0.32, 0.06), kit.emissiveAccent(style.emissive)));
  door.position.set(0, 0.26, 0.4);
  const doorFrame = solid(new Mesh(new BoxGeometry(0.42, 0.4, 0.05), kit.metal(PALETTE.metalDark)));
  doorFrame.position.set(0, 0.26, 0.37);
  doorGrp.add(doorFrame, door);
  doorGrp.rotation.y = dirYaw(dir);
  group.add(doorGrp);

  // chimney stack on top, with a hot-emissive rim
  const stack = solid(new Mesh(new CylinderGeometry(0.12, 0.16, 0.3, 10), kit.metal(PALETTE.metalLight)));
  stack.position.set(0.12, MACH_H + 0.1, -0.04);
  group.add(stack);
  const stackGlow = solid(new Mesh(new CylinderGeometry(0.1, 0.1, 0.05, 10), kit.emissiveAccent(style.emissive)));
  stackGlow.position.set(0.12, MACH_H + 0.26, -0.04);
  group.add(stackGlow);

  void DEFS.smelter;
  return { group, body };
}

function buildStorage(_dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.storage;

  // reinforced crate — the pulsing shell
  const body = solid(new Mesh(new BoxGeometry(0.78, MACH_H - 0.06, 0.78), kit.painted(style.color)));
  body.position.y = (MACH_H - 0.06) / 2;
  group.add(body);

  // corner posts (bolts/reinforcement)
  const postGeo = new BoxGeometry(0.1, MACH_H - 0.02, 0.1);
  const postMat = kit.metal(PALETTE.metalMid);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const post = solid(new Mesh(postGeo, postMat));
    post.position.set(sx * 0.39, (MACH_H - 0.02) / 2, sz * 0.39);
    group.add(post);
  }

  // top + bottom panel seams (thin bands)
  const seamMat = kit.metal(PALETTE.metalDark);
  for (const y of [0.12, MACH_H - 0.12]) {
    const seam = solid(new Mesh(new BoxGeometry(0.8, 0.05, 0.8), seamMat));
    seam.position.y = y;
    group.add(seam);
  }

  // teal content-light strip on the front (glows)
  const strip = solid(new Mesh(new BoxGeometry(0.5, 0.08, 0.04), kit.emissiveAccent(PALETTE.accent)));
  strip.position.set(0, MACH_H * 0.62, 0.4);
  group.add(strip);

  void DEFS.storage;
  return { group, body };
}

function buildGenerator(dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.generator;

  // engine block — the pulsing shell
  const body = solid(new Mesh(new BoxGeometry(0.74, MACH_H - 0.16, 0.6), kit.painted(style.color)));
  body.position.set(0, (MACH_H - 0.16) / 2 + 0.04, -0.06);
  group.add(body);

  // cooling fins along the top
  const finMat = kit.metal(PALETTE.metalMid);
  for (let i = 0; i < 5; i++) {
    const fin = solid(new Mesh(new BoxGeometry(0.66, 0.12, 0.04), finMat));
    fin.position.set(0, MACH_H - 0.12, -0.24 + i * 0.09);
    group.add(fin);
  }

  // glowing electric-blue vents on the side
  for (const sx of [-1, 1]) {
    const vent = solid(new Mesh(new BoxGeometry(0.04, 0.22, 0.34), kit.emissiveAccent(0x6bd0ff)));
    vent.position.set(sx * 0.38, 0.3, -0.06);
    group.add(vent);
  }

  // exhaust pipe out the back
  const exhaust = solid(new Mesh(new CylinderGeometry(0.08, 0.08, 0.34, 10), kit.metal(PALETTE.metalDark)));
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.22, MACH_H - 0.06, -0.46);
  group.add(exhaust);

  // fan/flywheel on the front face (toward +Z by default) — spins continuously
  const fanGrp = new Group();
  const hub = solid(new Mesh(new CylinderGeometry(0.08, 0.08, 0.1, 10), kit.metal(PALETTE.metalLight, { roughness: 0.3 })));
  hub.rotation.x = Math.PI / 2;
  fanGrp.add(hub);
  const bladeMat = kit.metal(PALETTE.metalLight, { roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const blade = solid(new Mesh(new BoxGeometry(0.05, 0.34, 0.02), bladeMat));
    blade.rotation.z = (i * Math.PI) / 2;
    fanGrp.add(blade);
  }
  const housing = solid(new Mesh(new TorusGeometry(0.2, 0.05, 8, 16), kit.metal(PALETTE.metalDark)));
  fanGrp.add(housing);
  // orient the fan onto the face toward `dir`, just outside the block
  const faceGrp = new Group();
  fanGrp.position.set(0, 0.32, 0.34);
  faceGrp.add(fanGrp);
  faceGrp.rotation.y = dirYaw(dir);
  group.add(faceGrp);

  let spin = 0;
  const anim = (dt: number, _now: number, busy: boolean): void => {
    spin += dt * (busy ? 7 : 2.5);
    fanGrp.rotation.z = spin;
  };

  void DEFS.generator;
  return { group, body, anim };
}

function buildAssembler(dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.assembler;

  // boxy fabrication frame — the pulsing shell
  const body = solid(new Mesh(new BoxGeometry(0.78, MACH_H - 0.2, 0.78), kit.painted(style.color)));
  body.position.y = (MACH_H - 0.2) / 2;
  group.add(body);

  // metal upper deck / gantry
  const deck = solid(new Mesh(new BoxGeometry(0.7, 0.1, 0.7), kit.metal(PALETTE.metalMid)));
  deck.position.y = MACH_H - 0.18;
  group.add(deck);

  // glowing purple indicator strip on the front, oriented by dir
  const indGrp = new Group();
  const ind = solid(new Mesh(new BoxGeometry(0.46, 0.1, 0.04), kit.emissiveAccent(style.emissive)));
  ind.position.set(0, 0.28, 0.4);
  indGrp.add(ind);
  indGrp.rotation.y = dirYaw(dir);
  group.add(indGrp);

  // rotating tool head on a post, centered on the deck
  const head = new Group();
  const post = solid(new Mesh(new CylinderGeometry(0.05, 0.05, 0.2, 8), kit.metal(PALETTE.metalLight)));
  post.position.y = 0.1;
  const armA = solid(new Mesh(new BoxGeometry(0.34, 0.05, 0.06), kit.metal(PALETTE.metalLight, { roughness: 0.4 })));
  armA.position.y = 0.2;
  const armB = solid(new Mesh(new BoxGeometry(0.06, 0.05, 0.34), kit.metal(PALETTE.metalLight, { roughness: 0.4 })));
  armB.position.y = 0.2;
  const toolTip = solid(new Mesh(new SphereGeometry(0.06, 10, 8), kit.emissiveAccent(style.emissive)));
  toolTip.position.set(0.17, 0.2, 0);
  head.add(post, armA, armB, toolTip);
  head.position.y = MACH_H - 0.13;
  group.add(head);

  let spin = 0;
  const anim = (dt: number, _now: number, busy: boolean): void => {
    spin += dt * (busy ? 4.5 : 0.8);
    head.rotation.y = spin;
  };

  void DEFS.assembler;
  return { group, body, anim };
}

function buildLab(_dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();
  const style = MODULE_STYLE.lab;

  // base station — the pulsing shell
  const body = solid(new Mesh(new BoxGeometry(0.74, MACH_H - 0.3, 0.74), kit.painted(style.color)));
  body.position.y = (MACH_H - 0.3) / 2;
  group.add(body);

  // domed top (rounded research cap)
  const dome = solid(new Mesh(new SphereGeometry(0.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), kit.metal(PALETTE.metalMid)));
  dome.position.y = MACH_H - 0.3;
  group.add(dome);

  // metal collar between body and dome
  const collar = solid(new Mesh(new CylinderGeometry(0.36, 0.38, 0.06, 18), kit.metal(PALETTE.metalDark)));
  collar.position.y = MACH_H - 0.3;
  group.add(collar);

  // glowing blue screen on the front
  const screen = solid(new Mesh(new BoxGeometry(0.4, 0.18, 0.04), kit.emissiveAccent(style.emissive)));
  screen.position.set(0, 0.18, 0.38);
  group.add(screen);

  // bobbing glowing core that floats above the dome
  const core = solid(new Mesh(new SphereGeometry(0.12, 14, 10), kit.emissiveAccent(0x9fd4ff)));
  core.position.y = MACH_H + 0.04;
  group.add(core);
  // a thin orbit ring
  const ring = solid(new Mesh(new TorusGeometry(0.16, 0.02, 8, 18), kit.emissiveAccent(style.emissive)));
  ring.rotation.x = Math.PI / 2.4;
  core.add(ring);

  const baseY = MACH_H + 0.04;
  const anim = (_dt: number, now: number, busy: boolean): void => {
    core.position.y = baseY + Math.sin(now * 0.003) * 0.05;
    ring.rotation.z += (busy ? 0.05 : 0.012);
  };

  void DEFS.lab;
  return { group, body, anim };
}

function buildConveyor(dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();

  // scrolling tread surface — chevrons run along travel (texture scrolls -V).
  // Top at y~0.16 so packets at y=0.31 ride on it.
  const belt = solid(new Mesh(new BoxGeometry(0.78, 0.1, 0.92), kit.belt()), true);
  belt.position.y = 0.13;
  group.add(belt);

  // side frame rails (thin metal)
  const railMat = kit.metal(PALETTE.metalMid);
  for (const sx of [-1, 1]) {
    const rail = solid(new Mesh(new BoxGeometry(0.07, 0.12, 0.96), railMat));
    rail.position.set(sx * 0.43, 0.11, 0);
    group.add(rail);
  }

  // end rollers (cylinders across the belt)
  const rollerMat = kit.metal(PALETTE.metalLight, { roughness: 0.35 });
  for (const sz of [-1, 1]) {
    const roller = solid(new Mesh(new CylinderGeometry(0.08, 0.08, 0.88, 12), rollerMat));
    roller.rotation.z = Math.PI / 2; // axis across X
    roller.position.set(0, 0.13, sz * 0.42);
    group.add(roller);
  }

  // orient the whole belt so chevrons + frame run along travel `dir`
  group.rotation.y = dirYaw(dir);

  return { group, body: undefined };
}

export function buildModuleModel(type: ModuleType, dir: Dir, kit: MaterialKit): BuiltModule {
  switch (type) {
    case 'miner':
      return buildMiner(dir, kit);
    case 'smelter':
      return buildSmelter(dir, kit);
    case 'storage':
      return buildStorage(dir, kit);
    case 'generator':
      return buildGenerator(dir, kit);
    case 'assembler':
      return buildAssembler(dir, kit);
    case 'lab':
      return buildLab(dir, kit);
    case 'conveyor':
      return buildConveyor(dir, kit);
  }
}

export function buildPlayerModel(kit: MaterialKit): Group {
  const g = new Group();

  // rounded torso (capsule-ish: cylinder + sphere cap)
  const torso = solid(new Mesh(new CylinderGeometry(0.24, 0.3, 0.42, 16), kit.painted(0x2bb5a4)));
  torso.position.y = 0.34;
  g.add(torso);
  const shoulder = solid(new Mesh(new SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.painted(0x2bb5a4)));
  shoulder.position.y = 0.55;
  g.add(shoulder);

  // backpack
  const pack = solid(new Mesh(new BoxGeometry(0.34, 0.3, 0.16), kit.metal(PALETTE.metalMid)));
  pack.position.set(0, 0.4, -0.26);
  g.add(pack);

  // head with a glowing visor band (blooms)
  const head = solid(new Mesh(new SphereGeometry(0.2, 18, 14), kit.painted(darken(0x2bb5a4, 0.7))));
  head.position.y = 0.74;
  g.add(head);
  const visor = solid(new Mesh(new BoxGeometry(0.3, 0.1, 0.18), kit.emissiveAccent(0x7df0e0)));
  visor.position.set(0, 0.76, 0.12);
  g.add(visor);

  // antenna with a glowing tip
  const antenna = solid(new Mesh(new CylinderGeometry(0.012, 0.012, 0.2, 6), kit.metal(PALETTE.metalLight)));
  antenna.position.set(-0.12, 0.95, -0.06);
  g.add(antenna);
  const antTip = solid(new Mesh(new SphereGeometry(0.035, 8, 6), kit.emissiveAccent(0x7df0e0)));
  antTip.position.set(-0.12, 1.06, -0.06);
  g.add(antTip);

  // clear forward nose/indicator at +Z so facing is obvious
  const nose = solid(new Mesh(new ConeGeometry(0.08, 0.22, 12), kit.emissiveAccent(0x7df0e0)));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.5, 0.32);
  g.add(nose);

  // little feet
  const footMat = kit.metal(PALETTE.metalDark);
  for (const sx of [-1, 1]) {
    const foot = solid(new Mesh(new BoxGeometry(0.16, 0.1, 0.22), footMat));
    foot.position.set(sx * 0.13, 0.05, 0.02);
    g.add(foot);
  }

  return g;
}
