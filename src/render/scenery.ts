// World scenery: textured terrain, soft build grid, clustered glowing ore-rock
// deposits, sparse deterministic scatter, and an atmospheric sky dome.
//
// Everything is built into `group`; the renderer adds it to the world and calls
// `dispose()` before rebuilding. We have NO scene access — only (snapshot, kit).
// We own and dispose ONLY the geometries / materials / textures created here.
// Kit materials (e.g. `kit.ground()`) are owned by the kit and are NOT disposed.
//
// All randomness goes through `makeRng` (deterministic LCG) so the world is
// stable across rebuilds. Ore chunks + scatter use InstancedMesh for perf.

import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import type { Snapshot } from '../sim/types';
import type { MaterialKit } from './materials';
import { PALETTE, darken, makeRng } from './style';

export interface Scenery {
  group: Group;
  dispose(): void;
}

/** A disposable we own (geometry / material / texture). */
type Owned = { dispose(): void };

/** Tile-center world position for a cell (X = column, Z = row). */
function cellWorld(cell: number, w: number): Vector3 {
  return new Vector3((cell % w) + 0.5, 0, Math.floor(cell / w) + 0.5);
}

export function buildScenery(s: Snapshot, kit: MaterialKit): Scenery {
  const group = new Group();
  const owned: Owned[] = [];
  const w = s.w;
  const h = s.h;
  const cx = w / 2;
  const cz = h / 2;
  const oreSet = new Set(s.ore);

  // reusable scratch
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  const euler = new Euler();

  // ---- 1. Ground ------------------------------------------------------------
  // Textured dirt/rock plane from the kit (kit owns the material). Geometry ours.
  const groundGeo = new PlaneGeometry(w, h);
  const groundMat = kit.ground();
  if (groundMat.map) {
    groundMat.map.wrapS = groundMat.map.wrapT = RepeatWrapping;
    groundMat.map.repeat.set(w / 4, h / 4);
    groundMat.map.needsUpdate = true;
  }
  const ground = new Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  group.add(ground);
  owned.push(groundGeo);

  // Subtle large-scale biome tint: a second plane just above the ground carrying
  // a soft low-frequency blotch texture that fades dark<->light across the map.
  // Low contrast + additive-ish alpha so it enriches the ground without shouting.
  const tintTex = makeBiomeTexture(0x2a8c4d);
  tintTex.wrapS = tintTex.wrapT = RepeatWrapping;
  tintTex.colorSpace = SRGBColorSpace;
  const tintGeo = new PlaneGeometry(w, h);
  const tintMat = new MeshBasicMaterial({
    map: tintTex,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const tint = new Mesh(tintGeo, tintMat);
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(cx, 0.008, cz);
  group.add(tint);
  owned.push(tintGeo, tintMat, tintTex);

  // ---- 2. Soft build grid ---------------------------------------------------
  // Thin, low-opacity, cool-neutral lines just above the ground — a quiet aid
  // for tile boundaries when building, not the old harsh full-bright grid.
  const pts: number[] = [];
  const gy = 0.02;
  for (let x = 0; x <= w; x++) pts.push(x, gy, 0, x, gy, h);
  for (let z = 0; z <= h; z++) pts.push(0, gy, z, w, gy, z);
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const gridMat = new LineBasicMaterial({
    color: 0x4a6275, // cool blue-grey
    transparent: true,
    opacity: 0.16,
  });
  group.add(new LineSegments(gridGeo, gridMat));
  owned.push(gridGeo, gridMat);

  // ---- 3. Ore field ---------------------------------------------------------
  // Each ore cell gets 2-4 faceted low-poly rock chunks (varied shape/scale/
  // rotation/offset, seeded by makeRng(cell)) with a warm rock body, plus a
  // small emissive amber vein/tip so deposits glow under bloom. InstancedMesh
  // per shape keeps it cheap across dozens of ore cells.
  if (s.ore.length) {
    // Rock body shapes — low segment count, faceted.
    const rockGeos: BufferGeometry[] = [
      new IcosahedronGeometry(0.5, 0),
      new DodecahedronGeometry(0.5, 0),
      new OctahedronGeometry(0.55, 0),
    ];
    const rockMat = new MeshStandardMaterial({
      color: PALETTE.oreRock,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });
    owned.push(rockMat, ...rockGeos);

    // Emissive crystal vein/tip shape.
    const veinGeo = new TetrahedronGeometry(0.18, 0);
    const veinMat = new MeshStandardMaterial({
      color: darken(PALETTE.oreCrystal, 0.5),
      emissive: PALETTE.oreCrystal,
      emissiveIntensity: 1.5,
      roughness: 0.45,
      metalness: 0,
      flatShading: true,
    });
    owned.push(veinGeo, veinMat);

    // Pre-roll per-cell chunk transforms so we can size the InstancedMeshes.
    type Inst = { shape: number; mat: Matrix4 };
    const rockInst: Inst[] = [];
    const veinMats: Matrix4[] = [];

    for (const cell of s.ore) {
      const p = cellWorld(cell, w);
      const rnd = makeRng(cell + 1);
      const chunks = 2 + Math.floor(rnd() * 3); // 2..4
      for (let i = 0; i < chunks; i++) {
        const shape = Math.floor(rnd() * rockGeos.length);
        // keep within the tile (radius ~0.3 of center) so belts/miners still fit
        const ox = (rnd() - 0.5) * 0.5;
        const oz = (rnd() - 0.5) * 0.5;
        const size = 0.26 + rnd() * 0.26; // 0.26..0.52 — modest, low profile
        const ry = rnd() * Math.PI * 2;
        const rx = (rnd() - 0.5) * 0.4;
        const rz = (rnd() - 0.5) * 0.4;
        pos.set(p.x + ox, size * 0.55, p.z + oz);
        euler.set(rx, ry, rz);
        quat.setFromEuler(euler);
        // slightly squash vertically so chunks read as ground rocks, not balls
        scl.set(size, size * 0.8, size);
        rockInst.push({ shape, mat: new Matrix4().compose(pos, quat, scl) });

        // ~70% of chunks get a glowing vein tip poking out near the top
        if (rnd() < 0.7) {
          const vx = p.x + ox + (rnd() - 0.5) * 0.2;
          const vz = p.z + oz + (rnd() - 0.5) * 0.2;
          const vs = 0.5 + rnd() * 0.7;
          pos.set(vx, size * 0.85 + 0.05, vz);
          euler.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
          quat.setFromEuler(euler);
          scl.set(vs, vs * (1.2 + rnd()), vs);
          veinMats.push(new Matrix4().compose(pos, quat, scl));
        }
      }
    }

    // One InstancedMesh per rock shape.
    const perShape: Matrix4[][] = rockGeos.map(() => []);
    for (const inst of rockInst) perShape[inst.shape].push(inst.mat);
    perShape.forEach((mats, shape) => {
      if (!mats.length) return;
      const im = new InstancedMesh(rockGeos[shape], rockMat, mats.length);
      im.castShadow = true;
      im.receiveShadow = true;
      mats.forEach((mat, i) => im.setMatrixAt(i, mat));
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    });

    if (veinMats.length) {
      const veins = new InstancedMesh(veinGeo, veinMat, veinMats.length);
      veins.castShadow = true;
      veinMats.forEach((mat, i) => veins.setMatrixAt(i, mat));
      veins.instanceMatrix.needsUpdate = true;
      group.add(veins);
    }
  }

  // ---- 4. Scatter decoration ------------------------------------------------
  // Sparse instanced pebbles + grass tufts on non-ore, in-bounds ground.
  // Deterministic (makeRng), low density (~4-5% of tiles), small, never tall.
  {
    const rnd = makeRng(0x5ce11e);
    const pebbleGeo = new IcosahedronGeometry(0.5, 0);
    const pebbleMat = new MeshStandardMaterial({
      color: darken(PALETTE.groundLight, 1.4),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const tuftGeo = new ConeGeometry(0.5, 1, 4, 1, true);
    const tuftMat = new MeshStandardMaterial({
      color: darken(PALETTE.groundLight, 1.15),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    owned.push(pebbleGeo, pebbleMat, tuftGeo, tuftMat);

    const pebbleMats: Matrix4[] = [];
    const tuftMats: Matrix4[] = [];
    const total = w * h;
    for (let cell = 0; cell < total; cell++) {
      if (oreSet.has(cell)) continue;
      // advance the rng once per tile so density is uniform & stable
      const r = rnd();
      if (r > 0.05) continue; // ~5% of tiles get something
      const p = cellWorld(cell, w);
      const ox = (rnd() - 0.5) * 0.7;
      const oz = (rnd() - 0.5) * 0.7;
      if (rnd() < 0.6) {
        // small flat pebble
        const sz = 0.07 + rnd() * 0.09;
        pos.set(p.x + ox, sz * 0.4, p.z + oz);
        euler.set(0, rnd() * Math.PI * 2, 0);
        quat.setFromEuler(euler);
        scl.set(sz, sz * 0.5, sz);
        pebbleMats.push(new Matrix4().compose(pos, quat, scl));
      } else {
        // low grass/scrub tuft
        const sz = 0.1 + rnd() * 0.1;
        pos.set(p.x + ox, sz * 0.5, p.z + oz);
        euler.set(0, rnd() * Math.PI * 2, 0);
        quat.setFromEuler(euler);
        scl.set(sz * 0.8, sz, sz * 0.8);
        tuftMats.push(new Matrix4().compose(pos, quat, scl));
      }
    }

    if (pebbleMats.length) {
      const im = new InstancedMesh(pebbleGeo, pebbleMat, pebbleMats.length);
      im.castShadow = true;
      im.receiveShadow = true;
      pebbleMats.forEach((mat, i) => im.setMatrixAt(i, mat));
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
    if (tuftMats.length) {
      const im = new InstancedMesh(tuftGeo, tuftMat, tuftMats.length);
      im.castShadow = true;
      tuftMats.forEach((mat, i) => im.setMatrixAt(i, mat));
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
  }

  // ---- 5. Atmospheric sky dome ----------------------------------------------
  // A large inverted sphere with a vertical dusk-industrial gradient so the
  // black void reads as a sky. Centered on the map, BackSide, no depth write,
  // no shadows. The ortho camera (far 400) sees it as a backdrop behind the
  // scene. Radius 140 keeps it well inside the far plane.
  {
    const skyTex = makeSkyTexture();
    skyTex.colorSpace = SRGBColorSpace;
    const skyGeo = new SphereGeometry(140, 32, 24);
    const skyMat = new MeshBasicMaterial({
      map: skyTex,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new Mesh(skyGeo, skyMat);
    sky.position.set(cx, 0, cz);
    // render the sky first so it never occludes scene geometry
    sky.renderOrder = -1;
    group.add(sky);
    owned.push(skyGeo, skyMat, skyTex);
  }

  return {
    group,
    dispose(): void {
      for (const o of owned) o.dispose();
      owned.length = 0;
    },
  };
}

// (procedural texture helpers below)

// ---- procedural textures ----------------------------------------------------

/** Soft low-frequency blotches in a single tint color over transparent — used
 *  as a faint biome color-variation overlay on the ground. */
function makeBiomeTexture(tint: number): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const col = new Color(tint);
  const r = (col.r * 255) | 0;
  const g = (col.g * 255) | 0;
  const b = (col.b * 255) | 0;
  // a handful of big soft radial blobs
  const rng = makeRng(777);
  for (let i = 0; i < 14; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = size * (0.18 + rng() * 0.28);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.18 + rng() * 0.22;
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return new CanvasTexture(c);
}

/** Vertical dusk-industrial gradient (deep blue top → warm horizon glow) for
 *  the sky dome. Tall thin canvas; the sphere UVs map V top→bottom. */
function makeSkyTexture(): CanvasTexture {
  const wpx = 16;
  const hpx = 256;
  const c = document.createElement('canvas');
  c.width = wpx;
  c.height = hpx;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, hpx);
  // top (V=0) = sphere apex = deep night-blue; bottom (V=1) = horizon warm haze
  grad.addColorStop(0.0, '#070b13');
  grad.addColorStop(0.45, '#0e1622');
  grad.addColorStop(0.72, '#1d2535');
  grad.addColorStop(0.88, '#3a3550');
  grad.addColorStop(1.0, '#5a4a52'); // warm dusk haze at the horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, wpx, hpx);
  return new CanvasTexture(c);
}
