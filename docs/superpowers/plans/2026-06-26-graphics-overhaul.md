# Graphics Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DRIFTWORKS look like a real industrial automation game (Factorio/Satisfactory-flavored, with the signature glowing "Pulse" look) instead of flat colored boxes — without touching the simulation.

**Architecture:** The render layer (`src/render/renderer.ts`) is a pure presentation layer that only reads immutable `Snapshot`s from the sim worker. We split it into a small "render kit" of focused modules (`materials`, `models`, `scenery`, `effects`, `postfx`) wired through stable extension seams, then upgrade each module independently. The renderer's public API and the sim contract (`src/sim/types.ts`) are **frozen** — `main.ts` and the worker must keep working unchanged.

**Tech Stack:** TypeScript, Three.js 0.169 (with `three/examples/jsm` addons available: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`, `GTAOPass`), Vite 5, deterministic sim in a Web Worker.

## Global Constraints

- **Frozen sim contract:** Do NOT modify `src/sim/*` (`types.ts`, `world.ts`, `worker.ts`, `data.ts`). The renderer consumes `Snapshot` exactly as defined today.
- **Frozen renderer public API:** `Renderer` must keep these methods with identical signatures (consumed by `src/main.ts`): `init(parent)`, `get canvas()`, `setSnapshot(s)`, `setExplain(on)`, `setMove(x,y)`, `getPlayer()`, `setPlayer(x,y)`, `setGhost(g)`, `setHighlight(cells)`, `setSelected(cell)`, `rotateView(d)`, `screenToCell(px,py)`, `adjacentDir(from,to)`.
- **Camera stays:** Orthographic, ~38° elevation, 90°-snap azimuth, follow-cam on the player. `VIEW_TILES = 17`. Do not switch to perspective.
- **World coords:** X = column, Z = row, Y = up; 1 unit = 1 tile. Grid is `w × h` (default 40 × 26).
- **Readability first (GDD pillar):** must stay legible on a 6" phone. Glowing Pulse packets are the signature — they must read clearly and bloom. No spaghetti, no clutter that hides machine state.
- **Determinism of visuals:** any scatter/decoration randomness uses a seeded PRNG (LCG, same pattern as the existing ore-crystal scatter in `buildWorld`) — never `Math.random()` — so the world is stable across rebuilds/reloads.
- **Performance budget:** keep it smooth on a phone. Prefer `InstancedMesh` for repeated geometry (ground tiles, ore rocks, scatter, particles). Reuse/cached materials. Dispose geometry/materials on teardown (the renderer already tracks `disposables` and `disposeModule`).
- **Verification:** `npx tsc --noEmit` must pass; `npm run build` must pass; existing tests (`tests/placement.test.ts`, `tests/economy.test.ts`) must still pass; visual checks via Playwright screenshots of the render lab and the live game.

---

## File Structure

New render-kit modules under `src/render/` (each one clear responsibility):

- `src/render/style.ts` — **single source of visual truth.** Palette (faction teal accent, metal greys, biome ground tones), per-module color/accent/emissive config, material tuning constants, bloom/tone-mapping params, light colors/intensities. Everyone imports from here so the look stays coherent.
- `src/render/materials.ts` — procedural texture + PBR material factory (brushed/painted metal with normal + roughness + AO via canvas, warning-stripe texture, the scrolling belt tread, ground texture). Caches and exposes a `MaterialKit`.
- `src/render/models.ts` — detailed machine + player model builders. Exposes `buildModuleModel(type, dir, kit)` → `{ group, body?, anim? }` and `buildPlayerModel(kit)` → `Group`.
- `src/render/scenery.ts` — terrain (textured ground + soft grid), the ore field (clustered 3D ore rocks), scattered decoration (rocks/tufts), sky gradient + fog. Exposes `buildScenery(snapshot, kit)` → `{ group, dispose() }`.
- `src/render/effects.ts` — lightweight particle/FX systems (smelter smoke + ember, miner dust, generator exhaust, packet sparkle, pulse ripple). Exposes a `Effects` class with `attach(scene)`, `update(dt, now, snapshot, helpers)`, and `dispose()`.
- `src/render/postfx.ts` — `EffectComposer` pipeline (RenderPass → bloom → output) + tone mapping/exposure config + `resize(w,h)` + `render()`. Exposes a `PostFX` class.
- `src/render/renderer.ts` — **orchestrator only.** Owns scene, camera, lights, the animation loop, raycasting, and input hooks. Delegates building to the kit modules through the seams below. Touched only in Task 1 (seams) and Task 6 (integration/tuning).

Render lab (visual harness, dev only — not shipped in the game bundle's main entry):

- `render-lab.html` — second Vite page at repo root.
- `src/render-lab.ts` — mounts a neutral showcase scene (ground + ore + one of each machine + a couple of packets + effects) using the kit, fixed camera, no worker, no UI. Lets any agent screenshot the visuals in isolation via Playwright.

### Extension seams (defined in Task 1, filled later)

The renderer delegates through these so later tasks edit only their own module file, never `renderer.ts`:

- Machines/player: `renderer.buildModule` calls `models.buildModuleModel(type, dir, kit)`; `renderer.buildPlayer` calls `models.buildPlayerModel(kit)`.
- World: `renderer.buildWorld(snapshot)` calls `scenery.buildScenery(snapshot, kit)` and adds the returned group to `worldGroup`.
- Effects: `renderer.init` creates `this.effects = new Effects(kit)` and calls `this.effects.attach(scene)`; `renderer.frame` calls `this.effects.update(dt, now, snapshot, helpers)`.
- Post-processing: `renderer.init` creates `this.postfx = new PostFX(renderer, scene, camera)`; `renderer.frame` calls `this.postfx.render()` instead of `renderer.render(scene, camera)`; `onResize` calls `this.postfx.resize(w,h)`.

---

## Task 1 — Foundation: render kit seams, style module, materials, post-processing, render lab

**Stage A — sequential, runs first. Establishes every seam so Tasks 3–5 can run in parallel without touching `renderer.ts`.**

**Files:**
- Create: `src/render/style.ts`
- Create: `src/render/materials.ts`
- Create: `src/render/models.ts` (stub: reproduces current visuals)
- Create: `src/render/scenery.ts` (stub: reproduces current visuals)
- Create: `src/render/effects.ts` (stub: no-op)
- Create: `src/render/postfx.ts`
- Create: `render-lab.html`, `src/render-lab.ts`
- Modify: `src/render/renderer.ts` (extract material factory → `materials.ts`; delegate buildModule/buildPlayer/buildWorld/effects/postfx through the seams; ACESFilmic tone mapping + sRGB output)

**Interfaces produced (later tasks rely on these exact signatures):**
- `style.ts`: `export const PALETTE`, `export const MODULE_STYLE: Record<ModuleType, { color: number; accent: number; emissive: number }>`, `export const BLOOM`, `export const LIGHT`, `export function darken(c:number,f:number):number`, `export function makeRng(seed:number):()=>number`.
- `materials.ts`: `export interface MaterialKit { metal(color:number, opts?):MeshStandardMaterial; painted(color:number):MeshStandardMaterial; belt():MeshStandardMaterial; beltTexture():CanvasTexture; ground():MeshStandardMaterial; warningStripe():MeshStandardMaterial; emissiveAccent(color:number):MeshStandardMaterial; dispose():void }` and `export function createMaterialKit():MaterialKit`.
- `models.ts`: `export interface BuiltModule { group: Group; body?: Mesh; anim?: (dt:number, now:number, busy:boolean)=>void }`, `export function buildModuleModel(type:ModuleType, dir:Dir, kit:MaterialKit): BuiltModule`, `export function buildPlayerModel(kit:MaterialKit): Group`. Conveyor returns `body: undefined`. The renderer still owns the label sprite + selection outline + the existing emissive busy-pulse on `body`; `anim` is an optional extra per-frame hook a model can use (e.g. spin a drill).
- `scenery.ts`: `export interface Scenery { group: Group; dispose():void }`, `export function buildScenery(s:Snapshot, kit:MaterialKit): Scenery`.
- `effects.ts`: `export interface EffectHelpers { cellToWorld(cell:number):{x:number;z:number} }`, `export class Effects { constructor(kit:MaterialKit); attach(scene:Scene):void; update(dt:number, now:number, s:Snapshot, h:EffectHelpers):void; dispose():void }`.
- `postfx.ts`: `export class PostFX { constructor(renderer:WebGLRenderer, scene:Scene, camera:Camera); resize(w:number,h:number):void; render():void; setEnabled(on:boolean):void; dispose():void }`.

- [ ] **Step 1 — Create `src/render/style.ts`.** Centralize the palette and per-module style. Seed values from the current code: module colors from `DEFS` (`miner 0xb8732e`, `conveyor 0x37424f`, `smelter 0xc0392b`, `storage 0x2e7d57`, `generator 0xb59a2e`); accent teal `0x5ad1c0`. Add `accent`/`emissive` per module (sensible: miner accent amber, smelter emissive hot orange `0xff5a1e`, generator emissive electric `0x6bd0ff`, storage accent teal, conveyor accent teal). Export `darken` (move the existing impl) and `makeRng(seed)` (the LCG from `buildWorld`). Export `BLOOM` (`{ strength: 0.55, radius: 0.5, threshold: 0.78 }` as a starting point), `LIGHT` (key `0xfff1d6`, fill/hemi sky `0xbfe0ff`/ground `0x16240f`, ambient `0x8a98ad`).

- [ ] **Step 2 — Create `src/render/materials.ts`.** Implement `createMaterialKit()` returning a `MaterialKit`. Move `makeBeltTexture` here (as `beltTexture()` + `belt()` material). Implement procedural canvas textures for `metal`/`painted` (subtle brushed-metal normal + roughness variation; a few px of edge noise — keep it cheap, 128–256px, cached per color), `ground()` (tiling dirt/rock with low-contrast color noise, `RepeatWrapping`), `warningStripe()` (diagonal hazard stripes), `emissiveAccent(color)`. Cache by key; track disposables; implement `dispose()`. Keep it self-contained (only imports `three` + `style.ts`).

- [ ] **Step 3 — Create `src/render/postfx.ts`.** Implement `PostFX` using `three/examples/jsm/postprocessing/EffectComposer.js`, `RenderPass.js`, `UnrealBloomPass.js`, `OutputPass.js`. Constructor builds the composer; `render()` runs it; `resize(w,h)` sets composer + bloom sizes and respects `min(devicePixelRatio,2)`; `setEnabled(on)` toggles between composer and direct render; bloom params from `style.BLOOM`. Note: bloom uses `Vector2` resolution — import from three.

- [ ] **Step 4 — Create stub `src/render/models.ts`.** Implement `buildModuleModel` / `buildPlayerModel` that reproduce **exactly today's look** (boxes/cones/cylinders from `renderer.ts`) but sourced via the `MaterialKit`. This keeps the game visually unchanged after Stage A while giving Task 3 a file to own. Conveyor → belt box with `kit.belt()`; others → `0.84³` box with `kit.painted(color)` + the arrow cone for miner/smelter. Player → cylinder+sphere+cone as today.

- [ ] **Step 5 — Create stub `src/render/scenery.ts`.** `buildScenery` reproduces today's ground + grid + ore tiles + crystal cones (move that code verbatim, using `kit.ground()` for the ground and `makeRng` for scatter). Returns `{ group, dispose() }`.

- [ ] **Step 6 — Create stub `src/render/effects.ts`.** `Effects` with no-op `attach`/`update`/`dispose` (so Task 5 fills it in).

- [ ] **Step 7 — Refactor `renderer.ts` to use the seams.** Replace inline material creation with `this.kit = createMaterialKit()`. `buildModule` → call `buildModuleModel`, keep the label sprite + busy-pulse wiring on the returned `body`, store optional `anim` on the `ModEntry`. `buildPlayer` → `buildPlayerModel`. `buildWorld` → `buildScenery` (dispose the previous scenery on rebuild). `init` → set `renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure ≈ 1.05`, `outputColorSpace = SRGBColorSpace`; create `this.effects` + `this.postfx`. `frame` → call `effects.update(...)` and any `anim` hooks, then `this.postfx.render()`. `onResize` → `this.postfx.resize(...)`. Keep all public methods identical.

- [ ] **Step 8 — Create the render lab.** `render-lab.html` (copy of `index.html` head, `<script type="module" src="/src/render-lab.ts">`). `src/render-lab.ts`: build a `Scene` + the same ortho follow-cam config, instantiate the `MaterialKit`, place a small ground, an ore patch, one of each machine (miner/smelter/storage/generator on ore where relevant + a short belt line), two packets, attach `Effects` + `PostFX`, fixed slowly-rotating-or-static camera, animate belt tex + effects in a loop. No worker, no UI. This is the visual proving ground for Tasks 3–5.

- [ ] **Step 9 — Verify.** Run `npx tsc --noEmit` (PASS). Run `npm run build` (PASS). Run the existing tests (`node --test` via the project's test runner / `npx tsc` already covers types — run `npm test` if defined, else `npx vitest run` is not configured; the two test files use Node's test runner — run them with `npx tsx` or per project convention; if unclear, at minimum keep them compiling). Start `npm run dev`, Playwright-navigate to `/render-lab.html` AND `/index.html`, screenshot both. Confirm the game still looks like the current build (no regressions) and now has bloom/tone-mapping lift. Commit: `git add -A && git commit -m "render: split renderer into kit modules + bloom/tonemap + render lab"`.

---

## Task 2 — Lighting, camera & atmosphere polish

**Stage A continuation — sequential, same worktree as Task 1. (Small, touches `renderer.ts` + `style.ts`; done before fan-out so it doesn't collide with parallel tasks.)**

**Files:**
- Modify: `src/render/renderer.ts` (lights, exposure, shadow tuning)
- Modify: `src/render/style.ts` (light constants), `src/render/postfx.ts` (exposure/bloom fine-tune)

- [ ] **Step 1 — Warmer, layered lighting.** Tune the directional key light (warm `0xfff1d6`, intensity ~1.4), add a cool rim/fill via the hemisphere/ambient already present; soften shadows (`shadow.radius`, `shadow.bias ≈ -0.0004` to kill acne, `mapSize 2048`). Keep the light following the player.
- [ ] **Step 2 — Tone & bloom harmony.** Set `toneMappingExposure` and `BLOOM` so glowing packets/emissive pop without washing out the matte machines. Confirm the dark blue background reads as "dusk industrial."
- [ ] **Step 3 — Verify.** `tsc --noEmit` + dev-server Playwright screenshot of `/index.html`. Commit: `git commit -am "render: lighting + tone/bloom polish"`.

---

## Task 3 — Detailed machine & player models (PARALLEL, own worktree)

**Stage B — runs in parallel with Tasks 4 and 5. Edits ONLY `src/render/models.ts` (+ may add a preview to `src/render-lab.ts` guarded to its own section). Never touches `renderer.ts`.**

**Files:**
- Modify: `src/render/models.ts`

**Interfaces consumed:** `MaterialKit` (Task 1/2), `MODULE_STYLE`, `darken`, `makeRng`, `PALETTE` from `style.ts`. `BuiltModule`/`buildModuleModel`/`buildPlayerModel` signatures fixed in Task 1.

- [ ] **Step 1 — Miner.** A drill rig: chamfered housing on short legs, a warning-stripe band, an angled output chute toward `dir`, and a vertical drill bit (cylinder + cone) that the `anim` hook spins when busy. Keep footprint ≤ ~0.9 tile, height readable.
- [ ] **Step 2 — Smelter.** A furnace: ribbed body, a front door with strong emissive (hot orange `0xff5a1e`) that brightens with `busy`, a chimney stack (anchor point for smoke — effects task reads module positions, no coupling needed), metal trim.
- [ ] **Step 3 — Storage.** A reinforced crate/silo: panel seams, corner bolts, a teal content-light strip; reads clearly as "container."
- [ ] **Step 4 — Generator.** An engine block: housing with cooling fins, a spinning fan/flywheel via `anim`, glowing electric-blue vents (`0x6bd0ff`), exhaust pipe.
- [ ] **Step 5 — Conveyor.** Proper belt: two side frames, end rollers, the scrolling tread on top (use `kit.belt()` so the existing tex-scroll in `renderer.frame` still animates it), slightly inset so packets sit on the tread. Must auto-orient by `dir` exactly as before.
- [ ] **Step 6 — Player.** A friendlier engineer/scout bot: rounded torso, a visor head with emissive accent, small antenna/backpack, a nose/forward indicator so facing is clear. Keep it ~the same scale; the renderer still drives position/rotation/bob.
- [ ] **Step 7 — Verify.** `tsc --noEmit` PASS. In the worktree, symlink node_modules (`ln -s <main>/node_modules ./node_modules`), `npm run dev -- --port 5181`, Playwright-screenshot `/render-lab.html`; confirm each machine is recognizable and on-grid. Commit on the task branch.

---

## Task 4 — Scenery: terrain, ore field, scatter, sky/fog (PARALLEL, own worktree)

**Stage B — parallel. Edits ONLY `src/render/scenery.ts` (+ guarded preview in lab). Never touches `renderer.ts`.**

**Files:**
- Modify: `src/render/scenery.ts`

**Interfaces consumed:** `MaterialKit.ground()`, `style.PALETTE`, `makeRng`. `Scenery`/`buildScenery` signatures fixed in Task 1.

- [ ] **Step 1 — Ground.** Replace the flat plane with a textured ground (`kit.ground()`), subtle large-scale color variation, gentle ambient-occluded edges where it meets the play area. Keep `receiveShadow`.
- [ ] **Step 2 — Soft grid.** Replace the harsh full-bright grid with a subtle one: thinner, lower opacity, cooler color, OR faint per-tile borders — present enough to aid building, not visually loud. Keep it at `y ≈ 0.02`.
- [ ] **Step 3 — Ore field.** Replace flat ore tiles + tiny cones with clustered low-poly **ore rocks**: per ore cell, an instanced cluster of 2–4 faceted chunks (varied scale/rotation via `makeRng(cell)`), warm rock color with emissive amber veins so they bloom. Still readable as "minable ore here." Instanced for perf.
- [ ] **Step 4 — Scatter decoration.** Sparse instanced rocks/pebbles/grass tufts across non-ore, non-built ground (seeded, deterministic) to break the emptiness. Density low; never on ore cells; keep clear of readability.
- [ ] **Step 5 — Sky & fog.** A vertical gradient sky (large inverted sphere or `scene.background` gradient texture) in dusk-industrial tones, plus subtle `scene.fog`/`FogExp2` for depth at the map edges. (Renderer sets `scene.background` today to a flat color — `buildScenery` may set `scene.fog`; expose sky via the returned group or document that the renderer keeps the background. To avoid touching renderer, prefer adding a large sky mesh to the returned `group` and a fog object the renderer can read — OR set fog on a passed-in scene. Keep within the frozen-API rule: do not change renderer public methods; setting `scene.fog` from within `buildScenery` is acceptable since the renderer already owns the scene and calls this.) 
- [ ] **Step 6 — Verify.** `tsc --noEmit` PASS, symlink node_modules, `npm run dev -- --port 5182`, Playwright-screenshot `/render-lab.html`. Confirm ground reads richer, ore is obvious, grid still helps building. Commit on the task branch.

---

## Task 5 — Effects & particles (PARALLEL, own worktree)

**Stage B — parallel. Edits ONLY `src/render/effects.ts` (+ guarded preview in lab). Never touches `renderer.ts`.**

**Files:**
- Modify: `src/render/effects.ts`

**Interfaces consumed:** `MaterialKit`, `style`, `EffectHelpers.cellToWorld`. `Effects` class signature fixed in Task 1. `update` receives the live `Snapshot` (so it knows which modules are `busy`, where smelters/miners/generators are, and packet positions) and `EffectHelpers` for cell→world conversion.

- [ ] **Step 1 — Particle core.** A cheap, instanced/points-based particle pool with spawn/age/recycle, additive-blended sprites (soft round texture), driven by `update(dt, now, snapshot, helpers)`. Cap total particles for phone perf.
- [ ] **Step 2 — Smelter smoke + ember.** For each busy smelter, emit slow grey smoke rising from its chimney position + a few warm embers near the door. Throttle spawn rate.
- [ ] **Step 3 — Miner dust.** Small dust puffs at busy miners' drill point.
- [ ] **Step 4 — Generator exhaust.** Faint exhaust + a subtle electric flicker glow at running generators.
- [ ] **Step 5 — Packet sparkle / pulse ripple.** A soft glow sprite tracking each packet (reinforces the bloom-y Pulse look) and/or a subtle expanding ring on the global pulse beat. Must stay legible, not noisy.
- [ ] **Step 6 — Verify.** `tsc --noEmit` PASS, symlink node_modules, `npm run dev -- --port 5183`, Playwright-screenshot `/render-lab.html` with a couple of busy machines + packets. Confirm effects enhance, don't obscure. Commit on the task branch.

---

## Task 6 — Integration, holistic tuning & final verification

**Stage C — sequential, after Tasks 3–5 merge. Single agent in the base worktree.**

**Files:**
- Modify: `src/render/renderer.ts` (only if minor seam friction), `src/render/style.ts` (final harmony tuning), `src/render-lab.ts` (final showcase)

- [ ] **Step 1 — Merge** the three Stage-B branches into the base graphics branch (disjoint files → expect no conflicts; resolve any in `render-lab.ts`).
- [ ] **Step 2 — Holistic look pass.** With everything on, tune `style.ts` (palette/emissive/bloom/light) so models + scenery + effects + post-processing form ONE coherent look. Make sure machines stay matte and readable while packets/emissive/ore veins bloom.
- [ ] **Step 3 — Readability + state check.** Confirm on the live game: build ghost (green/red), miner ore-highlight, selection outline, explain labels, busy glow, power-deficit cues all still read clearly over the richer scene.
- [ ] **Step 4 — Perf check.** Confirm smooth framerate (instancing in place, particle cap sane, materials cached, scenery disposed on rebuild). No per-frame allocations in `frame`.
- [ ] **Step 5 — Full verification.** `npx tsc --noEmit` PASS; `npm run build` PASS; existing tests still pass; Playwright screenshots of `/index.html` (place a few machines via the UI or load a save) showing the new look; capture before/after. 
- [ ] **Step 6 — Commit & finish.** Commit the integration. Then per `superpowers:finishing-a-development-branch`, merge the graphics branch back to `main` (the user's uncommitted sim work lives only in the original main working tree and is untouched by worktrees; the merge only adds render-layer files).

---

## Self-Review notes

- **Spec coverage:** "not just squares" → Tasks 3 (models), 4 (ore/scenery); "prettier / more Factorio" → Tasks 1–6 (materials, bloom, lighting, effects). "Subagent driven, with worktrees" → Stage A sequential, Stage B parallel in worktrees, Stage C integration. "Decide everything, no questions" → plan picks all defaults (palette, bloom params, model designs) without asking.
- **Frozen contracts:** every task reiterates the renderer-API / sim-contract freeze. The seams (Task 1) are what let Tasks 3–5 avoid editing `renderer.ts` → no parallel conflicts.
- **Type consistency:** `MaterialKit`, `BuiltModule`, `Scenery`, `Effects`, `PostFX`, `EffectHelpers` are defined once in Task 1's Interfaces block and consumed verbatim by Tasks 2–6.
- **Risk:** graphics aren't unit-testable; mitigated by the render lab + Playwright screenshots at every task and a dedicated holistic pass (Task 6).
