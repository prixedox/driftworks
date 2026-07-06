# DRIFTWORKS — Art Direction (one-pager, binding for all render work)

> Read before building ANY model, palette, particle, or UI visual (master-plan phases
> 3–10 add ~17 machines, enemies, a critter, and five biomes). The look is
> **neon-industrial legibility**: a dark, softly-fogged world where the FACTORY is the
> light source and the Pulse packets are the heroes. Existing reference:
> `src/render/style.ts` (tokens), `src/render/models.ts` (construction patterns).

## The one rule

**Readable at one glance on a 6" phone.** A tile is ~48 px on screen. If a machine's
role isn't identifiable at 48 px from its silhouette + one color, redo it. Beauty never
outranks legibility.

## Silhouette language (height + profile tell the role)

- **Logistics** (belts, splitters, undergrounds, pipes, skyways later): LOW, flat,
  directional. Nothing above 0.25 world-units except underground portals (0.45 ramps).
- **Production** (miner, smelter, assembler, refinery, chem plant): MID (0.6–0.8),
  boxy with ONE distinctive roof feature each (smelter chimney, assembler gantry,
  refinery tower, chem-plant vats, miner drill).
- **Power** (generator, boiler, engine, solar, accumulator): MID-TALL (0.8–1.0),
  round/cylindrical family features — power reads as "drums and stacks".
- **Military** (wall, turret): ANGULAR, the only sharp-diagonal family; walls low
  wedges, turret a distinct swivel-head profile.
- **Special** (lab, radar, heater, ark): each unique; the Ark is the tallest thing in
  the game and grows per stage — the skyline landmark.
- **Enemies**: organic vs. the factory's orthogonal grammar — wedge (mite), spindly
  (stalker), massive (behemoth). Never share the machine palette.

## Color & light

- **Palette source of truth:** `style.ts` PALETTE + `DEFS[type].color` (machine
  identity) + `ITEM_COLOR` (packets) + `BIOME_GROUND` tables (Phase 3). Never invent
  hex values in model/effect code — extend the tables.
- **Emissive = state, nothing else.** Busy pulses the machine's identity color (exists);
  blocked shows NO emissive (dark = dead is the read); powered-idle a faint 10%. Fluids
  tint pipes; accumulator charge glows. Decorative emissive is forbidden — it competes
  with the packets.
- **Packets out-glow everything.** No machine, particle, or scenery may exceed packet
  emissive intensity. This is the signature look; protect it.
- **Biomes recolor the WORLD, not the factory.** Machines keep their identity colors in
  every biome — ground/scenery/fog/ambient carry the biome mood (amber/blue-gray/
  green/red-black/violet per the data-bible tables).

## Budgets (per machine/entity)

- ≤ ~500 triangles, ≤ 3 materials (shared from `MaterialKit` wherever possible),
  ≤ 2 animated parts driven by the single `anim` hook, procedural canvas textures only
  (no image assets). Enemies ≤ 300 tris (they come in packs; they'll be instanced).
- Every model is buildable in `buildModuleModel`'s existing idiom: primitives +
  EdgesGeometry accents. If a model needs more, simplify the design, not the budget.

## Motion

- Machines "breathe" on the Pulse (existing emissive pulse) — keep all animation cadence
  tied to tick/beat timing, not free-running, so the world feels metronomic.
- One signature motion per machine max (drill spin, pumpjack nod, piston bob, radar
  sweep, turret track). Reduce-motion setting (Phase 11) freezes all of them.

## UI

- Theme tokens only (`theme.css`); icons are single-stroke `currentColor` SVGs with
  **distinct shapes per item** (a11y rule — color is never the only differentiator).
- Panels are dark glass (existing `dw-panel`); accent color is earned by interactivity —
  never decorative headers.

## When in doubt

Screenshot at 390×844, shrink to 50%, squint. If you can still tell what every machine
is and where the flow goes, it ships.
