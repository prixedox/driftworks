# Phase 11 — Release: performance, PWA, accessibility, balance, tutorial v2, docs, 1.0 (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 11).
> Spec §6, §9.1–9.2. This phase is measurement-driven: **measure before fixing, record
> numbers in commit messages.**

**Goal:** budgets enforced (60 fps mid phone / ≤ 250 KB gz initial JS), installable PWA,
accessible, tuned pacing with the anti-soft-lock proof, tutorial covering the full game,
honest docs, `v1.0.0` tagged and live.

**Branch:** `phase-11-release`.

## Pre-flight reality check

- [ ] Phases 1–10 merged; `npm test` fully green; live build current.
- [ ] Menu already boots DOM-first with lazy `renderer.init` (Phase 9 Task 6) — the
  code-split (Task 2) builds on that seam.
- [ ] `sw.js` + manifest exist in `public/` (prototype-era) — inventory what's there
  before replacing (Task 3).
- [ ] Tutorial (#7) `TUTORIAL_STEPS` is declarative; the oil guide (Phase 5) established
  the multi-guide pattern.

## Task 1 — Performance pass (measure → fix → assert)

**Files:** Modify `tests/_harness.ts` (benchmark world builder), `src/render/*` (fixes),
create `tests/perf.test.ts`.

- [ ] **Benchmark fixture:** `buildBenchWorld(w: World)` in `_harness.ts` — scripted
  1,000-module base (mixed miners/belts/smelters/assemblers/power across 3 biomes,
  ~200 packets in flight) at a fixed seed. Deterministic.
- [ ] **Measure:** (a) sim: `advance()` mean over 500 ticks on the bench world (Node
  `process.hrtime.bigint()` in the test — wall-clock in TESTS is fine, never in sim);
  (b) render: Chrome tracing on the deployed build with the bench save imported, mid-tier
  throttling (Playwright CPU throttle 4×), record FPS + draw calls + `renderer.info`;
  (c) memory: walk 200 tiles, geometries/textures plateau.
- [ ] **Fix to budget** (biggest wins first — stop when green):
  1. **Instanced machines:** one InstancedMesh per ModuleType for the *static shell* of
     each machine (per-type merged geometry), per-instance color; keep bespoke Groups
     only for animated parts (pumpjack head, turret barrel) and for the N nearest
     machines (detail radius ~12 tiles). This is the renderer's biggest refactor —
     isolate in `src/render/instanced.ts`.
  2. Chunk frustum culling (skip `ensure` outside the camera frustum + hysteresis).
  3. Particle caps per quality tier (settings-driven).
  4. Packet meshes → one InstancedMesh per item type.
  5. Snapshot window tune (48→40 tiles if needed).
- [ ] **Assert:** `tests/perf.test.ts` — bench `advance()` mean < 8 ms × 3 CI margin
  (= assert < 24 ms; prints the real number). Record desktop+throttled FPS in the commit.
- [ ] Commit: `perf: instanced machines/packets, culling, caps — <numbers>`.

## Task 2 — Bundle pass

**Files:** Modify `vite.config.ts`, `src/main.ts`, `index.html`.

- [ ] Split: menu path stays DOM-only; `const { Renderer } = await import('./render/renderer')`
  behind Continue/New (three.js + postfx land in an async chunk); `postfx` further lazy
  behind the quality setting (dynamic import inside renderer init).
- [ ] Measure with `npx vite-bundle-visualizer` (or `rollup-plugin-visualizer` dev-dep).
  Targets: initial ≤ 250 KB gz; total app (excl. audio) ≤ 1.2 MB gz. Record numbers.
- [ ] Verify the worker chunk still loads under `base: './'` on Pages (test the deployed
  preview — worker URLs are the classic breakage).
- [ ] Commit: `build: code-split renderer/postfx — initial <N> KB gz`.

## Task 3 — PWA polish

**Files:** Modify `index.html`, `public/` (icons, manifest), `vite.config.ts`
(`vite-plugin-pwa` dev-dep, `generateSW` precache), `src/main.ts` (update toast).

- [ ] Icons: draw a proper mark (isometric machine block + packet glow, matches the neon
  look) as SVG → render 192/512 + maskable PNGs (headless Chrome screenshot of the SVG is
  fine); manifest: name DRIFTWORKS, standalone, theme/background from theme.css tokens,
  orientation any.
- [ ] Precache SW replaces prototype `sw.js` (keep the registration path in main.ts;
  `skipWaiting` OFF — update applies on reload); on `needRefresh` → toast
  "Updated — tap to reload".
- [ ] Lighthouse (headless) PWA + perf run on the deployed build: PWA pass ≥ 90; record
  scores. Test install on Android Chrome if available.
- [ ] Commit: `pwa: real icons, manifest, precache SW, update toast — LH <scores>`.

## Task 4 — Accessibility

**Files:** Modify `src/ui/*` (audit), `src/ui/theme.css`, `src/settings.ts` (uiScale,
reduceMotion fields), `src/render/renderer.ts` (reduce-motion honors).

- [ ] UI scale slider (80–130%): root `font-size` var + rem-based UI sizes (sweep
  style.css for px font sizes → rem).
- [ ] Colorblind audit: every ItemType icon has a distinct SHAPE (Phase 4 set most;
  verify pairs copper_plate/plate, science tiers by pip count); item colors also differ
  in luminance (check with a simulator screenshot pass).
- [ ] Reduce motion: kills camera-snap easing (instant), player bob, screen flash/shake,
  particle bursts (ambient only), tread scroll.
- [ ] Touch targets ≥ 40 px audit (hotbar tiles, dock, close buttons); `aria-label` on
  all icon-only buttons; focus order + Escape-closes for panels (menu, research, codex,
  settings, map).
- [ ] Commit: `a11y: ui scale, shape-coded icons, reduce motion, targets/labels`.

## Task 5 — Balance & pacing pass + anti-soft-lock proof (TDD)

**Files:** Create `tests/softlock.test.ts`; modify `src/sim/data*.ts` (tuning only).

- [ ] **tests/softlock.test.ts:** (a) fresh world: a scripted command sequence
  (hand-contribute → smelting → power → automation) reaches plates within N ticks using
  only guaranteed starter deposits; (b) bankrupt state: erase every module, zero the
  inventory except nothing — assert the collect/hand-mine path still exists (miner cost
  5 ore must be reachable: **verify the `collect`-from-storage + erase-refund floor
  covers it; if a true zero state is reachable, add a sim invariant: erase refunds ensure
  inventory ≥ cheapest miner cost — decide in-code, document in the test**); (c) every
  RAID_TABLE wave is survivable by a wall+2-turret kit at its pollution tier (scripted
  fight, Standard).
- [ ] **Milestone-density check (spec §9.1):** a script (scratchpad, not committed to
  tests) computes minutes-between-unlocks across the tech DAG from recipe rates at a
  reference factory size; chart it; no gap > 2× early cadence — re-cost outliers in
  data.ts (log every change in the commit body).
- [ ] Manual calibration: first automated science 30–60 min (stopwatch a real run at 1×);
  Ark 6–10 h extrapolated from rates. Tune `data*.ts` only; re-baseline once at the end.
- [ ] Commit: `balance: pacing pass + softlock proof (+data changes listed)`.

## Task 6 — Tutorial v2 + objective fallback chain

**Files:** Modify `src/ui/tutorial.ts`, `src/main.ts`.

- [ ] Extend `TUTORIAL_STEPS`: tooltips (long-press hint), pipette, codex, research
  queue, map + beacon, steam power (post-`steam_power` guide, oil-guide pattern), first
  raid prep (Drifter-only branch — steps carry `mode?: GameMode`), Ark intro (arms at
  sci4). Replayable from Help.
- [ ] Objective chip fallback chain (never blank): tutorial/guided step → active research
  → cheapest affordable unresearched tech ("Research Steel Making?", tap → opens graph)
  → next Ark stage → Infinite suggestion. Pure snapshot derivation in tutorial.ts.
- [ ] FTUE stopwatch (Phase-1 targets re-verified on the FULL game): first miner ≤ 2 min,
  first automated line ≤ 8 min, tutorial ≤ 12 min. Commit: `ux: tutorial v2 + never-blank objective`.

## Task 7 — Replay harness extension

**Files:** Create `tests/replay.test.ts`; modify `tests/_harness.ts` (worker-level
command replay: run commands through a World the way worker.ts routes them — extract
worker's switch into a pure `applyCommand(world, cmd)` in `src/sim/worker.ts` and import
THAT, so the test exercises the real routing).

- [ ] A 5,000-tick script touching EVERY command type (place/remove/undo/blueprint/
  select-recipe/research select+queue+contribute/collect/repair/loot/offline/window/
  reveal/pause-resume) → replay twice ⇒ identical final hash; golden-hash it (second
  golden constant, same update protocol).
- [ ] Commit: `tests: full-command replay harness (golden)`.

## Task 8 — Docs & release

**Files:** Rewrite `README.md`; modify root + per-folder `CLAUDE.md`, `GDD.md` (status
section), `docs/superpowers/plans/PLAN-INDEX.md`; create `CHANGELOG.md`; bump
`package.json`.

- [ ] **README.md** (player-first): hero paragraph + screenshot + **Play now** link;
  feature list (5 biomes, 2 modes, Ark, offline, PWA install); quickstart (play + dev);
  architecture summary (3 layers + wire + determinism, ~15 lines); test/deploy guide;
  roadmap pointer (post-1.0 = ROADMAP Horizon 5); license; audio credits pointer;
  feedback link.
- [ ] `CHANGELOG.md` starts at `1.0.0` (one entry per phase, human-readable).
- [ ] CLAUDE.md sweep: root (world size, storage, menu boot, audio rule, updated file
  map, backlog emptied), sim/render/ui folder files (new seams from every phase — verify
  each still tells the truth; this is a read-and-fix pass, not a rewrite).
- [ ] `package.json` version `1.0.0`; final full gate (`npm test` + build + Lighthouse
  spot-check); merge; push; **tag `v1.0.0`**; live-verify; then play the LIVE build
  end-to-end once: menu → tutorial → first automation (~15 min).

**Acceptance (master plan DoD):** a stranger on a mid-range phone can install the PWA, be
taught the loop, automate four science tiers across five biomes, choose cozy or threatened
play, win via the Ark, and keep playing — at 60 fps, with sound, tooltips on everything,
no lost saves, and a README that does the game justice.
