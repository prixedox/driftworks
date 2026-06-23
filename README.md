# DRIFTWORKS — prototype

> Build a factory that walks. A 2.5D automation game for web + mobile.

This is the **prototype scaffold**. Its only job is to make the core idea
touchable: a bounded build grid, machine-modules, and **packets that flow on the
Pulse**. See [`GDD.md`](./GDD.md) for the full design.

## Run it

```bash
npm install
npm run dev          # open the printed URL (use --host already on for phone testing)
```

Build a production bundle (also type-checks):

```bash
npm run build
npm run preview      # serves the built app on your LAN for phone testing
```

To try it on your phone, run `npm run dev -- --host`, then open the
`http://192.168.x.x:5173` address it prints on a phone on the same Wi-Fi.

## How to play (prototype)

- It boots with a working chain: **Generator → Miner → belts → Smelter → belts → Storage**.
- Watch ore (orange) flow, get smelted into plates (blue), and pile up in Storage.
- **Walk** the character with **WASD / arrow keys** or the on-screen stick; the camera follows you.
  Movement and tap-to-build are relative to the current view.
- **Rotate the camera** 90° with **Q / E** or the **↻ View** button (isometric, snaps to 4 corners).
- Pick a tool, set placement direction with **Build →**, and **tap a tile** to build.
  **Drag** the Belt tool to lay a connected line; drag with **Erase** to wipe.
- Miners only work when placed **on ore** (the raised amber deposits). The factory keeps running while you walk away.
- **Pause / Speed / Explain / Reset** control the view and sim. Progress **autosaves**; **Reset** wipes the save.
- Try deleting the Generator → power goes red and machines brown out.

## Architecture

```
src/
  sim/            ← deterministic, integer-only simulation (no DOM, no time, no RNG)
    types.ts        shared contract between worker and main thread
    world.ts        the World: grid, modules, packets, the advance() pulse step
    worker.ts       runs the World on a fixed schedule, ships Snapshots out
  render/
    renderer.ts     Three.js layer; isometric 3D, follow-cam, 90° snap-rotation
  ui/
    hud.ts          DOM toolbar + stats (touch-friendly)
  main.ts           wires worker <-> renderer <-> HUD + input
```

**Two deliberate choices that are hard to retrofit later:**

1. **Deterministic sim** — integer-only, no wall-clock, no `Math.random`. Same
   commands + same number of `advance()` calls ⇒ identical state. This is what
   unlocks replays, blueprint validation, and future lockstep co-op.
2. **Sim in a Web Worker** — the simulation never blocks rendering/input, which
   keeps things smooth on phones.

The renderer is a pure view of `Snapshot`s; it owns no game state.

## Done so far

- Deterministic packet/Pulse sim in a Web Worker; **Three.js isometric-3D** render layer.
- **Walkable character** in a large tiled world, with a 90°-snap-rotation follow-camera.
- **3D world**: extruded machine blocks with shadows, a raised ore platform with crystals, items as blocks on belts.
- Ore-gated mining (miners only work on ore); the factory runs autonomously while you explore.
- **Save/load**: throttled autosave to localStorage + save-on-hide + auto-resume.
- **Drag-to-build** connected belt lines (and drag-erase), rotation-aware tap picking via raycast.
- **Continuous belts** (Factorio-style): items move sub-tile and pack densely against each other, with an animated tread surface.
- **Inspect tool** (🔍): tap a machine for a live popup of its contents/status (smelter buffers & progress, storage totals, miner status).

## Not yet here (next steps)

- Destinations / biome transitions and a reason to keep travelling (depots, story beats).
- The threat layer (Drifter mode) and the zen mode (Wanderer).
- Offline progression, blueprints, more module tiers, fluids.
- Proper PNG app icons (currently a single SVG) and a precaching service worker.
- Capacitor wrapper for the iOS/Android stores.
