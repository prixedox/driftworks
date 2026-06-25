# DRIFTWORKS — UI/UX Redesign Design Spec

Date: 2026-06-25
Status: Approved design (pre-plan)
Scope: Interface & UX only. No gameplay/content changes. The deterministic sim
(`src/sim/*`) is untouched.

## 1. Goal

Make the interface look and feel like a polished game rather than developer UI.
Today the HUD is functional but generic: flat text-chip stats, a wrapping row of
text buttons, a plain joystick, a basic inspector card, and flat (no) feedback.
We want a cohesive visual theme, a real build experience, and lively feedback —
delivered in three phases, each independently shippable.

## 2. Approach & rationale

Keep the UI as a **DOM/CSS overlay** on top of the Three.js canvas (as it is
now), but rebuild it on a **design-token system + an SVG icon set**, and split
the monolithic `hud.ts` into focused UI modules. The only in-world (3D) additions
are a build **ghost preview**, **tile highlights**, and a **selection outline**,
which live in the renderer.

Alternatives considered and rejected:
- **In-canvas UI (render UI inside Three.js):** blurry text, no accessibility,
  ~5× the effort, reinvents layout. No.
- **Adopt a UI framework / game-UI kit:** adds weight and fights the bespoke look;
  the current vanilla-DOM approach is sufficient and fully controllable. No.

This keeps UI off the render thread, gives crisp text/icons, and matches the
existing architecture.

## 3. Design language (tokens)

A single source of truth in CSS custom properties (a new `src/ui/theme.css`,
imported before `style.css`). Indicative values, to be finalized during Phase 1:

- **Palette:** `--bg #0b1016`, `--panel rgba(18,24,32,.82)`, `--panel-2 #141b24`,
  `--border #2b3645`, `--accent #5ad1c0` (teal), `--ore #e8a35a`, `--plate #8fd0ff`,
  `--danger #ff6b6b`, `--text #d8e0ea`, `--muted #8aa0b6`.
- **Typography:** system stack; HUD labels uppercase with letter-spacing; numbers
  use `font-variant-numeric: tabular-nums` so values don't jitter.
- **Spacing/radii:** 4-pt spacing scale; radii `--r-sm 8px / --r-md 12px`.
- **Elevation:** layered panel shadow + a subtle inner top-border highlight and an
  optional outer accent glow for active elements ("tech HUD" look).
- **Panels:** dark glassy fill, 1px border, soft shadow; beveled/notched corners
  via `clip-path` for the headline panels (hotbar, inspector).

These tokens drive every component so the look is consistent and easy to retune.

## 4. Architecture & module boundaries

`src/ui/` is split so each unit has one purpose, a clear interface, and can be
tested/understood alone (this also resolves the "`hud.ts` is too big" smell):

- **`theme.css`** — design tokens + shared component base styles.
- **`icons.ts`** — `ICONS: Record<string,string>` of inline SVG markup (one per
  build tool, control, and item). No logic.
- **`statusbar.ts`** — top status panel: pulse, **power as a bar**, ore/plate with
  item icons. Interface: `update(snapshot)`.
- **`hotbar.ts`** — build/erase/inspect icon tiles + a secondary control dock
  (view-rotate, pause, speed, explain, reset). Owns active-tool state and number-
  key shortcuts. Interface: `onSelect(tool)`, `setActive(tool)`, control callbacks.
- **`inspector.ts`** — machine popup with a progress bar + item icons.
  Interface: `show(title, rows)`, `hide()`.
- **`toasts.ts`** — transient messages / floating text. Interface: `push(text, kind)`.
- **`joystick.ts`** — extracted + restyled thumbstick. Interface: `onMove(x,y)`.
- **`hud.ts`** — thin orchestrator that builds the above, exposes the existing
  `Hud` surface to `main.ts`, and routes callbacks. No layout/markup of its own
  beyond composition.

Renderer additions (`src/render/renderer.ts`), all read-only views of state:
- `setGhost(g: { cell:number; type:ModuleType; dir:Dir; valid:boolean } | null)` —
  a translucent preview mesh of the module-to-place; tinted green (valid) / red
  (invalid). Reuses the existing module-build geometry at low opacity.
- `setHighlight(cells: number[])` — glowing tile footprints (e.g. ore tiles when
  the Miner tool is active, or the targeted cell).
- `setSelected(cell: number | null)` — an outline/glow on the inspected or hovered
  machine.

`main.ts` stays the wiring layer: it computes the ghost target + validity, feeds
the renderer, owns hotbar shortcuts, and emits toasts from snapshot deltas. The
sim and the worker protocol do not change.

## 5. Phase 1 — Visual theme & design system

The biggest "it looks like a game now" jump. Deliverables:

- **Tokens + `theme.css`** wired in; restyle existing panels to the new language.
- **Status bar** (`statusbar.ts`): a single grouped panel, top-left/top-center,
  with an icon per stat, **power shown as a small fill bar** (red when in deficit),
  tabular numbers, and a compact ore/plate readout using item icons.
- **Icon hotbar** (`hotbar.ts`): replace the text-button row with a row of **square
  icon tiles** for Miner / Belt / Smelter / Storage / Generator / Erase / Info —
  each with an SVG glyph, label tooltip, number-key badge (1–7), and a clear
  active state (accent border + glow). The control buttons (Build-dir, ↻ View,
  Pause, Speed, Explain, Reset) move into a tidy **secondary dock** so build tools
  read as the primary action.
- **Icons** (`icons.ts`): author clean line-style SVGs matching the palette.
- **Joystick** restyle to the theme.
- **Hint** line restyled (smaller, muted, dismissible).

Acceptance: the HUD reads as a cohesive game interface; no text-only buttons;
consistent spacing/typography; legible on a phone.

## 6. Phase 2 — Build & interaction UX

Make building feel deliberate and good.

- **Placement ghost** (`renderer.setGhost`): with a build tool active, show a
  translucent preview of the module on the targeted tile with its direction arrow.
  **Green = valid, red = invalid.**
- **Validity** (pure function in `main.ts`, unit-tested): `placementValid(cell,
  tool, snapshot)` → empty cell required; **Miner requires the cell to be ore**;
  everything else valid on any empty cell. Belts/erase keep working via drag.
- **Targeting:** desktop uses **hover** (pointermove → raycast → cell) to position
  the ghost; touch shows the ghost **under the finger while pressing** and commits
  on release/tap (no hover state on touch). The ghost target uses the existing
  ground-plane raycast, so it's correct at any camera rotation.
- **Highlights** (`renderer.setHighlight`): when the Miner is selected, gently
  highlight ore tiles; always highlight the targeted cell's footprint.
- **Selection/hover outline** (`renderer.setSelected`): outline the machine under
  the Inspect cursor (and on hover, desktop) so it's clear what you're inspecting.
- **Keyboard shortcuts:** 1–7 select hotbar tools; existing Q/E rotate view; R
  could rotate build direction (optional).

Acceptance: you can see exactly where and which-way a module will be placed before
committing; invalid placements are visually obvious; works under camera rotation
and on touch.

## 7. Phase 3 — Feedback & juice

Make it feel alive and responsive.

- **Toasts / floating text** (`toasts.ts`): throttled transient messages — e.g.
  a subtle "+N plate" near the status counter when storage increases, and a "Low
  power" warning when a deficit begins. Driven by snapshot deltas in `main.ts`.
- **Inspector polish** (`inspector.ts`): smelter progress as an **animated bar**,
  item icons for buffers, and smoothly tweened numbers.
- **Micro-animations:** hotbar tile press-pop, panel slide/fade-in on load,
  active-tool glow pulse, selection glow. CSS-driven; no render-thread cost.
- **Sound:** explicitly deferred — requires audio assets (a later add).

Acceptance: key events produce clear, non-spammy feedback; the inspector animates;
interactions feel responsive.

## 8. Data flow & interfaces

- UI reads the existing `Snapshot` each tick via `hud.setStats(snapshot)` (already
  in place) plus new `statusbar.update` / `inspector` refresh.
- **Ghost/highlight/selection** flow: `main.ts` derives the target cell (pointer
  or touch), computes validity from the latest snapshot (`modules` + `ore`), and
  calls the renderer's `setGhost/setHighlight/setSelected`. The renderer owns no
  game state.
- **Toasts**: `main.ts` keeps the previous snapshot, diffs `storage`/`power`, and
  calls `toasts.push(...)` (throttled).
- The `Hud` interface exposed to `main.ts` keeps its current shape where possible
  (`setStats`, `setDir`, `setPaused`, `setSpeed`, `showInspect`, `hideInspect`)
  plus minimal additions for toasts; internal composition changes only.

## 9. Non-goals (YAGNI)

- No audio/music (needs assets) — deferred.
- No UI framework or in-canvas UI.
- No theming/skins switching, no settings menu, no localization.
- No new gameplay, machines, recipes, or biomes.
- No 3D post-processing (bloom/SSAO) in this pass — CSS/mesh-level polish only.

## 10. Testing & verification

- **Pure logic:** unit-test `placementValid()` (miner-on-ore, occupied, empty)
  with `tsx`, committed alongside existing sim checks.
- **Visual:** headless-Chrome screenshots per phase (hotbar, ghost green/red,
  inspector bar, toast) — the established verification harness.
- **Gate:** `npm run build` (tsc --noEmit + vite) must stay green; no console
  errors in the screenshot runs.
- Each phase is verified and deployed before the next begins.

## 11. Risks & mitigations

- **Touch has no hover** → ghost-under-finger on press + commit on release; don't
  depend on hover for touch.
- **DOM-over-canvas input bleed** → keep pointer-events scoped (HUD panels capture,
  the canvas gets the rest), as today.
- **Scope creep / inconsistency** → tokens-first; every component consumes tokens.
- **Bundle/DOM cost** → SVGs inline & tiny; CSS animations only; negligible.

## 12. Rollout

Phase 1 → 2 → 3, in order; each is shippable on its own and deployed via the
existing GitHub Pages workflow. The `hud.ts` split happens in Phase 1 (it's the
foundation the later phases build on).
