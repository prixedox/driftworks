# DRIFTWORKS 1.0 — Full-Game Design Spec

> The definitive scope for shipping DRIFTWORKS as a **complete, winnable, deployable game**.
> Consolidates `docs/ROADMAP.md` (Horizons 1–4) and `GDD.md` into one buildable target.
> Decisions here are **made, not offered**. Companion implementation plan:
> `docs/superpowers/plans/2026-07-05-driftworks-1.0-master-plan.md`.

Date: 2026-07-05 · Live: https://prixedox.github.io/driftworks/

---

## 1. What 1.0 is (and is not)

**1.0 = the complete single-player game**: a new player lands on a main menu, picks a mode,
is taught the loop, automates through four science tiers across five biomes, defends (or
doesn't) against a threat layer, builds the Ark, wins, and keeps playing in Infinite Mode —
with tooltips everywhere, stats, minimap, settings, audio, offline progress, and saves that
never lose data. Deployable as a static PWA on GitHub Pages. No backend.

**In scope (1.0):** Horizons 1–4 of the ROADMAP, plus audio, PWA polish, accessibility,
performance budget, and a full docs pass (README, CLAUDE.md updates).

**Out of scope (post-1.0, unchanged from ROADMAP Horizon 5):** co-op multiplayer, Capacitor
app-store builds, monetization/cosmetic store, community blueprint gallery, leaderboards,
rewarded ads. Nothing in 1.0 may *block* these (determinism stays sacred).

**Differentiation (locked, from GDD §3):** free + web + mobile-first · the Pulse packet look ·
two modes in one game (Wanderer cozy / Drifter threat) · gentle onboarding with a deep ceiling.
We do not add exotic core mechanics; we out-execute on approachability.

## 2. Player journey (the spine everything hangs on)

1. **Menu** → New Game (choose **Wanderer** or **Drifter**, optional seed) or Continue (3 slots).
2. **Land** in Dust Flats with a starter kit. The tutorial teaches one verb at a time:
   walk → mine → place miner → belt → smelter → storage → collect → research.
3. **Automate** tier-1 science; unlock assembler/lab; build the first self-running science line.
4. **Expand**: power gets real (coal/steam), logistics grow (splitters, undergrounds, belt-speed
   research). The local map runs thin on variety → the map view shows other biomes.
5. **Travel**: copper in Frozen Ridge, oil in Toxic Canopy, coal/sulfur in Ember Wastes,
   crystal in Crystal Hollows. Each biome = one new resource + one hazard + new recipes.
   Cross-biome belt lines (and the rover, if built) tie the world together.
6. **Scale**: fluids, plastics, advanced circuits, solar + accumulators, four science packs,
   ~35-node tech tree. In Drifter mode, pollution draws escalating swarm attacks → walls,
   turrets, ammo lines — defense as a factory problem.
7. **Endgame**: research the **Ark Project**; build the 4×4 Ark site; feed four stages
   (Frame → Reactor → Guidance → Payload) from the deepest chains across all biomes.
8. **Victory**: launch cinematic + run-stats win screen → save continues into **Infinite Mode**
   (infinite research, achievements, optional Prestige/New Game+).

Pacing targets: first automated science ≈ 30–60 min; first Ark launch ≈ 6–10 h.
Anti-soft-lock invariant: from any reachable state the player can always obtain raw resources
(hand-mining is always available; erase refunds most cost) — enforced by a sim test.

## 3. Content — the complete data set

All of this lives in `src/sim/data.ts` (or sibling data modules) as declarative tables — the
single source of truth imported by sim + UI. No tunables in logic code.

### 3.1 Items (solids, travel as Pulse packets)

| id | label | tier | made by |
|---|---|---|---|
| `ore` | Iron Ore | raw | mined (Dust Flats + everywhere, common) |
| `copper_ore` | Copper Ore | raw | mined (Frozen Ridge; traces elsewhere) |
| `coal` | Coal | raw | mined (Ember Wastes rich; small starter patches in Dust Flats) |
| `sulfur` | Sulfur | raw | mined (Ember Wastes only) |
| `crystal` | Drift Crystal | raw | mined (Crystal Hollows only) |
| `plate` | Iron Plate | 1 | smelter: 1 ore |
| `copper_plate` | Copper Plate | 1 | smelter: 1 copper_ore |
| `gear` | Gear | 1 | assembler: 2 plate |
| `wire` | Copper Wire | 1 | assembler: 1 copper_plate → 2 wire |
| `circuit` | Circuit | 2 | assembler: 1 plate + 2 wire |
| `steel` | Steel | 2 | smelter: 5 plate (slow) |
| `plastic` | Plastic | 3 | chem plant: petroleum + coal |
| `adv_circuit` | Advanced Circuit | 3 | assembler: 1 circuit + 1 plastic + 2 wire |
| `refined_crystal` | Refined Crystal | 4 | chem plant: 2 crystal + 1 sulfur |
| `frame` | Structural Frame | 3 | assembler: 2 steel + 2 gear |
| `drift_fuel` | Drift Fuel | 4 | chem plant: petroleum + 2 sulfur |
| `ammo` | Ammo | 2 | assembler: 1 plate + 1 copper_plate (Drifter) |
| `science` | Automation Science | S1 | assembler: 1 gear + 1 copper_plate |
| `science2` | Logistics Science | S2 | assembler: 1 circuit + 1 gear |
| `science3` | Chemical Science | S3 | assembler: 1 plastic + 1 steel |
| `science4` | Utility Science | S4 | assembler: 1 adv_circuit + 1 refined_crystal |

(Existing `science` recipe is rebalanced from `1 plate` to `1 gear + 1 copper_plate`; the
tutorial-era bootstrap stays possible because tier-1 techs cost ore/plate, not packs.)

### 3.2 Fluids (separate pipe network — never packets)

`water` (pump on shore tiles), `crude` (pumpjack on oil deposits), `petroleum` (refinery:
crude → petroleum). Pressure model per connected pipe segment: each segment is one pooled
integer volume with capacity = tiles × C; producers push, consumers pull, no per-unit packets.
Steam is implicit inside the boiler→engine pairing (not a fluid in the network).

### 3.3 Buildings (~24 placeable)

Existing 7: miner, conveyor, smelter, storage, generator, assembler, lab.
New: **splitter** (1→2 alternating), **underground belt** (pair, ≤4 tile gap), **pipe**,
**pump** (shore), **pumpjack** (oil deposit), **refinery**, **chem plant**, **boiler**,
**steam engine**, **solar panel**, **accumulator**, **heater** (Frozen Ridge aura, see §5),
**wall**, **turret**, **radar** (reveals map region), **ark site** (4×4 multi-tile, unique),
**rover bay** (stretch — builds the rover mount).

**Belt tiers are research upgrades, not new modules** (global belt-speed levels). Fewer
modules, less spaghetti, more legible on a phone — a deliberate divergence from Factorio.

### 3.4 Research (~35 nodes, 5 branches + infinite)

Branches: **Production** (smelting → steel → oil processing → advanced materials),
**Logistics** (splitters → undergrounds → belt speed I-III → storage II), **Power**
(power → steam → solar → accumulators → efficiency), **Military** (Drifter-only visible:
walls → turrets → ammo II → turret range), **Exploration** (radar → map beacons → heater →
rover), capstone **Ark Project** (requires S4). Tier gating by science pack: S1 unlocks the
early third, S2 the middle, S3 chemistry/military depth, S4 endgame. Manual-contribute stays
for the pre-lab bootstrap only. **Infinite research** (post-Ark): mining productivity,
belt speed+, turret damage — repeatable, geometric cost growth.

The research UI becomes a real **tree graph** (nodes + dependency lines, pan/zoom, search,
queue up to 5).

### 3.5 World & biomes

- **Chunked world, 256×256 tiles** (32×32-tile chunks), deterministically generated from a
  **seed** (integer hash noise — no `Math.random`). Replaces the fixed 40×26 grid.
- **Five biomes**, regional layout with the starter in the center-west; transitions blend over
  ~4 tiles. Per-biome data table: terrain palette, scenery set, ambient particles, signature
  deposit table, hazard.
  1. **Dust Flats** — iron + starter coal + one small copper patch (so tier-1 science
     automates without leaving home; rich copper still pulls you to Frozen Ridge) · hazard:
     periodic dust storms (visibility fog ↑, solar output ↓) · calm amber starter.
  2. **Frozen Ridge** — copper · hazard: cold — machines run at 50% unless in a **heater**
     aura · stark blue.
  3. **Toxic Canopy** — oil · hazard: spore clouds (Drifter wildlife strongest here) · lush green.
  4. **Ember Wastes** — coal + sulfur · hazard: lava tiles (unbuildable, damage on walk-over
     knockback — player is never killed) · volcanic orange.
  5. **Crystal Hollows** — crystal · hazard: darkness (local light radius only; solar useless)
     · neon caves.
- **Deposit richness is finite but large** (each deposit cell carries an integer richness;
  mining depletes; depleted cells regenerate a trickle at 10% yield so megabases never fully
  starve and the anti-soft-lock invariant holds).
- **Fog of war**: per-tile discovered bitset; revealed by player proximity and radar buildings.
  Undiscovered = dark on map/minimap, hidden scenery in-world.
- **Points of interest** sprinkled by the generator: ruins (one-time free tech), salvage
  caches (free items), rich nodes. Hand-authored templates, procedurally placed.
- **Day/night cycle**: deterministic from tick count (~10 min real-time per cycle at 1×);
  drives solar output and world lighting; Crystal Hollows is always dark.

### 3.6 Power network

One shared network (as today) with tiers: **generator** (fuel-free, low output — the starter
turbine) → **boiler + steam engine** (coal + piped water, strong) → **solar panel** (daylight
only) + **accumulator** (charges on surplus, discharges on deficit). Brown-out gets
**priority classes**: turrets/heaters first, belts/miners middle, labs last. Power history
feeds the stats panel graph.

### 3.7 Threat layer — modes

- **Wanderer**: threats off. Hazards remain (they're terrain, not enemies).
- **Drifter**: machines emit **pollution** (per-chunk integer accumulator, decays slowly).
  Pollution + elapsed tech tiers scale **swarm raids**: biome-flavored drone packs that spawn
  at map edges / nests, path deterministically to the highest-pollution chunk, and attack
  buildings (buildings gain HP). Defense: **walls** (cheap HP), **turrets** (consume ammo
  from belts/storage), player **repair** (hold-to-repair costs plates). Raids are announced
  (alert + countdown). The player character is never damaged — defense is a factory problem,
  not twitch combat. Difficulty is a per-save slider (Calm / Standard / Relentless).
- Mode is chosen at New Game and stored in the save. Military branch + ammo/walls/turrets are
  hidden in Wanderer.

### 3.8 Endgame

- **Ark site**: 4×4 unique building unlocked by the Ark Project tech. Four sequential stages,
  each a large delivery order consumed via belts into the site:
  Frame (`frame` ×200, `steel` ×100) → Reactor (`drift_fuel` ×150, `circuit` ×200) →
  Guidance (`refined_crystal` ×100, `adv_circuit` ×150) → Payload (`science4` ×100,
  `plastic` ×200). Stage progress UI on the site + objective chip.
- **Victory**: launch cinematic (renderer sequence) → win screen with run stats (time,
  science produced, peak items/min, raids survived) → **Infinite Mode** in the same save.
- **Achievements** (~20, localStorage, surfaced as toasts + a milestones panel): first of
  each machine, production milestones, biome discoveries, raid survivals, Ark stages, speed
  goals.
- **Prestige / New Game+** (stretch, ship if time allows): reset with a chosen starter boon.

## 4. UX & UI — complete surface

- **Tooltips everywhere** (explicit 1.0 requirement): one unified tooltip system — hover
  (desktop) / long-press (touch) on any hotbar tile, item icon, tech node, stat, or placed
  machine → name, description, cost/recipe, current rates, and "what's blocking this"
  (no power / no input / output full / no recipe). Replaces ad-hoc labels; the dead `EXPLAIN`
  map is folded in as the tooltip's plain-language line and removed as a separate mode.
- **Onboarding**: first-run, step-gated tutorial (existing plan #7) extended to cover power,
  research, map, and mode basics; skippable, replayable from Help. **Objective chip** shows
  the current goal (tutorial step → suggested tech → Ark stage).
- **Build menu**: hotbar grows into **categories** (Logistics / Production / Power / Military /
  Misc) with a grouped touch menu once tools exceed 9.
- **Inspector v2**: recipe picker, live I/O rates, buffer contents, "blocked because…"
  diagnostics, and a jump-to-recipe-in-tree link.
- **Stats panel**: items/min produced/consumed (per item, 1/5/15 min windows), power
  produced/used graph, research ETA. (Existing plan #5.)
- **Minimap + map view**: corner minimap (fog-aware, biome colors, alerts); full-screen map
  with pan/zoom, POI + deposit markers, tap-to-place a **beacon marker**. (Plan #5 upgraded
  to the chunked world.)
- **Alerts**: structured (low power, raid incoming, storage full, research done, Ark stage
  complete) with jump-to-location.
- **Settings** (existing plan #6 + audio): graphics quality tiers, audio sliders
  (master/music/SFX), UI scale, colorblind-safe mode (shapes + colors on items), reduce
  motion, control hints.
- **Main menu scene**: New Game (mode, difficulty, seed), Continue, 3 save slots, Settings,
  How to Play, credits. First deploy keeps instant-resume: returning players land in-game.
- **Offline progress**: on resume, the main thread issues a `{type:'offline', ticks:N}`
  command (N capped at 2 h of 1× ticks); the worker advances that many ticks with raid
  spawning suppressed — suppression is part of the command's semantics, so replays stay
  deterministic. Then a "While you were away" summary toast (items produced, research
  progress).
- **Forgiveness**: erase refunds 100% (already free-ish economy), undo last N placements
  (plan #4), blueprints copy/paste (plan #4).

## 5. Audio (1.0 minimum)

A small `AudioManager` on the main thread (never the sim): WebAudio, lazy-init on first
gesture. Content: UI click/place/erase SFX, machine ambience (pooled, distance-attenuated,
capped voices), Pulse-beat tick layer that swells with factory size, alert stingers, one
ambient music bed per biome (CC0/commissioned, streamed, crossfade on biome change), launch
fanfare. All volumes in Settings; muted when tab hidden. Assets budgeted < 4 MB total.

## 6. Technical scope

- **Save v4**: seed, mode, difficulty, discovered fog, deposits/richness, machine HP,
  pollution, enemies, Ark progress, achievements, stats ring buffers, day phase, tutorial
  state, 3 slots + migration from v3 (v3 saves land in slot 1, Wanderer, legacy fixed-map
  converted or offered a fresh start — decision: **fresh world, inventory/research carried
  over**, clearly messaged once).
- **Snapshot windowing**: with a 256×256 world the snapshot sends (a) the visible window of
  modules/packets/terrain around the player, (b) global aggregates (inventory, power, research,
  alerts, stats), (c) a low-res minimap layer (per-chunk summaries). Commands unchanged.
- **Performance budget**: 60 fps on a mid-range phone with a 1k-module base; ≤ 250 KB gz
  initial JS (three.js code-split, postfx lazy), ≤ 4 MB audio, cold load < 3 s on 4G.
  Instancing for machines + scenery, LOD, frustum culling on chunks.
- **Determinism unchanged and enforced**: integer sim, seeded hash-noise worldgen, order-stable
  iteration (including enemies), golden-hash test re-baselined per sim change, replay harness
  extended to cover new commands.
- **PWA polish**: real PNG icons + maskable, splash, precaching service worker, offline shell,
  update toast ("new version — reload").
- **Docs**: README rewritten (player quickstart + dev guide + architecture), CLAUDE.md files
  updated per phase, CHANGELOG.md started at 1.0.

## 7. Explicit cuts & guardrails

- No trains in 1.0 (ROADMAP lists them as H3/4 stretch; the rover + belt tiers cover long-haul).
  No inserters (machines keep auto-I/O — mobile legibility). No enemy nests expansion sim
  (raids spawn from map-edge nests that are static POIs). No mod support. No backend anything.
- Every phase ships independently behind the existing deploy gate (`ci` job green).
- Scope risk is the #1 risk: each phase in the master plan is a shippable game improvement;
  if 1.0 must ship early, cut from the back (Prestige → rover → weather polish → audio depth).
