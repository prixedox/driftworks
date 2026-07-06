# DRIFTWORKS 1.0 — Content & Balance Data Bible

> **The single canonical source for every tunable in 1.0.** Executors copy values from
> here into `src/sim/data*.ts` at the phase marked in each table's **Lands** column; the
> phase plans reference these tables rather than re-declaring them. If a playtest forces a
> retune, change `data*.ts` AND this file in the same commit. On any conflict between this
> file and a phase plan's prose, **this file wins** (it postdates them).
> Companion: `2026-07-05-driftworks-1.0-full-game-design.md` (why) ·
> `../plans/2026-07-05-driftworks-1.0-master-plan.md` (how).

Ticks: 1 tick = one `advance()`; reference speed 1× = 150 ms/tick (SPEEDS[1] in main.ts),
so 400 ticks ≈ 1 min at 1×. Power in abstract units. All sim values integer.

---

## 1. Items (21 solids + 3 fluids)

| id | label | tier | source | Lands |
|---|---|---|---|---|
| ore | Iron Ore | raw | mined: iron deposits (everywhere; dust rich) | live |
| copper_ore | Copper Ore | raw | mined: copper (ridge rich; 1 starter patch in dust) | live |
| coal | Coal | raw | mined: coal (ember rich; small dust patches) | P4 |
| sulfur | Sulfur | raw | mined: sulfur (ember only) | P4 |
| crystal | Drift Crystal | raw | mined: crystal (hollows only) | P4 |
| plate | Iron Plate | 1 | smelt_iron | live |
| copper_plate | Copper Plate | 1 | smelt_copper | live |
| gear | Gear | 1 | assemble_gear | P4 |
| wire | Copper Wire | 1 | assemble_wire | P4 |
| circuit | Circuit | 2 | assemble_circuit | live (recipe changes P4) |
| steel | Steel | 2 | smelt_steel | P4 |
| plastic | Plastic | 3 | make_plastic | P5 |
| adv_circuit | Advanced Circuit | 3 | assemble_adv_circuit | P5 |
| refined_crystal | Refined Crystal | 4 | refine_crystal | P5 |
| frame | Structural Frame | 3 | assemble_frame | P4 |
| drift_fuel | Drift Fuel | 4 | make_drift_fuel | P5 |
| ammo | Ammo | 2 | assemble_ammo | P4 (used P7) |
| science | Automation Science | S1 | assemble_science | live (recipe changes P4) |
| science2 | Logistics Science | S2 | assemble_science2 | P4 |
| science3 | Chemical Science | S3 | assemble_science3 | P4 (producible P5) |
| science4 | Utility Science | S4 | assemble_science4 | P4 (producible P5) |
| — water / crude / petroleum | fluids | — | pump / pumpjack / refine_petroleum | P5 |

`START_INVENTORY`: ore 40, everything else 0. `FUTURE_ITEMS` (integrity-net tolerance):
`['plastic','adv_circuit','refined_crystal','drift_fuel']` from P4, **emptied in P5**.

## 2. Recipes (17)

`t` = ticks/craft · `p` = power draw while crafting · bufCap 4 per input slot.

| id | machine | inputs | output | t | p | Lands |
|---|---|---|---|---|---|---|
| smelt_iron | smelter | 1 ore | 1 plate | 6 | 3 | live |
| smelt_copper | smelter | 1 copper_ore | 1 copper_plate | 6 | 3 | live |
| smelt_steel | smelter | 5 plate | 1 steel | 24 | 5 | P4 |
| assemble_gear | assembler | 2 plate | 1 gear | 6 | 3 | P4 |
| assemble_wire | assembler | 1 copper_plate | 2 wire | 4 | 2 | P4 |
| assemble_circuit | assembler | 1 plate + 2 wire | 1 circuit | 10 | 4 | P4 (changed) |
| assemble_science | assembler | 1 gear + 1 copper_plate | 1 science | 8 | 3 | P4 (changed) |
| assemble_science2 | assembler | 1 circuit + 1 gear | 1 science2 | 12 | 4 | P4 |
| assemble_science3 | assembler | 1 plastic + 1 steel | 1 science3 | 16 | 5 | P4 |
| assemble_science4 | assembler | 1 adv_circuit + 1 refined_crystal | 1 science4 | 20 | 6 | P4 |
| assemble_ammo | assembler | 1 plate + 1 copper_plate | 2 ammo | 8 | 3 | P4 |
| assemble_frame | assembler | 2 steel + 2 gear | 1 frame | 14 | 5 | P4 |
| refine_petroleum | refinery | fluid 2 crude | fluid 1 petroleum | 10 | 6 | P5 |
| make_plastic | chem_plant | 1 coal + fluid 1 petroleum | 1 plastic | 12 | 6 | P5 |
| assemble_adv_circuit | assembler | 1 circuit + 1 plastic + 2 wire | 1 adv_circuit | 16 | 5 | P5 |
| refine_crystal | chem_plant | 2 crystal + 1 sulfur | 1 refined_crystal | 16 | 6 | P5 |
| make_drift_fuel | chem_plant | 2 sulfur + fluid 1 petroleum | 1 drift_fuel | 20 | 7 | P5 |

Sanity ratios (for tooltip `ratioLine` and balance): 1 smelter feeds ~0.75 science
assemblers' plate needs pre-P4; post-P4: 1 gear assembler (2 plate/6t) consumes the output
of 2 iron smelters; 1 science2 assembler needs 1.2 circuit assemblers; steel is the
long-pole (24t) — expect banks of smelters.

## 3. Buildings (24) — build costs & power

| module | cost | power (draw/output) | priority | HP | Lands |
|---|---|---|---|---|---|
| miner | 5 ore | 2 draw | 1 | 100 | live |
| conveyor | 1 ore | — | 1* | 100 | live |
| smelter | 10 ore | recipe | 2 | 100 | live |
| storage | 5 ore | — | — | 100 | live |
| generator | 10 ore | +4 (lv +6/+8) | — | 100 | live (rebalanced P6) |
| assembler | 10 plate | recipe | 2 | 100 | live |
| lab | 15 plate | 2 draw (from P6) | 2 | 100 | live |
| splitter | 4 plate + 2 gear | — | 1* | 100 | P4 |
| underground (per end) | 4 plate + 4 gear | — | 1* | 100 | P4 |
| pipe | 1 plate | — | — | 100 | P5 |
| pump | 4 plate + 2 gear | 2 draw | 1 | 100 | P5 |
| pumpjack | 6 steel + 4 gear | 4 draw | 1 | 100 | P5 |
| refinery | 8 steel + 4 circuit | recipe | 2 | 100 | P5 |
| chem_plant | 8 steel + 4 circuit | recipe | 2 | 100 | P5 |
| boiler | 6 plate + 2 gear | fuel: 1 coal/40t + 5 water/t | — | 100 | P6 |
| steam_engine | 8 plate + 4 gear | +12 (needs fed boiler, ≤2/boiler) | — | 100 | P6 |
| solar | 4 plate + 2 circuit | +6 × solarFactor/100 | — | 100 | P6 |
| accumulator | 4 steel + 4 circuit | ±5/t, stores 500 | — | 100 | P6 |
| wall | 2 plate | — | — | **300** | P7 |
| turret | 5 plate + 2 gear + 2 circuit | 2 draw | **0** | **150** | P7 |
| radar | 4 plate + 2 circuit | 3 draw | 0 | 100 | P8 |
| heater | 4 plate + 2 gear | 2 draw | 0 | 100 | P8 |
| rover_bay | 20 steel + 10 circuit | — | — | 100 | P8 stretch |
| ark_site (4×4, unique) | 50 steel + 25 circuit | — | — | 400 | P9 |

\* belts/splitters/undergrounds draw no power in 1.0 (priority listed for future use).

> ⚠ **Type migration flag (P4):** `BUILD_COSTS` today is a single `{ item, amount }`.
> Multi-item costs (splitter onward) require `BuildCost` → `BuildCost[]`. This touches
> `place()`, erase refund, undo, blueprint paste affordability, `placementValid`, and the
> hotbar cost label (render as icon+n pairs). Do this migration as the FIRST step of
> Phase 4 Task 2 — the phase plan under-specified it; treat this note as part of that plan.

## 4. Tech tree (33 nodes + 3 infinite)

Cost = amount of the cost item consumed (lab-fed, or hand-contributed pre-lab).
Branch: prod / sci / logi / power / mil / expl / ark.

| id | branch | cost | prereqs | grants | Lands |
|---|---|---|---|---|---|
| smelting | prod | 20 ore | — | smelter | live |
| power | power | 30 ore | smelting | generator | live |
| automation | prod | 30 plate | power | assembler, lab, assemble_gear, assemble_wire | live (grants ext. P4) |
| copper_basics | prod | 40 plate | automation | smelt_copper, assemble_circuit | live |
| mining_prod | prod | 40 science | automation | miner_speed lv+ | live (leveled P4) |
| smelt_eff | prod | 50 science | automation | smelter_speed lv+ | live (leveled P4) |
| power_grid | power | 60 science | automation | gen_output lv+ | live (leveled P4) |
| ~~circuits~~ | — | — | — | **REMOVED in P4** (dead row today; completed-set entries tolerated on load) | P4 |
| steel_making | prod | 60 science | copper_basics | smelt_steel | P4 |
| sci2 | sci | 50 science | copper_basics | assemble_science2 | P4 |
| splitters | logi | 40 science | automation | splitter | P4 |
| undergrounds | logi | 50 science | splitters | underground | P4 |
| belt_speed_1 | logi | 60 science | undergrounds | belt_speed lv1 | P4 |
| belt_speed_2 | logi | 100 science2 | belt_speed_1 | belt_speed lv2 | P4 |
| belt_speed_3 | logi | 160 science3 | belt_speed_2 | belt_speed lv3 | P4 |
| storage_2 | logi | 80 science2 | sci2 | storage_cap lv1 | P4 |
| steam_power | power | 70 science | power | boiler, steam_engine | P6 |
| solar_power | power | 120 science2 | steam_power | solar | P6 |
| accumulators | power | 140 science2 | solar_power | accumulator | P6 |
| efficiency | power | 150 science3 | accumulators | power_eff lv1 | P6 |
| oil_processing | prod | 80 science2 | sci2 | pipe, pump, pumpjack, refinery, refine_petroleum | P5 |
| plastics | prod | 100 science2 | oil_processing | chem_plant, make_plastic | P5 |
| sci3 | sci | 80 science2 | plastics | assemble_science3 | P5 |
| adv_electronics | prod | 120 science3 | plastics, sci3 | assemble_adv_circuit | P5 |
| sci4 | sci | 100 science3 | adv_electronics | assemble_science4 | P5 |
| crystal_refining | prod | 120 science3 | adv_electronics | refine_crystal | P5 |
| fuel_tech | prod | 140 science4 | crystal_refining | make_drift_fuel | P5 |
| fortification | mil† | 50 science | automation | wall | P7 |
| turrets_tech | mil† | 80 science | fortification | turret, assemble_ammo | P7 |
| ammo_2 | mil† | 120 science2 | turrets_tech | ammo_dmg lv1 | P7 |
| turret_range | mil† | 150 science3 | ammo_2 | turret_range lv1 | P7 |
| cartography | expl | 40 science | automation | radar | P8 |
| heaters | expl | 60 science | cartography | heater | P8 |
| rover_tech | expl | 200 science3 | cartography | rover_bay | P8 stretch |
| ark_project | ark | 200 science4 | sci4, fuel_tech | ark_site | P9 |
| inf_mining / inf_belt / inf_turret | inf‡ | 300·2^lv science4 | ark_project | miner_speed / belt_speed / ammo_dmg lv+ | P9 |

† `military: true` flag — hidden in Wanderer. ‡ `repeatable: true`, hidden until `won`.

Pack-tier pacing intent: S1 carries ~10 techs, S2 ~7, S3 ~6, S4 ~3 + infinite — the P11
milestone-density check verifies no unlock gap exceeds 2× early cadence.

## 5. Upgrade rate tables (integer; index = level, 0 = base)

```
MINER_INTERVAL_BY_LEVEL   = [2, 1, 1]           SMELT_TIME_FACTOR_PCT = [100, 66, 50]
GEN_OUTPUT_BY_LEVEL       = [4, 6, 8]           ← P6 rebalance SUPERSEDES P4's [12,18,24]
BELT_STRIDE_BY_LEVEL      = [1, 2, 3, 4]        STORAGE_SOFT_CAP_BY_LEVEL = [500, 1500]
POWER_EFF_PCT_BY_LEVEL    = [100, 75]           AMMO_DMG_PCT_BY_LEVEL = [100, 150]
TURRET_RANGE_BY_LEVEL     = [5, 6]              (infinite levels extend the last delta:
                                                 miner interval floors at 1; belt stride +0
                                                 past lv3 → +10% packet cap instead; ammo +25%/lv)
```

## 6. World & biomes (P3)

`WORLD 256×256 · CHUNK 32 (8×8 chunks) · SPAWN (72,128) · DAY_TICKS 4800 (~12 min at 1×)`

| biome | region | deposits (blobs × r × richness) | hazard | Lands |
|---|---|---|---|---|
| dust | ellipse ~56×44 @ SPAWN | iron 14×(2-4)×400-900 · coal 3×(2-3)×250-500 · copper 1×2×250-400 | storm | P3 (acts P8) |
| ridge | north band y<64 | copper 12×(2-4)×500-1000 · iron 4×(2-3)×300-600 | cold | P3 / P8 |
| canopy | east x>168, y<168 | oil 8×(1-2)×800-1600 · iron 3×(2-3)×300-600 | spores | P3 / P8 |
| ember | south y>192 | coal 12×(2-4)×500-1000 · sulfur 8×(2-3)×400-800 + lava fields | lava | P3 / P8 |
| hollows | pocket x>208, 64≤y≤160 | crystal 10×(1-3)×300-700 | dark | P3 (solar-0 P6) |

Lakes: ~10 blobs r2–4 (never hollows) + guaranteed near spawn. Starter guarantees (seeds
tested 1–50, fallback-stamped if noise fails): iron+coal+copper ≤ 24 tiles, water ≤ 20,
ruin ≤ 40, spawn clear+dust. Depletion: −1 richness/item; at 0 → 10% trickle
(cooldown ×10). Hazard numbers: `STORM {periodDays 3, durationTicks 1200}` ·
`COLD_SLOW_PCT 50` · `HEATER {radius 4, power 2}` · `SPORE_DECAY_MULT 4` ·
`RADAR {radius 12, power 3}`.

POIs (P8): per-biome ruins/salvage = dust 2/3, ridge 2/3, canopy 2/3, ember 2/3,
hollows 1/2 (+6 nests, P7). Ruin → cheapest researchable tech free (else +50 science).
Salvage table: plate 20–60 · gear 5–20 · circuit 3–12 (hash-picked). Nest bounty
(cleared, Drifter): 50 ammo + 20 circuit.

## 7. Power constants (P6)

`GENERATOR_OUT 4 · STEAM_ENGINE_OUT 12 · SOLAR_OUT 6 · BOILER {coalTicks 40, waterPerTick 5, feeds 2}`
`ACCUMULATOR {cap 500, rate 5} · LAB_POWER 2 · SOLAR_CURVE: 24 ints — 0 at night (idx 20–3),
ramp 25/50/75 dawn (idx 4–6), 100 day (idx 7–16), 75/50/25 dusk (idx 17–19)`
Priority classes: 0 = turret/heater/radar · 1 = miner/belts/pumps/pumpjack ·
2 = smelter/assembler/lab/refinery/chem_plant. Shed: class 2 first, higher cell id first.

## 8. Fluids (P5)

`PIPE_CAP_PER_CELL 50 · PUMP_RATE 4 water/t · PUMPJACK_RATE 2 crude/t (1 at richness 0)`
Mixed-fluid merge: larger volume wins, loser discarded. Ports: producers face-out,
consumers back-in.

## 9. Threat (P7)

```
ENEMY_STATS  mite {hp 20, speed 6 t/tile, dmg 2} · stalker {60, 4, 5} · behemoth {300, 8, 20}
ATTACK_PERIOD 8 · TURRET {range 5, dmg 10, ticksPerShot 4, ammoPerShot 1, ammoCap 20}
RAID_TABLE  200→6 mite · 600→8 mite+3 stalker · 1500→10 mite+6 stalker ·
            3000→8 stalker+1 behemoth · 6000→10 stalker+3 behemoth
POLLUTION   miner 2 · smelter 4 · assembler 3 · lab 1 · refinery 6 · chem_plant 6 ·
            pumpjack 3 · boiler 5 · generator 1     (per completed cycle)
DECAY 1/chunk/100t (canopy ×4 slower) · RAID_INTERVAL 9000t · TELEGRAPH 1200t
DIFFICULTY_SCALE [50, 100, 200]% · REPAIR 20 hp/plate
```

Survivability invariant (P11 softlock test): each RAID_TABLE tier is beatable at Standard
by a wall line + 2 turrets + an ammo belt affordable at that tier's tech level.

## 10. Endgame & meta (P9)

Ark stages (delivered via belts into the 4×4 site): Frame 200 frame + 100 steel →
Reactor 150 drift_fuel + 200 circuit → Guidance 100 refined_crystal + 150 adv_circuit →
Payload 100 science4 + 200 plastic. Rough cost of a full Ark in raw terms ≈ 3.4k plate-eq
+ 1.1k copper-eq + oil/sulfur/crystal chains — sized for the 6–10 h pacing target.

Achievements (20 ids, stable): first_miner, first_smelter, first_science, first_circuit,
first_steel, plates_1k, science_500, circuits_1k, all_biomes, first_ruin,
first_underground, belt_100, first_turret_kill, raid_5, storm_survivor, night_shift,
ark_frame, ark_reactor, ark_guidance, launch.

Boons (NG+, stretch): head_start (+200 plate +100 gear) · free_cartography ·
belt_boost (belt_speed lv1).

## 11. System constants (misc)

```
RATE_WINDOW 30t · UNDO_LIMIT 32 · ERASE_REFUND 100% · RESEARCH_QUEUE_MAX 5
STORAGE_SOFT_CAP 500 (→1500 lv1) · LAB_CAP 6 · OFFLINE_CAP_TICKS 57600 (2 h @125 ms)
SPEEDS [300,150,80,40] ms · window 48×48 follow · reveal radius 6 (rover 6→12? no: rover
reveals 6 as specced; player base 6) · AUDIO budget ≤4 MB · JS initial ≤250 KB gz
```

## 12. Consistency notes found while consolidating (executor: heed these)

1. **`BuildCost` → `BuildCost[]` migration** (see §3 flag) — start Phase 4 Task 2 with it.
2. **`GEN_OUTPUT_BY_LEVEL`**: Phase 4 lands `[12,18,24]` (today's values); Phase 6
   deliberately rebalances to `[4,6,8]` when steam arrives. Both plans are right in
   sequence; this table records the final value.
3. **Tech `circuits` (existing dead row)** is removed in Phase 4; tolerate its id in
   loaded `research.completed` sets.
4. **`assemble_science` rework (P4)** raises the bootstrap bar: tier-1 techs cost ore/
   plate so the pre-copper game still flows; the tutorial teaches the gear+copper line
   right after `automation` — P11 FTUE stopwatch guards it.
5. **Ammo before turrets:** `assemble_ammo` data lands P4 but its unlock (`turrets_tech`)
   lands P7 — the recipe is data-present, unlock-gated, exactly like the sci3/4 pattern;
   `economy_graph` accepts it (recipe exists, gated).
6. **Worldgen versioning:** save v4 carries `genVersion` (starts at 1; P7 nests → 2,
   P8 POIs/lava → 3). Virgin cells always regenerate with the CURRENT generator; on a
   version mismatch at load, show a one-time toast ("Unexplored regions have shifted")
   — mined-cell diffs and placed modules are never touched. Phase 3 defines the field;
   P7/P8 bump it.

## 13a. Pacing model — computed, not felt (guides the Phase 11 balance pass)

Derived from §2 recipe times at 1× (150 ms/tick = 400 ticks/min), single dedicated
machines, inputs saturated, no upgrades:

| chain | rate/min | feeder note |
|---|---|---|
| iron/copper plate | 66.7 per smelter | 1 miner (≈133 ore/min) feeds 2 smelters |
| gear | 66.7 | needs 2 iron smelters |
| wire | 200 | needs 1.5 copper smelters |
| circuit | 40 | 40 plate + 80 wire/min |
| steel | 16.7 per smelter | the deliberate long-pole |
| science / science2 / science3 / science4 | 50 / 33 / 25 / 20 | per pack assembler |

**Tier production floors** (pack totals from §4, one pack assembler per tier, Drifter):
S1 ≈ 660 packs → **13 min** · S2 ≈ 820 → **25 min** · S3 ≈ 1000 → **40 min** ·
S4 ≈ 440 (incl. 100 Ark payload) → **22 min** · Ark item chains (frame/fuel/crystal/
adv-circuit/plastic, partly parallel) → **~35 min**. Floor total ≈ **2 h 15 m** + the
30–60 min manual bootstrap.

**Wall-clock = floor × 2.5–4** (building, logistics rework, power crises, travel,
defense; genre experience — a floor-only estimate always undershoots). Projection:
**≈ 5.5–10 h to launch** — squarely on the spec's 6–10 h target. **Conclusion: ship these
numbers into playtest unchanged.**

**If Phase 11 measurement misses the target, turn knobs in THIS order** (one at a time):
1. Pack recipe **times** (e.g. science2 12→16t) — slows the engine without grind;
2. Tech **costs** flat ×1.25 per affected tier — more packs, same engine;
3. **Ark quantities** — endgame length only;
4. Deposit **richness** — expansion cadence; touch last (interacts with trickle floor).
Never tune by adding hand-crafting steps or wait-timers (spec pillars forbid it).

## 13. Post-1.0 content (NOT in 1.0 scope)

The post-1.0 roadmap now has its own design spec:
**`2026-07-06-post-1.0-satisfactory-fusion.md`** — updates 1.1 "Charm & Flow" (Reclaimer
sink + Scrip shop, Skyway belts, Scrapling companion, VECTOR personality), 1.2 "Mastery"
(data-core alternate recipes, drift-shard overclocking), 1.3 "Motion" (transit tubes,
jump pads, photo mode), then 2.0 co-op per ROADMAP H5. Earlier parking-lot seeds (6th
biome, nuclear tier, S5 science, belt tier 4, seasonal modifiers) remain candidates for
1.2+/2.x content packs and are noted there. Nothing here lands before v1.0.0 ships.
