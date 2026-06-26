# DRIFTWORKS — project guide

A free web + mobile **isometric factory-automation game** (Factorio/Satisfactory-inspired). Walk a
character around a 3D world, mine ore, build belt-fed production, research a tech tree. Deployed to
GitHub Pages.

**Live:** https://prixedox.github.io/driftworks/ · **Repo:** github.com/prixedox/driftworks

## Stack
TypeScript (strict) · Vite 5 · Three.js (isometric 3D renderer) · deterministic sim in a Web Worker · PWA. No backend.

## Architecture — three layers + a wire
- **`src/sim/`** — the authoritative, **deterministic** game simulation (no DOM, no Three.js). Runs in a Web Worker.
- **`src/render/`** — Three.js presentation. Reads `Snapshot`s; **owns no game state**.
- **`src/ui/`** — DOM overlay HUD. Reads `Snapshot`s + `src/sim/data.ts`; presentation only.
- **`src/main.ts`** — the wire: spawns the worker, sends `Command`s, feeds snapshots to render+UI, handles input.

Sim ⇄ main talk only through `Command` / `Snapshot` (defined in `src/sim/types.ts`). Each subfolder has its own `CLAUDE.md` with the rules that matter there.

## Golden rules (do not break)
1. **Determinism:** `src/sim/*` is integer-only — no `Date.now`, `Math.random`, `performance.now`, or any wall-clock/IO; iterate order-stably (sort cells). Same commands + same tick count ⇒ identical snapshots. (There's a determinism unit test.)
2. **Render & UI read snapshots; they hold no game state.** Game logic lives only in `src/sim`.
3. **Single source of truth:** build costs and the tech tree live ONLY in `src/sim/data.ts` (imported by both sim and UI). Never hardcode them elsewhere.
4. **Player position is client-side** (in the renderer), never in the sim — player actions reach the sim as commands (e.g. `collect`).
5. **Commits: NO AI attribution** — never add `Co-Authored-By` or "Generated with" lines (project preference).

## Commands
- `npm install` — deps (Node 20).
- `npm run dev -- --host` — dev server; open the printed `192.168.x.x:5173` on a phone.
- `npm run build` — **the gate**: `tsc --noEmit && vite build`. Must be green before committing/deploying.
- `npm run preview` — serve the built `dist/`.

## Tests & verification
- `npm test` runs every `tests/*.test.ts` suite (determinism, economy, placement, recipes, research, save) via `tsx`. Single suite: `npx tsx tests/<file>.test.ts`.
- **CI gates deploy:** `.github/workflows/deploy.yml` has a `ci` job (`npm ci && npm run build && npm test`); `build`/`deploy` `needs: ci`, so a red test blocks the live push.
- `tests/determinism.test.ts` asserts a baked **golden snapshot hash**. It deliberately breaks whenever `sim/` logic or the `Snapshot` shape changes — `npm test` prints `got <hash>`; re-baseline it as part of that change.
- Visual checks: headless `google-chrome`/`playwright` (Playwright MCP, or scripts in the session scratchpad).

## Deploy
Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to Pages. `vite.config.ts` uses `base: './'` so it works under the `/driftworks/` subpath. After a push, the CDN can lag ~1–2 min; confirm the live `index-*.js` hash matches the local `dist/` hash.

## Docs
- **`docs/ROADMAP.md`** — long-range game roadmap & design vision (UX, UI, research, biomes, endgame, multiplayer, tech). The default direction for "what next".
- **`docs/superpowers/plans/PLAN-INDEX.md`** — index of ready-to-run feature plans (save v3, copper/circuits, build UX, stats/minimap, settings, onboarding, CI/determinism) + a conflict map and the order/worktree strategy for running multiple agents without collisions.
- Design specs & plans: `docs/superpowers/{specs,plans}/` (this project uses the superpowers brainstorm→spec→plan→subagent-execute flow).
- `GDD.md` — the game design doc (high level; may lag the code).

## Known backlog
- Lab draws no power; science buffers silently if no science-tech is active; `EXPLAIN` map is dead; some duplicate CSS.
- Ready-to-run feature plans #4–#7 (build UX, stats/minimap, settings/graphics, onboarding) are written but unbuilt — see `docs/superpowers/plans/PLAN-INDEX.md`.
- **Shipped:** save v3 (persists inventory/research/unlocks/upgrades) · copper/circuits + `RECIPES` (recipe-select machines) · CI test gating + determinism harness.
