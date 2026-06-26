// Module + player models.
//
// STUB STAGE: this reproduces TODAY's renderer geometry exactly, only sourcing
// materials from the MaterialKit instead of `new MeshStandardMaterial`. A later
// agent fleshes these out into detailed machines — the contract below is the
// seam they fill, so it must stay stable:
//
//   - conveyor  → flat belt box (0.92 x 0.16 x 0.92), oriented by `dir`, no body.
//   - all other → 0.84^3 painted box (the renderer drives the busy emissive pulse
//                  on `body` and owns the label sprite + selection outline).
//   - miner / smelter additionally get the direction cone arrow.
//
// Do NOT add the label sprite or selection outline here — the renderer owns those.

import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { DEFS, type Dir, type ModuleType } from '../sim/types';
import type { MaterialKit } from './materials';
import { MODULE_STYLE } from './style';

/** Machine height in world units (1 unit = 1 tile). Matches renderer. */
const MACH_H = 0.72;

export interface BuiltModule {
  group: Group;
  /** The shell mesh the renderer pulses for "busy"; undefined for belts. */
  body?: Mesh;
  /** Optional per-frame animation hook (dt seconds, now ms, busy flag). */
  anim?: (dt: number, now: number, busy: boolean) => void;
}

/** Lay the (+Y) cone flat so it points along the grid direction. */
function orientArrow(mesh: Mesh, dir: Dir): void {
  if (dir === 1) mesh.rotation.z = -Math.PI / 2; // +X (east)
  else if (dir === 3) mesh.rotation.z = Math.PI / 2; // -X (west)
  else if (dir === 2) mesh.rotation.x = Math.PI / 2; // +Z (south)
  else mesh.rotation.x = -Math.PI / 2; // -Z (north)
}

export function buildModuleModel(type: ModuleType, dir: Dir, kit: MaterialKit): BuiltModule {
  const group = new Group();

  if (type === 'conveyor') {
    const belt = new Mesh(new BoxGeometry(0.92, 0.16, 0.92), kit.belt());
    belt.position.y = 0.13; // sits above the ore deposit layer so belts stay visible on ore
    belt.rotation.y = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][dir];
    belt.receiveShadow = true;
    group.add(belt);
    return { group, body: undefined };
  }

  const color = MODULE_STYLE[type].color;
  const body = new Mesh(new BoxGeometry(0.84, MACH_H, 0.84), kit.painted(color));
  body.position.y = MACH_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (type === 'miner' || type === 'smelter') {
    const ar = new Mesh(new ConeGeometry(0.13, 0.32, 4), kit.painted(0xffffff));
    orientArrow(ar, dir);
    ar.position.y = MACH_H + 0.04;
    group.add(ar);
  }

  // DEFS reference kept so the seam stays tied to the sim color contract even
  // though MODULE_STYLE currently mirrors it.
  void DEFS[type];

  return { group, body };
}

export function buildPlayerModel(kit: MaterialKit): Group {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.26, 0.3, 0.5, 16), kit.painted(0x2bb5a4));
  body.position.y = 0.35;
  body.castShadow = true;
  const head = new Mesh(new SphereGeometry(0.22, 16, 12), kit.emissiveAccent(0x7df0e0));
  head.position.y = 0.78;
  head.castShadow = true;
  const nose = new Mesh(new ConeGeometry(0.09, 0.22, 12), kit.painted(0x0c1611));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.5, 0.3);
  g.add(body, head, nose);
  return g;
}
