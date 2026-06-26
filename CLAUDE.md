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
- Unit tests live in `tests/*.test.ts`, run via `npx tsx tests/<file>.test.ts` (plain asserts + `process.exit`). **Not** wired into `npm run build`/CI — run them manually.
- Visual checks: headless `google-chrome` driven by `playwright-core` (scripts in the session scratchpad). `chromium-cli` is NOT installed.

## Deploy
Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to Pages. `vite.config.ts` uses `base: './'` so it works under the `/driftworks/` subpath. After a push, the CDN can lag ~1–2 min; confirm the live `index-*.js` hash matches the local `dist/` hash.

## Docs
- **`docs/ROADMAP.md`** — long-range game roadmap & design vision (UX, UI, research, biomes, endgame, multiplayer, tech). The default direction for "what next".
- Design specs & plans: `docs/superpowers/{specs,plans}/` (this project uses the superpowers brainstorm→spec→plan→subagent-execute flow).
- `GDD.md` — the game design doc (high level; may lag the code).

## Known backlog
- **Save/load (`SaveState` v2) does NOT persist inventory / research / unlocks** — they reset on reload; needs a format bump (v3). Biggest gap.
- Lab draws no power; science buffers silently if no science-tech is active; `EXPLAIN` map is dead; some duplicate CSS; tests not in CI.
