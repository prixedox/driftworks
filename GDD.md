# DRIFTWORKS — Game Design Document

> Working title (placeholder). A free, web + mobile, 2.5D automation game.
> **Your factory isn't a place. It's a machine that walks.**

Last updated: 2026-06-22

---

## 1. One-line pitch

A top-down 2.5D automation game where you build your factory *upward and smarter* on a
bounded, **moving platform (the Crawler)** that travels across a hostile, procedurally
generated world — instead of sprawling a fixed base across an infinite map. Factorio ×
FTL × a wandering Howl's-Moving-Castle, built for short sessions and a phone screen.

## 2. Locked decisions (2026-06-22)

| Decision | Choice |
|---|---|
| Monetization | **Free base game + cosmetic store + paid expansion campaigns.** No energy timers, no pay-to-win, ever. |
| Combat | **Two modes:** *Drifter* (threat/defense layer on) and *Wanderer* (zen, no combat). |
| Depth | **Easy to start, deep ceiling.** Gentle onboarding, genuinely hard late-game optimization. |
| Multiplayer | **Solo-first.** Sim built deterministic from day one so async/co-op can be added later. |

## 3. Why it's different (market positioning, June 2026)

- The genre is hot but crowded (~2,500 sim games in dev). Being "Factorio but again" loses.
- The breakout pattern is **genre fusion** (Infinitory: roguelite + city + automation + tower
  defense; Mindustry: automation + TD, free, huge on mobile).
- Shapez 2 proved the pure-puzzle loop sells, but its recurring criticism is *"motivation
  doesn't last / too abstract"* — it lacks stakes and a world.
- **Mobile automation is genuinely underserved.** Factorio/Satisfactory are unplayable on a
  phone: dense UI, infinite panning, multi-hour sessions. This is the open lane.

**Our wedge:** a free, mobile + web, 2.5D automation game built for short sessions, *with
stakes*, that doesn't feel like Factorio crammed onto a phone.

## 4. Design pillars

1. **Bounded, alive, mobile.** The build space is small, deliberate, and physically moving
   through danger. Every tile matters.
2. **Legible at a glance.** A 6-inch screen must read clearly. Discrete packets, snap-together
   modules, no spaghetti.
3. **A reason to care.** You're going *somewhere*. The world escalates. The Crawler can die.
4. **Respect the player's time.** 5–15 minute sessions. Offline progression. No dark patterns.

---

## 5. Core mechanics (the "new")

### 5.1 The Crawler — the mobile bounded base

- You build on a **grid platform that physically travels** across the world; the world
  scrolls to you. No infinite sprawl, no endless panning — the build area fits a screen and
  expands by bolting on **decks/modules**, not by spreading out.
- Central tension: limited space + power split four ways —
  **Production · Defense · Propulsion · Life-support.**
  - Stop on a rich deposit to mine deep → you're exposed and not moving toward the goal.
  - Outrun a storm → you burn fuel you aren't refining and can't expand.
- This is a **resource-allocation drama** fixed-base builders don't have. It is the identity.

### 5.2 Packet logistics + "the Pulse" (signature visual)

- No continuous belts. Materials travel as **discrete glowing packets** along short links
  between module ports, advancing on a global **pulse (tick)**.
- Far more readable on mobile; the machine visibly *breathes*. This is the trailer shot.
- Optimization is about **throughput-per-pulse and timing**, not pixel-perfect belt weaving
  you can't do with a thumb. You tune the *rhythm* of the machine.

### 5.3 Modules over tiles

- Place and wire **machine-modules** (composable blocks with input/output ports), more like
  circuit/chip design than plumbing. Touch-friendly. Depth comes from internal module config
  and composition, not tile-by-tile routing.

---

## 6. Game structure

### 6.1 The journey

- **Expeditions across biomes:** e.g. Dust Flats → Frozen Ridge → Toxic Canopy → the Storm Wall.
- Each biome introduces **one new resource, one new threat type, one new module tier** — so
  every leg teaches one thing (supports "easy to start").
- **Legs = sessions.** Each leg of the journey is a self-contained 5–15 min chunk with a
  natural save/stop point.

### 6.2 Modes

- **Drifter (combat):** raider waves, storms, terrain hazards threaten the *moving* Crawler.
  Defense is about protecting a home in motion, not a fixed point — that's the novel twist.
- **Wanderer (zen):** no combat. Stakes come from terrain, resources, power, logistics only.

### 6.3 Difficulty: easy to start, deep ceiling

- **Front:** one Crawler, few modules, one resource at a time, auto-suggested layouts,
  forgiving failure (a lost leg ≠ a lost run).
- **Ceiling:** late-game pulse-timing optimization, module overclocking trade-offs, multi-stage
  refining chains, throughput puzzles, optional hard biomes. The skill expression is in the
  *rhythm and composition*, not in memorizing recipes.

### 6.4 Offline progression

- The Crawler keeps drifting + producing while you're away (near-mandatory for mobile
  retention). You return to **decisions and loot**, not a dead screen. Capped to stay fair.

### 6.5 Meta-progression (roguelite-light)

- Light persistent unlocks between expeditions (new starter modules, cosmetic unlocks, Crawler
  chassis). On-trend and good for short-session retention. Keep it *optional flavor*, not a
  grind wall.

---

## 7. Monetization (audience-safe)

- **Free, generous base game.** No energy, no timers, no pay-to-win — this audience
  review-bombs predatory F2P.
- **Cosmetic store:** Crawler paint/chassis, packet/Pulse visual effects, biome/factory themes.
- **Paid expansion campaigns:** new biome arcs / story expeditions as one-time purchases.
- Optional, *sparing* rewarded ads only for convenience (e.g. 2× offline progress) — never to
  gate the core loop. (Decision pending; default off.)

---

## 8. Technical architecture

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Required at this scale. |
| Rendering | **PixiJS v8** (WebGL/WebGPU) | Fast for thousands of animated packets/sprites in 2.5D; keep it a thin render layer. |
| Simulation | Custom **deterministic, integer/fixed-point, tick-based ECS in a Web Worker** | Off the render thread (smooth on phones); determinism = free replays, blueprint validation, future co-op. |
| Packaging | Web = installable **PWA**; mobile = **Capacitor** wrapping the same build for iOS/Android | One codebase → web + both stores; native IAP/push when needed. |
| Backend (later) | **Supabase** (auth, Postgres, cloud saves) first; **Colyseus** for real-time co-op later | Don't build MP infra until the solo loop is proven fun. |

**Lock in now (painful to retrofit):** deterministic integer sim + sim-in-worker separation.

### UX/UI
- Touch-first, also great with mouse. Big tap targets, radial/quick build menu, pinch-zoom
  within the bounded platform (cheap because the area is bounded). One-handed-playable goal.

### Art direction
- Clean, high-contrast, readable 2.5D top-down. The glowing **Pulse** packets are the visual
  signature — every screenshot should show the machine breathing.

---

## 9. MVP / prototype scope (the only thing that matters first)

A solo/small dev cannot out-content Factorio. Win with a **tight, novel loop**, not breadth.

**Prototype (4–8 weeks) answers one question: is "build + move" fun?**
- 1 Crawler chassis, ~6 modules (miner, smelter, assembler, power, propulsion, storage).
- Packet + Pulse logistics working and legible.
- 1 biome, no combat.
- Touch + mouse controls, runs in browser on a phone.

**Vertical slice (2–3 mo) = the trailer:**
- 2 biomes, threat layer (Drifter mode), offline progression, full Pulse art identity.

**Then:** free in-browser demo (best marketing for this genre) → Early Access → more biomes,
blueprint sharing → async/co-op.

## 10. Open questions / risks

- Art is the #1 hidden cost for a solo dev — who makes it? (Asset packs vs. custom vs. AI-assisted.)
- Is the moving-base camera readable enough during combat? (Prototype must validate.)
- Balancing offline progression so it helps without trivializing the active loop.
- Final title + visual identity (DRIFTWORKS is a placeholder).
