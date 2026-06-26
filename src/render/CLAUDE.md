# src/render — Three.js presentation

Renders the world in 3D. **Reads `Snapshot`s; owns no game state.** Fixed **isometric orthographic
camera** that snaps in 90° steps. World coords: **X = column, Z = row, Y = up; 1 unit = 1 tile**
(see `cw(cell)`). The player walks client-side here (continuous), camera follows; the sim never sees
player position.

## Files (seams — keep responsibilities separated)
- **`renderer.ts`** — orchestrator: camera + frustum, the `setAnimationLoop` frame, player movement
  integration, snapshot→scene diffing (modules/packets created & disposed as they appear/vanish),
  the build **ghost** / ore **highlight** / selection **outline**, and `screenToCell` (ground-plane
  raycast — correct at any rotation). This is the public API surface for `main.ts`.
- **`style.ts`** — `PALETTE`, `LIGHT`, `FOG`, tone-mapping exposure, `darken()`. **Tune the look
  here.**
- **`materials.ts`** — `MaterialKit` (shared materials + procedural textures, e.g. the belt tread).
- **`models.ts`** — machine + player meshes (`buildModuleModel`, `buildPlayerModel`).
- **`scenery.ts`** — terrain, ore rocks, scatter, sky dome (`buildScenery`).
- **`effects.ts`** — particle systems (smoke/dust/exhaust/sparkle).
- **`postfx.ts`** — post-processing (bloom; ACES tonemapping is set on the renderer in `renderer.ts`).

## Public API consumed by `src/main.ts`
`init(parent)`, `get canvas`, `setSnapshot(s)`, `setExplain(on)`, `setMove(x,y)`, `getPlayer()`,
`setPlayer(x,y)`, `rotateView(d)`, `setGhost(g|null)`, `setHighlight(cells)`, `setSelected(cell|null)`.
If you change a signature, update `main.ts` accordingly.

## Performance (mobile-conscious)
Cap pixel ratio (`min(devicePixelRatio, 2)`); use `InstancedMesh` for repeated scenery (ore);
**dispose geometries/materials** when rebuilding (scenery rebuild, highlight rebuild, packet
removal) to avoid GPU leaks. Bundle is large (Three.js + postfx) — avoid adding heavy deps.
