# DRIFTWORKS CI Tests + Deterministic Replay/Hash Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire ALL existing tests into a `npm test` script so they fail CI on regression; add a GitHub Actions CI workflow that runs on every push/PR and gates the deploy job; add a determinism replay harness + `tests/determinism.test.ts` that catches accidental sim changes via a golden hash and a two-world identity check.

**Architecture:** The npm `test` script uses a shell glob loop (Node 20's built-in shell via `sh -c`) to `npx tsx` each `tests/*.test.ts` sequentially and propagates the first non-zero exit. Each individual test already calls `process.exit(0|1)` — the runner just needs to sequence them and accumulate failure. The CI workflow (`.github/workflows/ci.yml`) runs `npm ci → npm run build → npm test` on push + PR to any branch; the existing deploy workflow (`deploy.yml`) depends on the CI job so deploys never run on a broken tree. The determinism harness is a single pure helper function in `tests/_harness.ts` (not imported by `src/`): it takes a seed, tick count, and command-injection callbacks, runs a fresh `World`, and returns a stable deterministic string hash of the final `snapshot()` output.

**Tech Stack:** TypeScript (strict), Node 20, tsx, Vite, GitHub Actions, no new runtime npm packages.

## Global Constraints

- **No src/ behavior changes.** `src/sim/*` is not touched except to export one tiny pure function if needed — but the plan avoids that: the harness lives only in `tests/`. No gameplay logic changes.
- **Build gate:** every task ends green on `npm run build` (`tsc --noEmit && vite build`). Tests do not run through `vite build`; they run via `npx tsx` in Node.
- **Determinism is sacred:** the hash function is pure, integer-derived, and stable across Node versions. No `Date.now`, no `Math.random`, no platform-dependent formatting. The hash input is `JSON.stringify(snapshot)` with a sorted-keys replacer so object key insertion order never matters.
- **Test style:** plain asserts + `process.exit(0|1)`, matching the existing tests. No Jest, no Vitest.
- **Commits:** do NOT add any Claude/AI attribution — no `Co-Authored-By`, no "Generated with" — per project preference (CLAUDE.md rule 5).
- **No new npm deps.** `tsx` is already available via `npx`; no additional packages are installed.
- **tsconfig:** `tests/` files import from `../src/sim/world` and `../src/sim/types` exactly as the existing tests do. The `_harness.ts` helper uses the same import paths.

## File Structure

- **Modify `package.json`** — add `"test"` script.
- **Create `.github/workflows/ci.yml`** — new CI workflow.
- **Modify `.github/workflows/deploy.yml`** — add `needs: ci` dependency on the new workflow.
- **Create `tests/_harness.ts`** — the replay helper + hash function. Test-only; never imported by `src/`.
- **Create `tests/determinism.test.ts`** — the determinism golden-hash + two-world identity test.

---

## Task 1: npm `test` script

**Files:** Modify `package.json`.

**Interfaces produced:** `npm test` (or `npm run test`) runs every `tests/*.test.ts` via `npx tsx`, exits non-zero if any test fails, prints which file failed.

### Why a shell loop, not a custom runner script

Each test calls `process.exit(0|1)`. A TypeScript multi-runner would have to spawn child processes for each anyway (you can't call `process.exit` in an imported module without killing the whole process). A `sh -c` glob loop is the simplest correct approach: it runs each file as a subprocess, stops on the first failure, and sets the exit code automatically. Node 20 ships with a stable shell on all platforms GitHub Actions supports (ubuntu-latest uses bash).

- [ ] **Step 1: Open `package.json` and add the `test` script.**

Current `scripts` block:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview --host"
}
```

Replace with:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview --host",
  "test": "for f in tests/*.test.ts; do echo \"--- $f\"; npx --yes tsx \"$f\" || exit 1; done"
}
```

The script:
- Iterates over every `tests/*.test.ts` in filename order (alphabetical on Linux, which is the CI platform and matches local dev on macOS/Linux).
- Prints a separator line with the filename before each run so failures are easy to locate in CI logs.
- Exits immediately with code 1 on the first failure (`|| exit 1`), so the overall `npm test` exits non-zero — which is what the CI `run` step checks.
- Adding a new test file requires no changes here; the glob picks it up automatically.

- [ ] **Step 2: Verify locally.**
```bash
cd /home/martin/projects/driftworks && npm test
```
Expected output: three passing blocks ending with `PASS`, overall exit 0.

- [ ] **Step 3: Verify failure propagation.** Temporarily break one test to confirm non-zero exit:
```bash
cd /home/martin/projects/driftworks
# Add a deliberate failure to the first test
echo 'process.exit(1)' >> tests/economy.test.ts
npm test; echo "exit: $?"
# Undo
git checkout tests/economy.test.ts
```
Expected: `npm test` exits 1 and stops after the first file.

- [ ] **Step 4: Build gate.**
```bash
cd /home/martin/projects/driftworks && npm run build
```
Expected: green. The `test` script is a shell one-liner; it does not affect `tsc --noEmit`.

- [ ] **Step 5: Commit.**
```bash
git -C /home/martin/projects/driftworks add package.json
git -C /home/martin/projects/driftworks commit -m "tooling: add npm test script (tsx glob runner)"
```

---

## Task 2: CI GitHub Actions workflow

**Files:** Create `.github/workflows/ci.yml`; Modify `.github/workflows/deploy.yml`.

**Interfaces produced:** A `ci` workflow job that runs on every push (any branch) and every pull_request. The existing `deploy.yml` `build` job gains `needs: ci` so Pages deploys never happen on a broken tree.

### Decision: deploy depends on CI, not the reverse

Two options:
1. Make `deploy.yml` `needs` the CI workflow via `workflow_run`.
2. Merge CI steps into `deploy.yml` (run them before build+deploy).

Option 1 (`workflow_run`) is unreliable on PRs and requires `event: [completed]` + success checks — complex. Option 2 adds test steps to the deploy workflow but clutters it and doesn't gate PRs independently.

**Chosen approach:** Keep them as two separate workflow files. Add `needs: ci` to the deploy `build` job where both workflows are defined in the same repo and `ci.yml` is on the same push event. To make the deploy job wait for CI to pass, use a simpler and universally supported pattern: add the test and build commands directly as a prerequisite job called `ci` inside `deploy.yml` — but that duplicates work. The cleanest real-world solution is: CI runs independently; deploy also always runs `npm ci && npm run build && npm test` before building the artifact. This way CI failures block both the CI check AND the deploy.

**Final decision:** Add a `ci` job to `deploy.yml` that the `build` job `needs`. This makes the single deploy workflow self-contained and avoids cross-workflow dependencies. The separate `ci.yml` runs on push + PR for fast feedback on PRs where the deploy job wouldn't run at all.

- [ ] **Step 1: Create `.github/workflows/ci.yml`.**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

Notes:
- `on: push` with no `branches:` filter runs on every branch (including main, feature branches, etc.). This is intentional: catches regressions on feature branches before they reach main.
- `on: pull_request` ensures PR checks block merges on failure.
- Three steps mirror what a developer runs locally: install, typecheck+bundle, tests.
- No `env:` or secrets needed (pure local sim logic, no network).

- [ ] **Step 2: Modify `.github/workflows/deploy.yml` to add the `ci` job and make `build` depend on it.**

Current file (full contents):
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Replace with:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test

  build:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note: The `ci` job in `deploy.yml` and the `ci` job in `ci.yml` both run on push to main. This means on a push to main, CI runs twice (once from each workflow). This is a deliberate tradeoff: the `ci.yml` workflow provides the PR status check; the `ci` job inside `deploy.yml` gates the deploy. The duplication is minor (tests are fast) and avoids fragile cross-workflow `workflow_run` dependencies. If the duplication becomes a burden later, the `ci.yml` workflow can be removed and branch protection rules can be configured to require the `ci` job from `deploy.yml`.

- [ ] **Step 3: Verify YAML syntax locally.**
```bash
python3 -c "import yaml; yaml.safe_load(open('/home/martin/projects/driftworks/.github/workflows/ci.yml'))" && echo OK
python3 -c "import yaml; yaml.safe_load(open('/home/martin/projects/driftworks/.github/workflows/deploy.yml'))" && echo OK
```
Expected: `OK` for both. (Python's `yaml` module is always available on Linux dev machines.)

- [ ] **Step 4: Build gate (no TypeScript changes; verify nothing is broken).**
```bash
cd /home/martin/projects/driftworks && npm run build && npm test
```

- [ ] **Step 5: Commit.**
```bash
git -C /home/martin/projects/driftworks add .github/workflows/ci.yml .github/workflows/deploy.yml
git -C /home/martin/projects/driftworks commit -m "ci: add CI workflow + gate deploy on tests passing"
```

- [ ] **Step 6: Push and verify CI runs.**
```bash
git -C /home/martin/projects/driftworks push origin main
```
Watch the Actions tab on github.com/prixedox/driftworks — confirm both the `CI` workflow and the `Deploy to GitHub Pages` workflow trigger. In the deploy workflow, confirm the `ci` job completes before `build` starts. Confirm the Pages deploy completes successfully and the live site is unchanged.

---

## Task 3: Determinism replay harness (`tests/_harness.ts`)

**Files:** Create `tests/_harness.ts`.

**Interfaces produced:**
```ts
// Runs a World for `ticks` ticks, injecting commands via `inject` at specific ticks.
// Returns a stable string hash of the final snapshot.
function replayHash(opts: ReplayOpts): string

interface ReplayOpts {
  ticks: number;
  // Called once before tick 0 to set up initial state (e.g. unlock techs, set inventory).
  // Use this instead of commands for initial conditions, since World.loadDemo() already runs.
  setup?: (world: import('../src/sim/world').World) => void;
  // Map from tick number to an array of commands to inject at that tick (before advance()).
  // Commands are applied by calling World methods directly (not via worker), since we're in Node.
  commands?: Map<number, CommandFn[]>;
}
// A CommandFn applies one logical command to a World synchronously.
type CommandFn = (world: import('../src/sim/world').World) => void;
```

### Hash function design

The hash must be:
1. **Deterministic across Node versions and platforms** — no locale-sensitive operations.
2. **Stable** — the same snapshot JSON always produces the same hash string, regardless of object key insertion order.
3. **Sensitive** — any integer change in the snapshot (even a single field) changes the hash.
4. **Simple** — no npm deps; pure TypeScript.

**Chosen algorithm:** DJB2 over the UTF-16 code units of the canonicalized snapshot JSON string.
- "Canonical" means: `JSON.stringify(snapshot, sortedKeysReplacer)` where `sortedKeysReplacer` sorts object keys alphabetically at every level. This neutralizes any `Map`-to-array ordering differences and object key insertion order. Arrays are NOT sorted (their order is sim-defined and meaningful).
- DJB2 is a 32-bit non-cryptographic hash with excellent avalanche properties for string inputs, zero dependencies, and trivial to implement in 10 lines.
- Output: the hash as an 8-character lowercase hex string (32-bit unsigned, zero-padded).

The hash function is exported from `_harness.ts` so `determinism.test.ts` can test the golden value.

```ts
// Sorted-keys JSON replacer (objects only; arrays preserve order).
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    );
  }
  return value;
}

// DJB2 hash over a string's UTF-16 code units. Returns 8-char lowercase hex.
export function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return ((h >>> 0) >>> 0).toString(16).padStart(8, '0');
}

export function snapshotHash(snap: import('../src/sim/types').Snapshot): string {
  return djb2Hex(JSON.stringify(snap, sortedReplacer));
}
```

### Full `tests/_harness.ts`

- [ ] **Step 1: Create `tests/_harness.ts`.**

```ts
// Determinism replay harness — test-only helper. Never imported by src/.
// Runs a World for N ticks and returns a stable hash of the final snapshot.

import { World } from '../src/sim/world';
import type { Snapshot } from '../src/sim/types';

export type CommandFn = (world: World) => void;

export interface ReplayOpts {
  /** Number of ticks to advance. */
  ticks: number;
  /**
   * Called once after loadDemo(), before tick 0.
   * Use to set up initial state (inventory, unlocks, etc.) without going through commands.
   */
  setup?: (world: World) => void;
  /**
   * Map from tick index (0-based) to an array of CommandFns to call before that tick's advance().
   * Keys outside [0, ticks) are ignored.
   */
  commands?: Map<number, CommandFn[]>;
}

/** Sorted-keys JSON replacer. Objects → keys sorted; arrays → unchanged. */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  }
  return value;
}

/**
 * DJB2 hash over the UTF-16 code units of a string.
 * Returns an 8-character lowercase hex string (32-bit unsigned, zero-padded).
 * Deterministic across Node versions and platforms.
 */
export function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Returns a stable, sorted-key hash of a snapshot.
 * Any integer change in any snapshot field produces a different hash.
 */
export function snapshotHash(snap: Snapshot): string {
  return djb2Hex(JSON.stringify(snap, sortedReplacer));
}

/**
 * Run a fresh World through `opts.ticks` ticks and return the hash of the final snapshot.
 * The snapshot is taken with pulseMs=150 and paused=false (fixed values for determinism).
 */
export function replayHash(opts: ReplayOpts): string {
  const world = new World();
  world.loadDemo();
  if (opts.setup) opts.setup(world);
  for (let tick = 0; tick < opts.ticks; tick++) {
    const fns = opts.commands?.get(tick);
    if (fns) for (const fn of fns) fn(world);
    world.advance();
  }
  return snapshotHash(world.snapshot(150, false));
}
```

Notes:
- `_harness.ts` begins with `_` to signal it is a shared helper, not a standalone test. The `npm test` glob `tests/*.test.ts` matches only `*.test.ts` so this file is never executed directly as a test.
- `pulseMs=150` and `paused=false` are the same fixed values the existing `research.test.ts` determinism check uses — chosen once and frozen here as the canonical snapshot call for hashing.
- The `commands` map uses integer keys (tick index); calling `world.advance()` after applying commands means "commands at tick 0 run before the first advance", consistent with how a worker processes commands before advancing.

- [ ] **Step 2: Verify `_harness.ts` compiles (typecheck only, not a test run).**
```bash
cd /home/martin/projects/driftworks && npx --yes tsx --noEmit tests/_harness.ts 2>/dev/null || npx --yes tsc --noEmit --target ES2022 --moduleResolution bundler --strict tests/_harness.ts 2>&1 | head -20
```
(tsx does not support `--noEmit` directly; the build gate `npm run build` with `tsc --noEmit` catches type errors in `src/`; tests are checked when `tests/determinism.test.ts` imports and runs them in Task 4.)

- [ ] **Step 3: Commit (together with Task 4 — harness alone isn't useful without the test).**
  Defer to Task 4 Step 5 below.

---

## Task 4: Determinism test (`tests/determinism.test.ts`)

**Files:** Create `tests/determinism.test.ts`.

**Interfaces consumed:** `replayHash`, `snapshotHash`, `djb2Hex` from `tests/_harness.ts`; `World` from `src/sim/world`.

**What this test proves:**
1. **Two-world identity:** `replayHash` called twice with identical opts on separate fresh Worlds produces the same hash — proves `loadDemo()` and `advance()` are deterministic.
2. **Command injection identity:** two Worlds given the same command stream at the same ticks produce the same final hash.
3. **Golden hash:** a fixed, known command stream produces a specific golden hash string — acts as a regression test that catches any accidental change to sim behavior (advance(), snapshot(), data constants, etc.). When the sim is intentionally changed, the golden hash must be updated in the test and the update is a deliberate, reviewed decision.
4. **Hash sensitivity:** a different number of ticks produces a different hash — proves the hash is actually sensitive to sim state (not degenerate / always the same value).

### Obtaining the golden hash

The golden hash cannot be pre-computed in this plan because it depends on the exact current sim state (which changes as features land). The correct procedure is:

1. Implement the test with `GOLDEN = 'COMPUTE_ME'` as a placeholder.
2. Run the test once; it will fail with `expected COMPUTE_ME got <actual>`.
3. Copy the actual hash from the failure output and replace `'COMPUTE_ME'` with it.
4. Run again — it should `PASS`.
5. The golden hash is now committed and will catch future regressions.

This procedure is documented in the test file itself.

### Command stream design

The command stream exercises the most determinism-sensitive paths:
- Placing modules (inventory deduction + module map insertion).
- Running `advance()` through miner → belt → smelter → belt → storage cycles.
- Collecting from storage (inventory mutation).
- Selecting and completing a research tech (state + unlock mutation).

Commands are injected as `CommandFn` lambdas that call World methods directly. This avoids the worker message bus (which is an async browser API) and is consistent with how `research.test.ts` tests the sim in Node.

- [ ] **Step 1: Create `tests/determinism.test.ts`.**

```ts
// Determinism replay + golden-hash regression test.
//
// HOW TO UPDATE THE GOLDEN HASH after an intentional sim change:
//   1. Run this test — it will fail and print the actual hash.
//   2. Replace the GOLDEN constant with the printed hash.
//   3. Run again to confirm PASS.
//   4. Commit the new golden hash together with the sim change that caused it.

import { replayHash, snapshotHash, djb2Hex } from './_harness';
import { World } from '../src/sim/world';

// ─── Golden hash constant ──────────────────────────────────────────────────
// Set to 'COMPUTE_ME' on first run; replace with the printed actual hash,
// then commit both the harness and this file together.
const GOLDEN = 'COMPUTE_ME';

// ─── Command stream ─────────────────────────────────────────────────────────
// A fixed sequence of operations that exercises inventory, modules, belts,
// converters, storage, collect, and research — the most determinism-sensitive paths.
//
// The setup callback unlocks smelter (requires completing 'smelting' research)
// and loads enough inventory to place additional modules without running dry.
// All placements use absolute cell indices on the 40×26 grid; we place in a
// region away from the demo base (row 5) to avoid collisions.

import { World as W } from '../src/sim/world';

type CmdMap = Map<number, Array<(w: W) => void>>;

function buildCommandStream(): CmdMap {
  const cmds: CmdMap = new Map();
  const at = (tick: number, fn: (w: W) => void) => {
    if (!cmds.has(tick)) cmds.set(tick, []);
    cmds.get(tick)!.push(fn);
  };

  // tick 0: place an extra conveyor at cell (5,5)=(5*40+5=205)
  at(0, (w) => {
    w.inventory.ore = 100; // ensure affordable
    w.place(w.cell(5, 5), 'conveyor', 1);
  });

  // tick 10: collect whatever has arrived in storage by now
  at(10, (w) => w.collect());

  // tick 20: select 'smelting' research and contribute from inventory
  at(20, (w) => {
    w.inventory.ore = 200;
    w.selectResearch('smelting');
    w.contributeResearch(); // pays 20 ore → completes smelting
  });

  // tick 30: collect again
  at(30, (w) => w.collect());

  // tick 50: select next research ('power') and contribute
  at(50, (w) => {
    w.inventory.ore = 200;
    w.selectResearch('power');
    w.contributeResearch(); // pays 30 ore → completes power
  });

  return cmds;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    console.error('FAIL', m);
    fails++;
  }
};

const TICKS = 100;
const commands = buildCommandStream();
const setup = (w: W) => {
  // No extra setup beyond what buildCommandStream injects at tick 0.
  // loadDemo() already fires before tick 0 in replayHash.
};

// Test 1: Two independent Worlds with the same command stream produce the same hash.
const hashA = replayHash({ ticks: TICKS, setup, commands });
const hashB = replayHash({ ticks: TICKS, setup, commands });
ok(hashA === hashB, `two-world identity: A=${hashA} B=${hashB}`);

// Test 2: A different tick count produces a different hash (hash sensitivity check).
const hashShort = replayHash({ ticks: TICKS - 1, setup, commands });
ok(hashA !== hashShort, `hash changes with different tick count: ${TICKS} ticks vs ${TICKS - 1} ticks`);

// Test 3: No commands vs commands produces different hashes (commands affect state).
const hashNoCommands = replayHash({ ticks: TICKS });
ok(hashA !== hashNoCommands, 'command stream changes final hash vs no-commands baseline');

// Test 4: Golden hash regression — catches accidental sim changes.
// If GOLDEN === 'COMPUTE_ME', print the actual hash and fail with instructions.
if (GOLDEN === 'COMPUTE_ME') {
  console.error(`FAIL golden hash not set. Actual hash for TICKS=${TICKS} with command stream: ${hashA}`);
  console.error('Replace GOLDEN = \'COMPUTE_ME\' with GOLDEN = \'' + hashA + '\' and re-run.');
  fails++;
} else {
  ok(hashA === GOLDEN, `golden hash: expected ${GOLDEN} got ${hashA}`);
}

// Test 5: djb2Hex produces consistent output for a known input (unit-test the hasher).
const knownHash = djb2Hex('driftworks');
ok(knownHash === djb2Hex('driftworks'), 'djb2Hex is idempotent');
ok(knownHash.length === 8, `djb2Hex output is 8 chars (got ${knownHash.length})`);
ok(/^[0-9a-f]{8}$/.test(knownHash), `djb2Hex output is lowercase hex (got ${knownHash})`);

// Test 6: snapshotHash is stable for a fixed snapshot (not just in replayHash).
const world = new World();
world.loadDemo();
for (let i = 0; i < 20; i++) world.advance();
const snap = world.snapshot(150, false);
const h1 = snapshotHash(snap);
const h2 = snapshotHash(snap);
ok(h1 === h2, 'snapshotHash is stable for same snapshot object');

console.log(fails === 0 ? 'PASS' : `FAILED ${fails}`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to compute the golden hash (first run will fail on GOLDEN).**
```bash
cd /home/martin/projects/driftworks && npx --yes tsx tests/determinism.test.ts
```
Expected output (approximately):
```
FAIL golden hash not set. Actual hash for TICKS=100 with command stream: <8hexchars>
Replace GOLDEN = 'COMPUTE_ME' with GOLDEN = '<8hexchars>' and re-run.
FAILED 1
```
All other assertions should pass (the GOLDEN assertion is the only expected failure on first run). If other assertions fail, diagnose before proceeding.

- [ ] **Step 3: Replace `'COMPUTE_ME'` with the printed actual hash.**

In `tests/determinism.test.ts`, line:
```ts
const GOLDEN = 'COMPUTE_ME';
```
Replace `'COMPUTE_ME'` with the actual 8-char hex string printed in Step 2. Example (your value will differ):
```ts
const GOLDEN = 'a3f7c2e1';
```

- [ ] **Step 4: Run again — all assertions must pass.**
```bash
cd /home/martin/projects/driftworks && npx --yes tsx tests/determinism.test.ts
```
Expected: `PASS`.

- [ ] **Step 5: Run the full test suite.**
```bash
cd /home/martin/projects/driftworks && npm test
```
Expected: all four test files pass (economy, placement, research, determinism), overall exit 0.

- [ ] **Step 6: Build gate.**
```bash
cd /home/martin/projects/driftworks && npm run build
```
Expected: green. The new test files and `_harness.ts` are not in the `src/` tree; `tsc --noEmit` targets `src/` only (per `tsconfig.json`'s `include` or default root). If `tsc` unexpectedly picks up `tests/`, add `"exclude": ["tests"]` to `tsconfig.json` — but do NOT do this pre-emptively; only if the build actually fails with a type error from `tests/`.

If `npm run build` emits TS errors from `tests/` (e.g., about `_harness.ts`), open `tsconfig.json` and add:
```json
"exclude": ["tests", "node_modules"]
```
Then re-run `npm run build` → green.

- [ ] **Step 7: Commit `_harness.ts` and `determinism.test.ts` together.**
```bash
git -C /home/martin/projects/driftworks add tests/_harness.ts tests/determinism.test.ts
git -C /home/martin/projects/driftworks commit -m "test: determinism replay harness + golden-hash regression test"
```

---

## Self-review notes (author)

- **Feature scope coverage:**
  - npm `test` script: Task 1 — shell glob loop, all `tests/*.test.ts` via `npx tsx`, exits non-zero on failure. Auto-discovers new tests without changes to package.json.
  - CI workflow: Task 2 — `.github/workflows/ci.yml` on push + PR; deploy depends on CI via the `ci` job in `deploy.yml`. No changes to deploy behavior beyond adding the gate.
  - Replay harness: Task 3 (`_harness.ts`) + Task 4 (`determinism.test.ts`) — `replayHash` with setup + command injection, `snapshotHash` with sorted-keys canonicalization, `djb2Hex`, golden hash, two-world identity, hash sensitivity, and harness unit tests.

- **No src/ changes:** `_harness.ts` imports `World` and `Snapshot` from `src/sim/` but adds no exports to those files and changes no sim logic. The hash helper (`djb2Hex`, `snapshotHash`) lives entirely in `tests/`.

- **Determinism of the hash:** `sortedReplacer` eliminates key-order variance. Arrays preserve order (sim-defined, meaningful). `djb2Hex` uses only `Math.imul`, `>>>`, and `charCodeAt` — all specified by ECMAScript with no platform-dependent behavior. `pulseMs=150` and `paused=false` are hardcoded in `replayHash` to eliminate call-site variance.

- **Golden hash update protocol:** documented in the test file with explicit instructions. The pattern `COMPUTE_ME` → fail + print → copy → re-run → commit is self-contained and requires no tooling beyond `npx tsx`.

- **tsconfig interaction:** `tests/` is not normally in the `tsc --noEmit` scan for a Vite project. The plan includes an explicit contingency (add `"exclude": ["tests"]`) in case the default config pulls them in, but does not pre-emptively touch `tsconfig.json`.

- **CI duplication tradeoff:** the `ci` job runs twice on main pushes (once in `ci.yml`, once in `deploy.yml`). This is a deliberate tradeoff: simpler than `workflow_run` cross-workflow dependencies, and tests are fast enough that the duplicate run is negligible. Documented in Task 2 for future reference.

- **Commit sequence:** Task 1 (package.json) → Task 2 (workflows) → Task 3+4 together (harness + test, in one commit after the golden hash is set). Three commits total; each passes `npm run build && npm test` before committing.
