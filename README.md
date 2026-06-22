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

- It boots with a working chain: **Generator → Miner → belts → Smelter → belts → Storage**, plus an **Engine**.
- Watch ore (orange) flow, get smelted into plates (blue), and pile up in Storage.
- Pick a tool from the bottom bar, set direction with **Rotate**, and **tap a cell** to build.
  **Drag** with the Conveyor tool to lay a connected belt line; drag with Erase to wipe a row.
- **▶ Drive** is the gas pedal: the Crawler travels to the next **⛏ ore zone** (orange band on the
  journey ribbon). Driving spends power, so production slows while you move — that's the core trade-off.
- Miners only work while you're over an ore zone (they dim out otherwise).
- **Erase** removes a module. **Pause / Speed / Explain / Reset** control the view and sim.
- Progress **autosaves** to the browser and reloads automatically. **Reset** wipes the save.
- Try deleting the Generator → power goes red and machines brown out.

## Architecture

```
src/
  sim/            ← deterministic, integer-only simulation (no DOM, no time, no RNG)
    types.ts        shared contract between worker and main thread
    world.ts        the World: grid, modules, packets, the advance() pulse step
    worker.ts       runs the World on a fixed schedule, ships Snapshots out
  render/
    renderer.ts     PixiJS v8 layer; interpolates packets between pulses
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

- Deterministic packet/Pulse sim in a Web Worker; PixiJS render layer.
- Explanatory visuals: belt flow chevrons, working-machine glows, the Pulse beat, item icons, captions.
- **Crawler movement**: Drive gas pedal, Engine module, distance + journey ribbon, ore-field-gated mining,
  power split between propulsion and production.
- **Save/load**: throttled autosave to localStorage + save-on-hide + auto-resume.
- **Drag-to-build** connected belt lines (and drag-erase).

## Not yet here (next steps)

- Destinations / biome transitions and a reason to keep travelling (depots, story beats).
- The threat layer (Drifter mode) and the zen mode (Wanderer).
- Offline progression, blueprints, more module tiers, fluids.
- Proper PNG app icons (currently a single SVG) and a precaching service worker.
- Capacitor wrapper for the iOS/Android stores.
