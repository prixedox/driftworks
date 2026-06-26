# DRIFTWORKS — Game Roadmap & Design Vision

> A long-range, opinionated plan for the whole game: UX, UI, research, biomes, endgame,
> social, platform, and the tech to support it. Decisions here are **made, not offered** —
> treat this as the default direction; deviate deliberately. This is a living document; each
> concrete feature still goes through the project's brainstorm → spec → plan → execute flow
> before it's built.

Last updated: 2026-06-25 · Live: https://prixedox.github.io/driftworks/

---

## 0. How to read this

The roadmap is organized two ways: **Section 5** sequences work into five Horizons (the order to
build in); **Section 6** is per-system deep-dives (the decided design of each area). Build top-down
through the Horizons, pulling the relevant deep-dive when you start a system. Nothing here is built
until it has its own spec + plan.

## 1. North star & pillars

**North star:** the best **free, mobile-first, browser** factory-automation game — the one people
recommend when someone asks "is there a Factorio for my phone?". Approachable in 5 minutes, deep
enough to lose a weekend.

Pillars (unchanged, reaffirmed):
1. **Walk it, don't pan it** — you're a character in a living 3D world; exploration is a verb.
2. **Legible at a glance** — readable on a 6" screen; discrete, glowing, snap-together systems.
3. **Respect the player's time** — short sessions, autosave/resume, offline progress, zero dark patterns.
4. **A world worth crossing** — biomes, resources, and goals that pull you onward.
5. **Easy front, deep ceiling** — gentle onboarding; late-game optimization that rewards mastery.

## 2. Where we are today (snapshot)

Built and live: walkable isometric-3D world (Three.js), deterministic tick sim in a Web Worker,
sub-tile belts with backpressure, power, an inspector, a themed HUD (icon hotbar, status bar,
toasts), build ghost/highlights, a **player inventory + build costs**, a **science chain**
(assembler → lab), a **6-node research tree** with building/upgrade unlocks, and a graphics pass
(detailed models, terrain/ore rocks, particles, bloom, fog). One world, two resources (ore, plate)
plus science, five+two machines (miner, belt, smelter, storage, generator, assembler, lab).

Known gaps to clear early: **save v3** (inventory/research/unlocks don't persist), tests not in CI,
bundle size, and no audio.

## 3. Design principles (decided)

- **Determinism is sacred.** The sim stays integer, command-driven, worker-isolated. Every new
  system is designed so two identical command streams produce identical state. This is the
  foundation for replays, robust saves, and co-op — never trade it away for convenience.
- **Single source of truth.** All tunables (costs, recipes, tech, biome tables, enemy stats) live in
  `src/sim/data.ts` (or sibling data modules), imported by sim + UI. No magic numbers in logic.
- **Snapshots in, commands out.** Render/UI never hold game state. New player actions are commands.
- **Mobile is the constraint, not an afterthought.** Every feature must work one-handed on a phone:
  touch-first controls, big targets, performance budget (see §7).
- **Free, fair monetization.** Cosmetics + optional paid expansion campaigns. Never energy timers,
  loot boxes, or pay-to-win. The automation audience punishes predatory F2P.
- **Content is data, not code.** Recipes/tech/biomes/enemies are declarative tables so the game can
  grow (and later be modded/expanded) without engine rewrites.

## 4. The shape of the full game

The intended player journey, early → mid → late:

1. **Land** in a starting biome with a seed of resources. Learn to mine, belt, smelt — guided by an
   onboarding that teaches one verb at a time.
2. **Automate** the basics; research the early tree to unlock the science chain and core machines.
3. **Expand** across the map; hit a wall on the local resource and **travel** to new biomes for new
   materials and recipes (and, in Drifter mode, new threats).
4. **Scale** into a real factory: multi-stage recipes, fluids, logistics (splitters, undergrounds,
   later trains), power tiers, and productivity research.
5. **Build the endgame megaproject** — the **Ark** (see §6.8): a vast multi-resource supply chain
   that, when completed, "launches" and **wins the run** — then unlocks **Infinite Mode** + prestige.
6. **Master** via infinite research, optimization challenges, achievements, and (later) co-op.

## 5. Roadmap by horizon

Each horizon is a coherent, shippable band of work. Ship and deploy continuously within a horizon.

### Horizon 1 — Foundation & Feel (make what exists solid & teachable)
- **Save v3**: persist inventory, research, unlocks, upgrades, player position, and full module
  state; versioned with migration from v2. (Top priority — current saves lose progress.)
- **Onboarding**: a first-run, step-by-step tutorial that teaches mine → belt → smelter → storage →
  collect → research, with contextual highlights and dismissible tips. Skippable; replayable.
- **Build UX**: drag-to-build for all line tools, hold-to-erase, **blueprint copy/paste** of a
  selection, **undo** (last N placements), build-direction preview on the ghost, rotate-with-camera.
- **Quality**: tests wired into CI (a `test` script + a CI job gating deploy), bundle code-splitting
  (lazy-load Three.js/postfx), a Settings panel (graphics quality toggle: bloom/shadows/particles
  off for low-end phones; audio volume later).
- **Performance pass**: frame budget on a mid phone; instancing/LOD for scenery; cap particles.

### Horizon 2 — Production Depth (the factory game)
- **More materials & recipes**: a second ore (copper) → copper plate; **circuits** (copper +
  plate); **gears**; multi-input **Assembler** recipes (the assembler becomes recipe-selectable).
- **Fluids**: water + oil; pumps, pipes, a refinery; oil → plastic → advanced circuits. Fluids are a
  parallel logistics network (pipe segments, throughput, no per-unit packets — a pressure model).
- **Logistics tier-up**: splitters & mergers, **underground belts**, belt tiers (fast/express via
  research), inserters/arms if needed for machine I/O clarity. Eventually **trains** for long-haul
  between biomes (rails, stations, scheduling) — a Horizon-3/4 stretch.
- **Power tiers**: steam (boiler + water + fuel) → solar (day/night) → accumulators; a real power
  network with brown-out priorities and a power graph in the UI.
- **Recipe-selectable machines**: machines pick a recipe from the data tables (UI in the inspector).

### Horizon 3 — World & Threat (a reason to cross the map)
- **Biomes** (see §6.5): 5 hand-flavored, procedurally generated biomes, each with a signature
  resource, terrain palette, hazard, and ambient life. Seamless large map split into chunks.
- **Exploration**: fog-of-war / undiscovered terrain; a **minimap**; points of interest (rich
  deposits, ruins with one-time tech/loot, derelict machines to salvage).
- **Threat layer (Drifter mode)**: hazards + hostile waves that scale with your pollution/footprint;
  **defenses** (walls, turrets fed by ammo from your factory, repair). **Wanderer mode** = the same
  world with threats off (pure cozy building). Mode chosen per save.
- **Traversal**: a buildable **vehicle** (a rover/"crawler" reborn as an optional fast-travel mount,
  not the whole base) to cross biomes quickly; later, trains.

### Horizon 4 — Endgame & Meta (a destination + reasons to replay)
- **The Ark** (victory): a multi-stage megastructure requiring the deepest supply chains across
  biomes (advanced circuits, rocket fuel analog, structural parts). Completing it triggers a
  cinematic "launch" and a **win screen** with run stats (time, science, peak throughput).
- **Infinite Mode**: post-victory, infinite research (productivity/speed with rising cost), endless
  optimization, and a "build a bigger Ark fleet" sink.
- **Prestige / New Game+**: optional reset that grants a small permanent bonus (a starter unlock or
  cosmetic), encouraging replay with a harder seed.
- **Achievements & milestones**: production milestones, speed/efficiency challenges, biome-clears;
  surfaced as toasts + a milestones panel; tied to cosmetic unlocks.
- **Scenario/objective layer**: optional guided objectives ("produce 100 circuits/min", "power the
  Ark on solar only") for players who want goals over sandbox.

### Horizon 5 — Social & Platform (reach & longevity)
- **Co-op multiplayer**: deterministic **lockstep** over an authoritative relay (Colyseus), enabled
  by the determinism we've protected — friends build one factory together. Start with 2–4 players,
  async-friendly (rejoin a persisted world).
- **Blueprint sharing**: export/import blueprint strings; a community gallery (later).
- **App stores**: Capacitor wrappers for iOS/Android; store listings; native niceties (push for
  "factory needs attention", haptics).
- **Monetization**: cosmetic store (machine skins, belt/packet effects, biome themes, character
  skins) + paid **expansion campaigns** (new biome arcs / scenarios). No pay-to-win, ever.
- **Audio**: ambient music per biome, machine SFX, UI feedback, a dynamic layer that swells with
  factory size. (Needs assets — free/CC0 packs or commissioned.)

## 6. System deep-dives (decided design)

### 6.1 UX & onboarding
- **Teach by doing**: gated first-run steps with a spotlight on the relevant tile/button; never a
  wall of text. Each step completes on the player performing the action.
- **Always-available help**: a "?" panel summarizing controls + current goals; the existing Explain
  captions stay as a toggle.
- **Goal surfacing**: a non-intrusive "current objective" chip (tutorial → research → Ark stages)
  so there's always a next step.
- **Forgiveness**: cheap/free erase refunds most build cost; undo for misclicks; can't soft-lock
  (always a path to more raw resources — enforce in design + a sim invariant test).
- **Session friendliness**: offline progress (the factory advances while away, capped & summarized
  on return with a "while you were gone" toast), instant resume, fast autosave.

### 6.2 UI
- **Build menu**: grow the hotbar into categories (Logistics / Production / Power / Military /
  Misc) once tools exceed ~9; a radial or grouped menu on touch.
- **Inspector v2**: recipe picker, I/O rates, a live mini production graph, and "what's blocking
  this?" diagnostics (no power / no input / output full).
- **Production statistics**: a stats panel — items/min produced & consumed, power over time, a
  research ETA. Critical for late-game optimization.
- **Minimap & map view**: a corner minimap; a full-screen map for planning/teleport markers.
- **Alerts**: structured notifications (low power, under attack, research done, storage full) with a
  jump-to-location action.
- **Research panel v2**: a real tree graph (nodes + dependency lines, pan/zoom) instead of a list;
  search/filter; queue multiple techs.
- **Accessibility**: scalable UI, colorblind-safe item colors (shape + color), reduce-motion toggle.

### 6.3 Production & logistics
- Generalize the existing `CONVERTERS` model into **recipe-driven machines** (inputs[], outputs[],
  time, power) sourced from data tables; the assembler selects a recipe.
- **Fluids** as a separate network (pipes/pumps, segment pressure) — not packetized — to keep belt
  rendering clean and the sim cheap.
- **Logistics clarity on mobile**: prefer fewer, higher-throughput tiers over dense spaghetti;
  undergrounds and splitters to manage crossings; belt tiers via research.

### 6.4 Research & tech
- Expand `TECHS` into a **tiered tree** (~30–50 nodes) across branches: Logistics, Production,
  Power, Military (Drifter), Exploration. Prereqs form a readable graph.
- **Science tiers**: more science-pack types (automation/logistic/military/chemical/utility),
  each a deeper supply chain; the Lab consumes the set required by the active tech.
- **Infinite research** in the endgame (productivity/speed/mining with exponentially rising cost).
- Keep the **manual-contribute fallback** only for the very first tier (bootstrap); everything else
  is Lab-automated to reward building a science factory.

### 6.5 Biomes & world generation
- **Chunked, large, procedurally generated** world (deterministic from a seed). Biomes as regions
  with a transition; each defined in a `BIOMES` data table.
- Five launch biomes (signature resource · hazard · vibe):
  1. **Dust Flats** — iron/ore · dust storms (visibility) · the calm starter.
  2. **Frozen Ridge** — copper · cold (machines need heating / slower) · stark blue.
  3. **Toxic Canopy** — oil/bio · spores & strongest wildlife (Drifter) · lush green.
  4. **Ember Wastes** — coal/sulfur · lava hazards & heat · volcanic orange.
  5. **Crystal Hollows** — rare crystals (advanced circuits) · darkness/limited power · neon caves.
- Each biome: distinct ground/scenery in `scenery.ts`, ambient particles, a resource only found
  there (forcing cross-biome logistics), and a hazard that shapes how you build.
- **Points of interest**: ruins (one-time tech), rich nodes, salvage. Hand-authored set-pieces
  sprinkled into the procedural map.

### 6.6 Power & resources
- Power evolves from the single generator into a **network** with tiers (burner → steam → solar +
  accumulators → advanced), priorities on brown-out, and a power statistics view.
- Resource depletion: deposits have finite richness (very large, but finite) so expansion matters;
  late-game "infinite but low-yield" nodes keep megabases fed.

### 6.7 Threat layer & modes
- **Wanderer** (cozy): no enemies; stakes are logistics, power, terrain hazards. Default for new
  players who pick "relaxed".
- **Drifter** (challenge): pollution/footprint attracts escalating waves; build **walls + turrets**
  (ammo produced by your factory), manage a defense supply chain, repair after attacks. Tunable
  difficulty (peaceful-until-provoked → relentless).
- Threats are biome-flavored (canopy wildlife, ember swarms). Designed so defense is *another
  factory problem*, not a twitch-combat minigame.

### 6.8 Endgame & victory
- **The Ark**: a multi-stage build (e.g., Frame → Reactor → Guidance → Payload), each stage needing
  large quantities of the deepest products from multiple biomes. A dedicated build site + progress UI.
- **Victory**: launch cinematic + run-stats screen; the save continues into **Infinite Mode**.
- **Beyond**: infinite research, "Ark fleet" repeatable goals, optional harder scenarios, leaderboards
  (fastest Ark, biggest throughput) once there's a backend.

### 6.9 Progression, economy, balance
- A tuning spreadsheet/data file drives costs, recipe times, research costs, biome yields, enemy
  scaling — all in data tables for fast iteration.
- Pacing target: ~30–60 min to first science automation; ~6–10 h to first Ark on a normal seed.
- Anti-soft-lock invariant: from any reachable state the player can always obtain raw resources to
  recover; enforce with a design rule + a sim test.

### 6.10 Multiplayer / co-op
- Deterministic lockstep: clients exchange commands; the worker sim advances identically; periodic
  state-hash checks detect desync. Authoritative relay persists the world. The whole architecture
  has been built toward this (integer sim, command protocol, player-as-client) — Horizon 5.

### 6.11 Monetization
- Free, complete base game. Revenue from **cosmetics** (skins, effects, themes) and **paid
  expansion campaigns** (new biome arcs / story scenarios). Optional, sparing rewarded ads only for
  convenience (e.g., 2× offline catch-up) — never gating the core loop. No timers, no pay-to-win.

### 6.12 Audio & art direction
- **Audio** (needs assets): per-biome ambient music, layered factory hum that grows with size,
  satisfying machine/belt/UI SFX, alert stingers. Settings to mix/mute.
- **Art**: deepen the current neon-industrial 3D look — biome-specific palettes, better machine
  silhouettes, day/night lighting, weather. Keep readability first.

### 6.13 Mobile & platforms
- PWA install polish (icons, splash, offline shell). Capacitor for iOS/Android. Controls tuned for
  touch (the joystick + tap/drag build). Graphics-quality auto-detect + manual toggle. Strict
  performance budget; test on real mid-range hardware.

## 7. Technical roadmap (scaling the engine)

- **Save v3 + migration framework** (versioned, forward-compatible). Foundation for everything.
- **Chunked world**: move from a fixed 40×26 grid to streamed chunks so the map can be large; sim
  processes active chunks; snapshots send only the visible region + aggregates.
- **Sim performance**: profile `advance()`; spatial partitioning for belts/machines; consider a
  fixed-point or typed-array hot path if module counts grow into the thousands.
- **Render scaling**: instancing + LOD for scenery and machines; frustum culling; cap draw calls;
  lazy-load postfx; quality tiers.
- **Bundle**: code-split Three.js & postfx; route-split the (future) menu vs game.
- **Data-driven content**: formalize recipe/tech/biome/enemy tables + a small validation pass.
- **Tooling**: tests in CI gating deploy; a deterministic replay harness (record commands → replay
  → assert identical hashes); lint/format in CI; error tracking + lightweight analytics (privacy-respecting).
- **Asset pipeline**: when audio/textures arrive, an import + budget step (sizes, atlasing).

## 8. Content pipeline & liveops

- Treat new biomes/recipes/tech as **content packs** (data + a little art) shippable without engine
  changes. Cadence: small content drops between horizons keep the game fresh.
- A changelog + in-game "what's new" once there's an audience. Community blueprint gallery later.

## 9. Risks & mitigations

- **Scope** — biggest risk for a solo dev. Mitigation: horizons are independently shippable; each
  feature is YAGNI-scoped via spec/plan; resist breadth before the core loop is fun.
- **Mobile performance** as content grows — mitigation: budgets, quality tiers, chunking, profiling
  from Horizon 1.
- **Determinism regressions** with new systems — mitigation: the replay/hash test harness; the rule
  that all sim state is integer + command-driven.
- **Art/audio cost** — mitigation: code-drawn + CC0 packs first; commission only where it moves the
  needle; a consistent style beats mismatched assets.
- **Balance/onboarding** — mitigation: data-driven tuning + playtests; the anti-soft-lock invariant.

## 10. Definition of done per horizon

- **H1:** a new player is taught the loop, never loses progress, and the game is smooth on a mid phone.
- **H2:** a satisfying multi-stage factory (circuits/fluids/logistics) is buildable and readable.
- **H3:** 5 biomes explorable with cross-biome logistics; Drifter/Wanderer both fun.
- **H4:** the Ark can be built and won; infinite mode + achievements give post-win reasons to play.
- **H5:** co-op works; the game is installable from app stores with cosmetics for sale.

## 11. Immediate next five

1. **Save v3** (persist inventory/research/unlocks/upgrades + migration). *(clears the known backlog)*
2. **Tests in CI** + a deterministic replay/hash harness *(protects determinism as systems grow)*.
3. **Onboarding tutorial** + a "current objective" chip.
4. **Build UX**: blueprint copy/paste + undo + erase refund.
5. **Second resource (copper) + circuits + recipe-selectable Assembler** — the first real step into
   Horizon 2 depth.
