# DRIFTWORKS — Game Design Document

> Working title (placeholder). A free, web + mobile, 2.5D factory-automation game.
> **An engineer on foot, automating a strange world — Factorio/Satisfactory in your pocket.**

Last updated: 2026-06-23 · Live build: https://prixedox.github.io/driftworks/

---

## 1. One-line pitch

A top-down **2.5D automation game** where you **walk a character around a large, explorable
world**, find resource deposits, and build belt-fed factories across the terrain — the
Factorio/Satisfactory loop, but **built free and touch-native for the phone**, with a signature
"Pulse" logistics look that stays readable on a small screen.

## 2. Design history (why this doc changed)

The first prototype tried a novel hook: a **bounded factory that rode a moving platform (the
"Crawler")** across an auto-scrolling world. Playtest feedback was decisive: *it felt abstract
and puzzle-like (closer to Shapez) and "didn't look like Factorio or Satisfactory at all."*

**We pivoted to the genre's real feel:** a walkable character, a free camera that follows you,
and a big open world you explore on foot. We kept the parts that were working — deterministic
packet/belt logistics on a global Pulse, the power economy, snap-together modules — and dropped
the Crawler, the Drive "gas pedal", engines, and the distance/journey ribbon. **Lesson: don't
out-clever the core fantasy. Differentiate through execution, not an exotic core loop.**

## 3. Positioning — how it's different (without fighting the fantasy)

Being "Factorio again" loses (the genre has ~2,500 sim games in development). But Factorio and
Satisfactory share a glaring gap, and that gap *is* the wedge:

1. **Free, web + mobile-first.** Factorio/Satisfactory are paid and effectively unplayable on a
   phone — dense UI, infinite panning, multi-hour sessions. People literally ask "any good
   automation game for Android?" and get thin answers. **This is the opening.** Touch-native
   controls, short sessions, runs in a browser, installs as an app.
2. **The "Pulse" logistics look.** Items travel as discrete glowing packets on a global beat
   rather than dense continuous belt-spaghetti — far more legible on a 6" screen, and a
   distinctive visual identity for trailers/screenshots.
3. **Two modes, one game.** *Drifter* (a light threat layer — the trending automation + survival
   fusion) and *Wanderer* (pure cozy building). Most builders force one or the other.
4. **Accessibility ramp.** Easy to start, deep ceiling — the on-ramp the genre is notoriously bad at.

We are **not** adding another exotic mechanic to "be different." Differentiation is: *free +
mobile-native + a clean signature aesthetic + mode flexibility + a gentle on-ramp.*

## 4. Design pillars

1. **Walk it, don't pan it.** You're a character in the world. Exploring on foot is the verb.
2. **Legible at a glance.** Discrete Pulse packets, snap-together modules, no spaghetti — readable on a phone.
3. **Respect the player's time.** 5–15 minute sessions, autosave/resume, no dark patterns.
4. **A world worth crossing.** Lots of places to go, varied biomes, resources that pull you onward.

## 5. Core loop

**Explore on foot → find a deposit → build a line → automate → expand outward → travel to the next region.**

- You **walk** the engineer (WASD / arrows on desktop, an on-screen thumbstick on touch).
- The **camera follows you**; the world scrolls around you. The map is large and explorable.
- **Resource deposits are scattered across the world.** You walk to a patch and place a **Miner on
  the ore**; off-ore miners do nothing — so the world layout drives where you build.
- **The factory runs autonomously while you walk away** (just like Factorio) — go scout, mine,
  smelt, and stockpile in the background.
- As you exhaust nearby resources or need new ones, you **travel to new regions** and expand.

## 6. Signature mechanics

- **Pulse packet logistics.** Materials are discrete glowing packets advancing on a global pulse
  along short belt links between modules. Optimization is about throughput-per-pulse and routing,
  and the machine visibly *breathes* on the beat. This is the look.
- **Modules over tile-spaghetti.** Place and orient machine-modules (Miner, Belt, Smelter, Storage,
  Generator → and later: assemblers, splitters, fluids). **Drag** the Belt tool to lay a connected,
  auto-oriented line in one gesture — the key touch affordance.
- **A shared power economy.** Generators produce; machines draw; an over-draw causes a deterministic
  brown-out. Power is a real constraint you plan around.

## 7. The world

- **Large, procedurally generated, varied.** "More places to move" is a pillar: a big map with
  distinct **biomes/regions**, each introducing new terrain, a new resource, and a new module tier.
- **Resource variety drives travel.** Early ore is everywhere; later recipes need resources found
  only in farther/harder regions, pulling you to explore and expand your rail/belt network outward.
- **Points of interest** (later): ruins, rich deposits, hazards — reasons to trek somewhere specific.

## 8. Modes

- **Drifter (threat layer):** hazards / hostile waves you defend against — the trending
  automation-plus-survival fusion. Tunable.
- **Wanderer (zen):** no combat; stakes are purely logistics, power, and terrain. Cozy.

## 9. Difficulty: easy to start, deep ceiling

- **Front:** few modules, forgiving, auto-oriented belts, plain-language "Explain" captions on every machine.
- **Ceiling:** multi-stage recipe chains, throughput/ratio optimization, power balancing, large
  networks, optional hard regions. Skill is in composition and flow, not memorizing UI.

## 10. Progression & content

- Tech/recipe unlocks gate new modules and resources, paced one new idea per region.
- Optional light meta-progression between sessions (cosmetic unlocks, starter kit choices).
- Blueprints (copy/paste/share factory chunks) once the core loop is proven.

## 11. Monetization (locked)

Automation players punish predatory F2P. So: **free, generous base game; cosmetic store (skins,
packet/Pulse effects, themes); paid expansion campaigns (new biome arcs).** No energy, no timers,
no pay-to-win — ever.

## 12. Multiplayer

**Solo-first.** The sim is deterministic (integer, tick-based, no wall-clock/RNG) specifically so
async play and, later, lockstep co-op can be added without a rewrite.

## 13. Technical architecture

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Required at this scale. |
| Rendering | **Three.js** — isometric orthographic camera with 90° snap-rotation, a follow-cam over a tiled 3D world | Real 2.5D/3D depth that stays readable; thin render layer over the sim (swappable — it was PixiJS before). |
| Simulation | **Deterministic, integer, tick-based sim in a Web Worker** | Off the render thread (smooth on phones); determinism = replays, blueprint validation, future co-op. |
| Player/camera | Client-side entity; camera centres on the player; world scrolls | The factory sim stays independent of the player (it runs while you walk away). |
| Packaging | **PWA** now; **Capacitor** for iOS/Android later | One codebase → web + both stores. |
| Persistence | **localStorage** autosave (throttled + save-on-hide), auto-resume | Phone sessions are short and interruptible. |
| Hosting | **GitHub Pages via Actions** (auto-deploy on push to `main`) | `vite base: './'` so it works under the `/driftworks/` subpath. |

## 14. Controls / UX (touch-first)

- **Move:** WASD / arrow keys, or the on-screen left thumbstick.
- **Build:** tap a tile to place the selected module; **drag** the Belt tool for a connected line.
- **Rotate** sets placement direction; **Erase** removes (drag to erase a run).
- **Pause / Speed / Explain / Reset**; live HUD (Pulse beat, power, item counts) + a color legend.

## 15. Current prototype status (built & live)

Live: **https://prixedox.github.io/driftworks/** · Source: **github.com/prixedox/driftworks**

Implemented and verified:
- Walkable player + follow-camera over a 40×26 tiled world.
- Deterministically generated ore deposits; miners only work on ore.
- Pulse packet logistics; Miner → Belt → Smelter (ore→plate) → Storage; Generator + power brown-out.
- Drag-to-build belts; tap-to-build; rotate; erase.
- Save/load (autosave + save-on-hide + auto-resume).
- Explanatory visuals: belt-flow chevrons, working-machine glows, the Pulse beat, item icons, captions.

Run locally: `npm install` → `npm run dev -- --host` (phone) · `npm run build` type-checks + bundles.

## 16. Roadmap

1. **World depth:** multiple biomes/regions + a second and third resource and recipe tier.
2. **Modes:** the Drifter threat layer and the Wanderer toggle.
3. **Factory depth:** splitters/mergers, assemblers (multi-input recipes), fluids.
4. **Quality:** blueprints, build reach/inventory, sound, real PNG app icons, precaching service worker.
5. **Reach:** Capacitor wrapper for the app stores; then async/co-op once the loop is proven.

## 17. Open questions / risks

- Art is the #1 hidden cost for a solo dev — asset packs vs. custom vs. AI-assisted.
- Readability of large factories on a phone as complexity grows (the Pulse look is the bet here).
- Tuning autonomous/offline progression so it helps without trivializing active play.
- Final title + visual identity (DRIFTWORKS is a placeholder).
