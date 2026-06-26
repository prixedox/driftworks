// World scenery: ground plane, grid lines, ore deposits + crystals.
//
// STUB STAGE: this is the current `buildWorld` body moved out of the renderer
// almost verbatim — ground now comes from `kit.ground()`, the deterministic
// crystal scatter uses `makeRng`. A later agent enriches this (rocks, decals,
// biome variation); the seam below is what they fill.
//
// The module owns and disposes only the geometries/materials it creates here
// (ground/grid/ore/crystals). Kit materials are NOT disposed here — the kit owns
// those. So ground material (from kit) is intentionally left out of dispose().

import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Vector3,
} from 'three';
import type { Snapshot } from '../sim/types';
import type { MaterialKit } from './materials';
import { PALETTE, makeRng } from './style';

export interface Scenery {
  group: Group;
  dispose(): void;
}

/** Tile-center world position for a cell (X = column, Z = row). */
function cellWorld(cell: number, w: number): Vector3 {
  return new Vector3((cell % w) + 0.5, 0, Math.floor(cell / w) + 0.5);
}

export function buildScenery(s: Snapshot, kit: MaterialKit): Scenery {
  const group = new Group();
  const owned: (BufferGeometry | MeshStandardMaterial | LineBasicMaterial)[] = [];
  const w = s.w;
  const h = s.h;

  // ground plane — material from the kit (kit owns/disposes it), geometry ours
  const groundGeo = new PlaneGeometry(w, h);
  const groundMat = kit.ground();
  // tile the ground texture across the whole map
  if (groundMat.map) {
    groundMat.map.wrapS = groundMat.map.wrapT = RepeatWrapping;
    groundMat.map.repeat.set(w / 4, h / 4);
    groundMat.map.needsUpdate = true;
  }
  const ground = new Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(w / 2, 0, h / 2);
  ground.receiveShadow = true;
  group.add(ground);
  owned.push(groundGeo);

  // grid lines over the play field
  const pts: number[] = [];
  for (let x = 0; x <= w; x++) pts.push(x, 0.02, 0, x, 0.02, h);
  for (let z = 0; z <= h; z++) pts.push(0, 0.02, z, w, 0.02, z);
  const lg = new BufferGeometry();
  lg.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const lineMat = new LineBasicMaterial({ color: 0x24332a, transparent: true, opacity: 0.5 });
  group.add(new LineSegments(lg, lineMat));
  owned.push(lg, lineMat);

  // ore deposits (instanced raised tiles) + crystals
  const ore = s.ore;
  if (ore.length) {
    const oreGeo = new BoxGeometry(0.98, 0.1, 0.98);
    const oreMat = new MeshStandardMaterial({ color: PALETTE.oreRock, roughness: 0.95 });
    const tiles = new InstancedMesh(oreGeo, oreMat, ore.length);
    tiles.receiveShadow = true;
    const m = new Matrix4();
    const crystalPos: number[] = [];
    const rnd = makeRng(1234);
    ore.forEach((cell, i) => {
      const p = cellWorld(cell, w);
      m.makeTranslation(p.x, 0.05, p.z);
      tiles.setMatrixAt(i, m);
      if (rnd() < 0.4) crystalPos.push(p.x + (rnd() - 0.5) * 0.4, 0, p.z + (rnd() - 0.5) * 0.4);
    });
    tiles.instanceMatrix.needsUpdate = true;
    group.add(tiles);
    owned.push(oreGeo, oreMat);

    if (crystalPos.length) {
      const cGeo = new ConeGeometry(0.12, 0.12, 5);
      const cMat = new MeshStandardMaterial({ color: PALETTE.oreCrystal, emissive: 0x6b4410, emissiveIntensity: 0.4, roughness: 0.6 });
      const crystals = new InstancedMesh(cGeo, cMat, crystalPos.length / 3);
      crystals.castShadow = true;
      for (let i = 0; i < crystalPos.length / 3; i++) {
        m.makeTranslation(crystalPos[i * 3], 0.13, crystalPos[i * 3 + 2]);
        crystals.setMatrixAt(i, m);
      }
      crystals.instanceMatrix.needsUpdate = true;
      group.add(crystals);
      owned.push(cGeo, cMat);
    }
  }

  return {
    group,
    dispose(): void {
      for (const o of owned) o.dispose();
      owned.length = 0;
    },
  };
}
