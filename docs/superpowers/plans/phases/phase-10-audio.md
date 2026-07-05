# Phase 10 — Audio (detailed plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Parent: `../2026-07-05-driftworks-1.0-master-plan.md` (Phase 10).
> Spec §5. Audio NEVER touches the sim — main thread + UI only.

**Goal:** synthesized SFX (zero download weight), one CC0 ambient bed per biome with
crossfade, a Pulse-beat layer that swells with factory size, alert stingers, full mixer in
Settings, mute-on-hide, iOS-safe unlock.

**Branch:** `phase-10-audio`.

## Pre-flight reality check

- [ ] Phase 9 merged: menu exists (audio unlock can hang off its first tap); settings
  sheet (plan #6) has the schema/persistence pattern to extend with three volume fields.
- [ ] Alert kinds in the snapshot: `low_power, storage_full, research_done, raid,
  ark_stage`; `won` flag; biome of the player derivable from the windowed `biome` array.
- [ ] `dist/` size headroom: check current total before adding music (budget ≤ 4 MB
  total audio).

## Design (locked)

- `src/audio/manager.ts` — WebAudio graph: `master → { music, sfx }` GainNodes; created
  lazily on the first user gesture (menu tap or canvas pointerdown; also resume() on
  visibilitychange visible for iOS). Volumes 0–100 from settings
  (`audio: { master: number; music: number; sfx: number }` added to the settings schema);
  muted (master 0) while `document.hidden`.
- `src/audio/sfx.ts` — pure synth functions (no assets): each returns a short buffer or
  builds nodes on demand. Set: `ui_tap` (blip), `place` (thunk + click), `erase`
  (reverse swoosh), `collect` (coin arpeggio), `research_done` (rising 3-note),
  `alert` (soft klaxon), `raid_horn` (low horn), `turret_fire` (filtered noise snap,
  pooled + rate-limited ≤ 8/s), `ark_stage` (deep chord), `launch` (long riser),
  `achievement` (sparkle). Keep every synth < 25 lines; consistent tuning (one pentatonic
  base table).
- **Music:** 5 CC0/CC-BY ambient tracks (~1–2 min loops, OGG ≤ 700 KB each) in
  `public/audio/`; source from free archives (document EVERY track: title, author,
  license, URL in `public/audio/CREDITS.md`; prefer CC0; CC-BY requires the credit —
  also surfaced in the menu Credits screen). Crossfade 3 s on biome change (player's
  current biome, debounced 5 s). A `hum` layer: one looping filtered-noise node whose
  gain scales with `min(1, modulesInWindow / 80)` and pulses subtly on the tick beat
  (`pulse` delta in snapshots).
- **Hooks (main.ts):** UI callbacks → ui_tap/place/erase; snapshot deltas → collect
  (inventory jump), alerts by kind → stingers, `won` → launch, achievements delta →
  sparkle, biome → `setBiome`, `snap.pulse` → `pulse()` beat.

## Tasks

- [ ] **1. manager.ts + settings mixer.** Build the graph + unlock flow; settings sheet
  gains three sliders (live-applied, persisted; the plan-#6 stubbed Audio row becomes
  real). Test manually: sliders attenuate; hidden tab silences; no console autoplay
  warnings on a cold load (nothing plays before a gesture). Commit:
  `audio: manager, unlock flow, settings mixer`.
- [ ] **2. sfx.ts + hooks.** Implement the synth set + wire all hooks. Rate-limit
  turret_fire; cap simultaneous voices (16) — drop, don't queue. Verify on the phone
  viewport (tap latency acceptable) and iOS Safari if available (unlock works).
  Commit: `audio: synthesized SFX set + game hooks`.
- [ ] **3. Music + hum.** Source the five tracks (CREDITS.md + menu credits), lazy-fetch
  the current biome's track only (`fetch` → decodeAudioData on first need; prefetch the
  neighbor biome on idle), crossfade, hum layer. **Gate: `du -sh dist/ + public/audio`
  audio total ≤ 4 MB** — record the number in the commit message. Commit:
  `audio: per-biome ambient beds + factory hum (≤4MB)`.
- [ ] **4. Phase gate.** Full `npm test` (unchanged sim — determinism hash must NOT have
  moved; if it did, something leaked into the sim — find it) + build; deploy;
  live-verify with sound on desktop + phone; PLAN-INDEX + root CLAUDE.md ("no audio"
  backlog line dies; add the audio-never-in-sim rule to root CLAUDE.md golden rules).

**Acceptance (master plan):** cohesive sound level; every category mixable to zero; no
autoplay violations; bundle+assets within budget.
