# DRIFTWORKS — Economy & Research Design Spec

Date: 2026-06-25
Status: Approved design (pre-plan)
Scope: New gameplay — a player inventory, build costs, a science chain, and a
research tech tree with building/upgrade unlocks. This feature **changes the
simulation** (`src/sim/*`), unlike the UI pass. Determinism is preserved:
all state is integer and every player action is an ordered command; the player's
continuous position stays client-side (collection is a command, not sim state).

## 1. Goal

Give the factory a purpose loop: spend resources to build, gather output, and
research a small tech tree that unlocks buildings and upgrades. Turn plates from
a dead-end into the input of a science chain (ore → plate → science → research).

## 2. Resolved design decisions (from brainstorming)

- **Build costs** are paid from a **separate player inventory** (not the shared storage pool).
- **Research** uses a **science item** consumed by a **Lab** over time; science is
  crafted by an **Assembler** (plate → science).
- **Tree:** ~6 nodes, unlocking **buildings + upgrades**.
- **Bootstrap (ore-fueled first tier):** Smelter, Generator, Assembler, Lab all
  start **locked**. The first techs are paid **manually with ore** from inventory
  (no Lab needed) and unlock the Smelter, then Power, then the science chain;
  later techs are **science, automated by the Lab**.

## 3. Systems

### 3.1 Player inventory
- `inventory: Record<ItemType, number>` in the World, **seeded with 30 ore** on new game.
- **Collect:** when the player stands adjacent to a Storage box, the shared storage
  pool is transferred into the inventory. The main thread detects proximity
  (player position from the renderer + storage cells from the snapshot) and sends a
  throttled `collect` command; the World moves `storage → inventory` and zeroes storage.

### 3.2 Build costs
- A shared `BUILD_COSTS` table (one source of truth, imported by sim and UI):
  Miner 5 ore · Belt(conveyor) 1 ore · Storage 5 ore · Smelter 10 ore ·
  Generator 10 ore · Assembler 10 plate · Lab 15 plate.
- `place` is validated by the World: reject if the building type is **not unlocked**
  or the inventory **can't afford** it; otherwise deduct the cost and place.
- The pre-placed starter base from `loadDemo` is exempt (it's seed state, not a player placement).

### 3.3 Science chain (generalize the smelter "converter")
- New `ItemType` **science**; new `ModuleType` **assembler** and **lab**.
- **Assembler:** a converter, same pattern as the smelter — consumes belt-fed
  **plate**, emits **science** after a process time. Draws power.
- **Lab:** consumes belt-fed **science** and adds to the **active research** progress
  over time (only when the active tech's cost is in science). Draws power.
- Items flow on belts generically (the packet model already carries an `item` field),
  so science rides belts and is consumed by the Lab exactly as ore is by the smelter.

### 3.4 Research
- State in the World: `research = { active: string | null; progress: number; completed: Set<string> }`.
- A shared `TECHS` table (source of truth for sim + UI): each tech is
  `{ id, name, desc, costItem: ItemType, cost: number, prereqs: string[],
    unlocksBuildings?: ModuleType[], upgrade?: UpgradeId }`.
- **Selecting** a tech (`research` command, action `select`) sets it active (allowed
  only if its prereqs are completed and it isn't already done).
- **Filling progress** toward the active tech happens two ways:
  - **Manual contribute** (`research` command, action `contribute`): move up to
    `cost - progress` of the active tech's `costItem` from inventory into progress.
    This is how ore/plate techs are researched (works with no Lab).
  - **Lab automation:** each tick, if the active tech's `costItem === 'science'` and a
    Lab has buffered science, the Lab consumes 1 science → `progress += 1`.
- On `progress >= cost`: mark completed, apply `unlocksBuildings` (add to the unlocked
  set) and `upgrade` (set the upgrade flag), reset `progress`, clear `active`.

### 3.5 Tech tree (6 nodes; start unlocked: Miner, Belt, Storage)
1. **Smelting** — 20 ore — unlock **Smelter**.
2. **Power** — 30 ore — prereq Smelting — unlock **Generator**.
3. **Automation Science** — 30 plate — prereq Power — unlock **Assembler**, **Lab**, and the science chain.
4. **Mining Productivity** — 40 science — prereq Automation Science — upgrade: **Miner speed +50%**.
5. **Smelting Efficiency** — 50 science — prereq Automation Science — upgrade: **Smelter speed +50%**.
6. **Power Grid** — 60 science — prereq Automation Science — upgrade: **Generator output +50%**.

### 3.6 Upgrades
Researched upgrade flags modify sim constants for all instances:
- Miner speed +50% → shorter miner cooldown.
- Smelter speed +50% → shorter smelt time.
- Generator output +50% → more power per generator.
Implemented as integer-safe scaling of the existing constants, gated by the
upgrade flags in `research.completed`.

## 4. Architecture & module boundaries

**Shared data (new `src/sim/data.ts`)** — pure constants, no logic, imported by sim and UI:
`BUILD_COSTS`, `START_INVENTORY`, `START_UNLOCKED`, `TECHS`, and an `UpgradeId` union.
This keeps costs/tree DRY across the simulation and the interface.

**Simulation (`src/sim/`)** — the only gameplay logic:
- `types.ts`: add `science` to `ItemType`; `assembler`/`lab` to `ModuleType`; extend
  `Snapshot` with `inventory`, `unlocked: ModuleType[]`, `research { active, progress, completed }`;
  add `Command`s `collect` and `research { action: 'select' | 'contribute'; tech?: string }`.
- `world.ts`: inventory + unlocked set + research state; cost/unlock checks in `place`;
  `collect`, `selectResearch`, `contributeResearch` methods; assembler & lab converters
  (generalize the smelter path); upgrade-aware rate constants; snapshot the new state.
- `worker.ts`: route the new commands.

**UI (`src/ui/`)** — DOM overlay, reading the snapshot + shared data:
- `statusbar.ts`: show **inventory** counts (ore/plate/science) with icons.
- `hotbar.ts`: each tile shows its **cost** and a **locked** state (greyed + lock icon)
  for not-yet-unlocked buildings; add Assembler/Lab tiles.
- New `research.ts`: a toggleable **Research panel** rendering the `TECHS` tree —
  node status (locked / available / active / done), cost, prereqs, a progress bar for
  the active tech, and "Set active" / "Contribute" actions.
- `icons.ts`: add `science`, `assembler`, `lab`, `research`, `lock` icons.
- `placement.ts`: extend `placementValid` to also require the tool be unlocked and affordable.
- `toasts.ts` (existing): "Researched X", "Unlocked Y", "Can't afford".

**Wiring (`src/main.ts`)**: proximity-based `collect`; research-panel actions → `research`
commands; ghost/hotbar reflect unlocked+affordable; open/close the research panel.

## 5. Snapshot & command contract (additions)

Snapshot gains:
```
inventory: Record<ItemType, number>;
unlocked: ModuleType[];
research: { active: string | null; progress: number; completed: string[] };
```
Commands gain:
```
| { type: 'collect' }
| { type: 'research'; action: 'select'; tech: string }
| { type: 'research'; action: 'contribute' }
```
`place` is unchanged in shape but now authoritatively validated (cost + unlock).

## 6. Determinism

All new state is integer. `collect`, `research`, and `place` are ordered commands
processed in the worker; the Lab/Assembler advance on the fixed tick. The player's
continuous position is never read by the sim — proximity collection is decided on
the main thread and expressed as a `collect` command. Same command stream + same
tick count ⇒ identical state, exactly as today.

## 7. Phasing

- **Phase A — Economy:** inventory + seed, `BUILD_COSTS`, `collect`, `place` cost
  validation, inventory UI, hotbar cost display, ghost affordability. (All current
  buildings remain unlocked; this phase adds the *cost* economy only.)
- **Phase B — Research:** the `unlocked` gate (Smelter/Generator/Assembler/Lab start
  locked), the science chain (Assembler/Lab/science item), the research state + the
  6-node tree + the Research panel UI + the 3 upgrades, and the locked-state hotbar/ghost.

Each phase ends green on `npm run build`, is screenshot/headless-verified, and deploys
to GitHub Pages.

## 8. Testing & verification

- **Pure logic (unit, `tsx`):** extend `placement` tests (locked + unaffordable cases);
  add `world` tests — collect moves storage→inventory; place deducts / rejects on cost;
  research select/contribute and completion applies unlocks; assembler plate→science;
  lab science→progress; an upgrade changes the relevant rate; **determinism** (two runs,
  same commands, identical snapshots).
- **Visual (headless Chrome):** inventory readout, locked hotbar tiles, red ghost when
  unaffordable, the research panel, an unlock toast.
- Build gate (`tsc --noEmit && vite build`) on every task.

## 9. Non-goals (YAGNI)

- No audio. No per-box (non-shared) storage. No multiplayer.
- No deep tech tree beyond the 6 nodes; no module tiers beyond Assembler/Lab.
- No drag-from-inventory / hand-crafting UI beyond the collect + cost flow.
- No fluid/energy systems beyond the existing power model.

## 10. Risks & mitigations

- **Bootstrap deadlock** → resolved: ore-fueled first techs + 30-ore seed + cheap
  starter buildings; Smelter is reachable via Smelting (ore), which is reachable from
  the seed.
- **Two research input paths (manual vs Lab)** → unified through a single `progress`
  accumulator; manual handles ore/plate techs, the Lab handles science techs.
- **Inventory vs storage confusion (two pools)** → status bar shows inventory (spendable);
  storage stays visible via the inspector; the collect step bridges them.
- **Sim scope creep** → generalize the existing converter rather than bespoke assembler/lab code.
</content>
