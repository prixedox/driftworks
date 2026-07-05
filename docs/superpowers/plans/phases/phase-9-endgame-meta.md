# Phase 9 — Endgame & meta: Ark, victory, Infinite Mode, achievements, menu, slots, offline (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 9).
> Spec §3.8, §4, §9.6. Prestige (Task 8) is stretch — cut first.

**Goal:** the game becomes winnable and re-playable: the 4×4 Ark with four delivery
stages, launch + win screen, Infinite Mode with infinite research, ~20 sim-evaluated
achievements, a real main menu with 3 slots, and capped offline progress.

**Branch:** `phase-9-endgame-meta`.

## Pre-flight reality check

- [ ] Phases 4–8 merged: `frame`/`drift_fuel`/`refined_crystal`/`science4` all producible
  (`economy_graph` green, `FUTURE_ITEMS` empty); `offline` command exists (Phase 7) with
  raid suppression; storage.ts (Phase 3.7) has the 3-slot API but only slot 0 in use;
  modeselect overlay (Phase 7) exists — it is **absorbed into the menu** here.
- [ ] Multi-tile precedent: none — `ark_site` is the first (placement/occupancy below).
- [ ] Plan-#5 stats: rate ring exists; run-stat totals (`sciTotal`, `peakRate`) are new
  sim counters added here.

## Contract deltas (exact)

```ts
// types.ts
export type ModuleType = /* … */ | 'ark_site';
export interface ArkView { stage: 0 | 1 | 2 | 3 | 4; needs: { item: ItemType; have: number; need: number }[] }
// Snapshot gains:  ark: ArkView | null;
//                  stats: { ticks: number; sciTotal: number; peakRate: number; raidsSurvived: number };
//                  achievements: string[];               // earned ids, sorted
//                  won: boolean;
// Command gains:   | { type: 'prestige'; boon: BoonId }  // stretch (Task 8)
// SaveState gains: arkStage: number; arkHave: Record<ItemType, number>; stats: {...same};
//                  achievements: string[]; won: boolean;

// data_meta.ts (new, re-exported from data.ts)
export const ARK_FOOTPRINT = 4;                            // 4×4 tiles, anchor = top-left
export const ARK_STAGES = [                                // verbatim from master plan
  { name: 'Frame',    needs: [{ item: 'frame', n: 200 }, { item: 'steel', n: 100 }] },
  { name: 'Reactor',  needs: [{ item: 'drift_fuel', n: 150 }, { item: 'circuit', n: 200 }] },
  { name: 'Guidance', needs: [{ item: 'refined_crystal', n: 100 }, { item: 'adv_circuit', n: 150 }] },
  { name: 'Payload',  needs: [{ item: 'science4', n: 100 }, { item: 'plastic', n: 200 }] },
] as const;
export interface AchievementDef { id: string; name: string; desc: string;
  check: { kind: 'stat'; stat: 'sciTotal' | 'ticks' | 'raidsSurvived'; gte: number }
       | { kind: 'produce'; item: ItemType; gte: number }   // lifetime produced counters
       | { kind: 'event'; event: 'first_' | string };        // fired imperatively in world.ts
}
export const ACHIEVEMENTS: AchievementDef[]; // 20 rows — see Task 4 list
export type BoonId = 'head_start' | 'free_cartography' | 'belt_boost';
export const BOONS: Record<BoonId, { name: string; desc: string }>;
BUILD_COSTS: ark_site 50 steel + 25 circuit
MODULE_CATEGORY: ark_site → 'misc'
TECHS rows live now: ark_project · inf_mining · inf_belt · inf_turret
  (infinite rows: `repeatable: true`, `cost: 300 · 2^level` computed, hidden until won)
```

## Locked semantics

- **Multi-tile placement:** `place(c, 'ark_site', dir)` validates all 16 cells of the
  4×4 block anchored at `c` (in-bounds, empty, no water/lava/deposit/POI, discovered) AND
  that no other ark exists (`unique`). `modules` stores the anchor only; a new
  `occupancy: Map<number, number>` maps every covered cell → anchor (checked by `place`,
  `placementValid`, enemy targeting, `screenToCell` interactions — `describe`/inspect on
  any covered cell resolves to the anchor). `remove` on any covered cell removes the ark
  (confirm dialog in UI first; refund only if stage 0 with zero deliveries).
- **Delivery:** belts pointing into ANY edge cell of the block deliver like storage —
  accepted item kinds = the CURRENT stage's outstanding needs only (others are refused →
  belt backs up, honest backpressure). `arkHave` accumulates; stage completes when every
  need is met → `pushAlert('ark_stage', anchor)`, stage++, `arkHave` resets.
- **Victory:** stage reaches 4 → `won = true` (one-shot, persists). Sim keeps running
  (Infinite Mode is the same save). `stats` freeze a `wonAtTick` (include in win screen).
- **Run stats (sim counters):** `sciTotal` = lifetime science pack consumption by labs
  (all tiers); `peakRate` = max over time of the plan-#5 30-tick all-items produced total
  (updated each tick, integer); `raidsSurvived` = raids whose wave fully despawned with
  ≥ 1 player building still standing; `ticks` = pulse. Lifetime per-item `producedTotal:
  Map<ItemType, number>` backs the produce-achievements (and the win screen).
- **Achievements:** evaluated in `advance()` once per tick against the def table (cheap:
  only unearned ones); `event`-kind fired imperatively (first turret kill, first ruin
  loot, first underground, launch). Earned → `pushAlert`-style toast via a new
  `achievement` alert kind? **No** — keep AlertView union closed; achievements surface
  via their own snapshot field; main.ts toasts on delta. Persist in save AND mirror the
  earned set to localStorage `driftworks.achievements` (meta-persistent across saves —
  the milestones panel shows both).
- **Infinite research:** TECHS rows with `repeatable: true` never complete-out; each
  completion increments the upgrade level (Phase 4 leveled upgrades already support
  this); displayed cost = `300 * 2^level` (compute in sim `selectResearch`/UI from the
  upgrade level; cap level at 20 to avoid overflow). Hidden from the graph until `won`.
- **Menu:** boot → menu unless `?quick=1`. Continue (most recent slot by `savedAt`),
  three slot cards (`listSlots()` meta: mode badge, playtime `ticks→h:mm`, Ark stage,
  Delete-with-confirm), New Game (absorbs the Phase-7 modeselect UI + slot pick),
  Settings, How to Play (help panel), Credits. In-game: a Menu dock button returns
  (game pauses via the pause command).
- **Offline:** on load with a save: `elapsedMs = Date.now() − save.savedAtWall`
  (main-side wall stamp added to the stored envelope, not SaveState);
  `ticks = min(elapsedMs / pulseMs@1x, OFFLINE_CAP_TICKS)` where
  `OFFLINE_CAP_TICKS = 57600` (2 h at 125 ms) in data.ts; if > 400 ticks →
  `send({ type: 'offline', ticks })` then a summary toast (diff inventory+storage totals
  and research progress before/after; the worker already slices + suppresses raids).

---

## Task 1 — Ark sim: multi-tile + delivery + stages (TDD)

**Files:** Modify `src/sim/world.ts`, `src/sim/types.ts`; create `src/sim/data_meta.ts`,
`tests/ark.test.ts`.

- [ ] Failing tests: 4×4 placement validates all cells (each failure mode: occupied,
  water, undiscovered, second ark); occupancy resolves inspect/remove from any covered
  cell; belts deliver `frame` into an edge cell and `arkHave.frame` grows; off-stage
  items are refused (packet stays, belt backs up); stage 1 completes at exactly 200+100
  with the `ark_stage` alert; four stages → `won === true`, exactly once; save
  round-trips stage+have+won; determinism run with deliveries.
- [ ] Implement. Suites + re-baseline. Commit: `sim: Ark site — multi-tile, staged delivery, victory flag (+tests)`.

---

## Task 2 — Ark model + progress UI

**Files:** Modify `src/render/models.ts` (4 stage meshes on one 4×4 group — frame
skeleton → reactor core glow → guidance spire → full vessel), `src/render/renderer.ts`
(multi-tile: model anchored at anchor cell, sized 4×4; selection outline scales),
`src/main.ts` (describe → per-need progress bars + stage name), objective chip shows
"Ark: Frame 120/200 frame · 80/100 steel" when an ark exists.

- [ ] Visual check all four stage meshes (`?quick` + dev-console stage bump via a scripted
  save fixture — do NOT add a sim cheat command). Commit: `render/ui: Ark stages + progress`.

---

## Task 3 — Launch cinematic + win screen

**Files:** Create `src/ui/winscreen.ts`; modify `src/render/renderer.ts`
(`playLaunch(anchor, onDone)`: 6 s — vessel rises with exhaust particles + screen flash +
camera shake, skippable on tap), `src/main.ts` (on `won` flipping false→true in a
snapshot: pause input, `playLaunch`, then winscreen).

- [ ] winscreen.ts: run stats (time h:mm, sciTotal, peakRate/min, raidsSurvived — from
  `snapshot.stats`), buttons: **Continue in Infinite Mode** (dismiss; infinite TECHS now
  visible) · **New Game+** (→ menu New Game with prestige boon picker if Task 8 shipped,
  else plain New Game). Replayable from the milestones panel ("view victory").
- [ ] Visual check with a fixture save one delivery from winning. Commit:
  `ui: launch cinematic + win screen → Infinite Mode`.

---

## Task 4 — Achievements (TDD)

**Files:** Modify `src/sim/world.ts` (counters + evaluator + event hooks),
`src/sim/data_meta.ts` (the 20 rows); create `src/ui/milestones.ts`,
`tests/achievements.test.ts`.

- [ ] The 20 (ids stable forever): `first_miner, first_smelter, first_science,
  first_circuit, first_steel, plates_1k, science_500, circuits_1k, all_biomes
  (event: fog revealed in every biome), first_ruin, first_underground, belt_100
  (100 conveyors placed lifetime), first_turret_kill, raid_5, storm_survivor
  (craft during a storm), night_shift (craft 100 items between dusk+dawn), ark_frame,
  ark_reactor, ark_guidance, launch`.
- [ ] Failing tests: produce-counters accumulate lifetime (not window); `plates_1k` fires
  at exactly 1000; event hooks fire once; earned list sorted + persisted through save;
  determinism (achievements are sim state → hashed).
- [ ] milestones.ts: dock button (or menu entry) — grid of cards (earned bright/locked
  dim), progress fraction for stat/produce kinds; toast on earn (main.ts diffs
  `snapshot.achievements`). Commit: `sim/ui: 20 achievements (+tests, milestones panel)`.

---

## Task 5 — Infinite research

**Files:** Modify `src/sim/data.ts` (rows + `repeatable`/`hidden-until-won` flags),
`src/sim/world.ts` (selectResearch cost computation for repeatables,
completeResearch level++ without completed-set add), `src/ui/researchgraph.ts`
(∞ lv N badge, cost display, hidden until `snapshot.won`), `tests/research.test.ts`.

- [ ] Tests: inf_mining researchable twice with doubling cost; never enters `completed`;
  level reflected in upgrades record; hidden pre-won (data flag honored by the graph —
  UI test not needed, assert the flag exists). Commit: `sim/ui: infinite research (geometric cost, leveled)`.

---

## Task 6 — Main menu + save slots

**Files:** Create `src/ui/menu.ts`; modify `src/main.ts` (boot flow, Menu dock button,
pause-on-menu), `src/ui/modeselect.ts` (absorbed — its cards become the New Game step;
delete the standalone overlay), `src/storage.ts` (already 3-slot — wire slot choice
through main), `src/style.css`.

- [ ] Boot: `?quick=1` → old instant path (slot 0). Else DOM menu before renderer init
  (menu is pure DOM — three.js loads behind it; keep `renderer.init` lazy until
  Continue/New so the menu paints instantly — groundwork for Phase 11 code-split).
- [ ] Slot flows: Continue → latest; card tap → load that slot; New Game → mode cards
  (Wanderer "Start here" badge) + difficulty + seed + target slot (default first empty,
  confirm overwrite) → init. Delete with typed-out confirm ("delete"). Current session's
  slot is remembered for autosave.
- [ ] Playtest: three saves in three slots with different modes round-trip; menu on a
  phone viewport. Commit: `ui: main menu + 3 save slots (modeselect absorbed)`.

---

## Task 7 — Offline progress (TDD)

**Files:** Modify `src/main.ts`, `src/storage.ts` (envelope gains `savedAtWall`),
`src/sim/data.ts` (`OFFLINE_CAP_TICKS`); create `tests/offline.test.ts`.

- [ ] Tests (sim-level): `world.advance()` × N with raids suppressed ≡ the `offline`
  command path (hash equality — already partially covered in Phase 7; extend with cap
  semantics at the main.ts boundary via a pure helper `offlineTicks(elapsedMs, pulseMs)`
  exported from main… **extract it** to `src/offline.ts` so it's testable: cap, 400-tick
  floor, integer).
- [ ] Wire the boot flow + "While you were away" toast (items delta summed, research
  delta named). Manual test: save, shift `savedAtWall` back 3 h in devtools, reload →
  capped catch-up + toast. Commit: `feature: capped offline progress with summary`.

---

## Task 8 — (Stretch) Prestige / New Game+

**Files:** Modify `src/sim/world.ts` (`prestige` handling at init: apply boon),
`src/sim/worker.ts`, `src/ui/menu.ts` (boon picker on NG+ from the win screen),
`src/sim/data_meta.ts` (BOONS: head_start = +200 plate +100 gear start; free_cartography
= cartography pre-completed; belt_boost = belt_speed lv1 pre-granted).

- [ ] Implemented as `init` with an extra `boon` field (new-world determinism: boon is
  part of the command). Achievements meta-persist (localStorage mirror) so NG+ keeps
  them. Test: each boon's start state. Commit: `feature: prestige boons (NG+)`.
  **Skip cleanly if over budget.**

---

## Task 9 — Phase gate

- [ ] Full `npm test` + build. End-to-end fixture playthrough: load a late-game fixture
  save, deliver the last stage, watch launch → win screen → Infinite Mode with ∞ techs.
  Fresh-boot menu flow on phone viewport. Offline toast verified.
- [ ] Deploy; live-verify; PLAN-INDEX + CLAUDE.md updates (ark/occupancy/achievements
  seams; menu boot flow in root CLAUDE.md).

**Acceptance (master plan):** a played-through save reaches the Ark, feeds four stages,
launches, sees stats, continues into Infinite Mode with infinite research; menu manages
three slots cleanly; an hour away yields a capped, summarized offline gain; all new
suites green.
