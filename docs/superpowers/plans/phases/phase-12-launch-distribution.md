# Phase 12 — Launch & distribution (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 12).
> Spec §7, §9.7. **Hard rule: agents PREPARE, Martin PUBLISHES.** No agent creates
> accounts, submits to portals, posts to communities, or performs any outward-facing
> action. Every deliverable here is a file in the repo, ready to paste/upload.

**Goal:** press kit, in-game feedback loop, publish-ready itch.io page draft, Poki +
CrazyGames submission briefs, three community post drafts, and the post-launch triage doc.

**Branch:** `phase-12-launch` (docs + one small UI task; low risk).

## Pre-flight reality check

- [ ] `v1.0.0` is tagged and live; README rewritten (Phase 11).
- [ ] The live build loads clean in an iframe (portals embed): test
  `<iframe src="https://prixedox.github.io/driftworks/">` locally — if anything breaks
  (COOP/COEP, worker paths), fix before drafting portal briefs.
- [ ] Playwright available for the capture session.

## Task 1 — Capture kit (`docs/presskit/`)

- [ ] Scripted Playwright session against the LIVE build using fixture saves (import via
  the Phase-3.7 save-import string — prepare 3 fixtures: early base, dense mid-game
  factory at dusk, Ark launch moment):
  - 8 screenshots: each biome (5), dense base, research graph, Ark — desktop 1920×1080
    AND phone 390×844 for two of them.
  - 3 loops (record video via Playwright, convert to GIF/WebM ≤ 8 MB each with ffmpeg):
    Pulse packets flowing through a smelter line · drag-building a belt run · a raid
    defense with turret tracers.
- [ ] `docs/presskit/presskit.md`: one-paragraph pitch (from README hero), fact sheet
  (free, browser+PWA, mobile-first, 2 modes, deterministic sim, solo dev, engine:
  Three.js/TS), feature bullets, links (live, repo, feedback), license note, asset index.
- [ ] Commit: `docs: press kit (screens, loops, fact sheet)`.

## Task 2 — In-game feedback loop (the one code task)

**Files:** Modify `src/ui/menu.ts`, `src/ui/help.ts`, `README.md`.

- [ ] "Send feedback" in menu + help → opens
  `https://github.com/prixedox/driftworks/issues/new?template=feedback.yml` with a
  prefilled body (app version from `package.json` via a build-time define, seed, mode —
  values the PLAYER can see; nothing collected automatically).
- [ ] Create `.github/ISSUE_TEMPLATE/feedback.yml` (fields: what happened, expected,
  device, version/seed/mode prefill) and a `bug.yml` variant.
- [ ] **Analytics: none ships. Locked.** (Spec §7 — at most a page-view counter later,
  Martin's call, not in this phase.)
- [ ] Build + tests green (UI-only). Deploy. Commit: `feat: in-game feedback links + issue templates`.

## Task 3 — itch.io page draft (`docs/presskit/itch/`)

- [ ] `page.md`: title, tagline (≤ 80 chars), short description, long description
  (player-voiced, GIF-led), install/play instructions (play in browser; PWA install
  note), controls table.
- [ ] `tags.md`: primary tags (`automation`, `factory`, `base-building`, `idle`,
  `crafting`, `free`, `mobile`, `webgl`) + rationale and the iteration playbook per the
  itch discoverability findings (watch CTR per tag, rotate weakest weekly for the first
  month — spec §9.7 source).
- [ ] `embed.md`: recommended embed size (responsive, min 360×640; the game handles
  small viewports), fullscreen button ON, mobile flag ON.
- [ ] **Human steps documented at the top of page.md:** create the page (free, HTML/
  embed type pointing at the Pages URL or an uploaded build zip — recommend the zip for
  itch-native fullscreen), upload screenshots/GIFs from the press kit, publish, then
  tag-iterate.
- [ ] Commit: `docs: itch.io page draft + tag strategy`.

## Task 4 — Portal submission briefs (`docs/presskit/portals.md`)

- [ ] One page per portal (Poki, CrazyGames): what they need to evaluate — game
  summary, genre/audience, tech facts (HTML5, no plugins, ~sizes from Phase 11, touch
  + keyboard, offline-capable, no ads/IAP/tracking, works in iframe), session shape
  (5-min friendly, autosave), the live URL + press kit pointer. Note both evaluate
  BEFORE SDK integration; if accepted and an SDK is required, that lands as a post-1.0
  plan (SDK wrappers must never touch `src/sim/`).
- [ ] **Human steps:** developer-portal signup + submission (Poki for Web / CrazyGames
  developer portal), respond to review feedback.
- [ ] Commit: `docs: Poki + CrazyGames submission briefs`.

## Task 5 — Community post drafts (`docs/presskit/posts.md`)

- [ ] Three tailored drafts, dev-post conventions (honest, first-person, one GIF, live
  link, responds-to-comments promise):
  - r/BaseBuildingGames — builder angle ("free Factorio-like you can play on your phone,
    built solo, no ads/IAP").
  - r/incremental_games — offline progress + browser + free angle.
  - r/WebGames — tech angle (deterministic worker sim, PWA, Three.js).
- [ ] Each ≤ 200 words + title options (3 per sub). **Human steps:** post, engage, don't
  spam-crosspost same-day.
- [ ] Commit: `docs: community launch post drafts`.

## Task 6 — Post-launch triage + wrap

- [ ] `docs/POST-LAUNCH.md`: reading the feedback templates; severity ladder (save-loss
  = drop everything → crash → progression-blocker → balance → polish); cadence promise
  (patch pass in week 1; then post-1.0 roadmap = `docs/ROADMAP.md` Horizon 5 — co-op,
  stores, cosmetics); how to run a patch (branch → fix → full gate → deploy → changelog).
- [ ] Update `PLAN-INDEX.md`: master plan + all phases → **shipped**; CHANGELOG entry.
- [ ] Final commit: `docs: post-launch playbook; 1.0 plan closed`.

**Acceptance (master plan):** press kit + drafts exist in-repo, publish-ready; feedback
link works from the live build; every outward-facing step documented as human-executed;
no tracking shipped.
