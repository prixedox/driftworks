import './ui/theme.css';
import './style.css';
import { Renderer } from './render/renderer';
import { buildHud } from './ui/hud';
import { placementValid } from './ui/placement';
import { RECIPES } from './sim/data';
import type { Command, Dir, ModuleType, SaveState, Snapshot, WorkerMessage } from './sim/types';
import { START_INVENTORY, START_UNLOCKED } from './sim/data';
import { loadSettings, saveSettings } from './settings';
import type { QualityOpts } from './settings';
import type { SparklineHistory } from './ui/stats';

const SAVE_KEY = 'driftworks.save.v3';
const V2_SAVE_KEY = 'driftworks.save.v2';

/** Promote a v2 save to v3, filling in sensible defaults for new fields. */
function migrateToV3(raw: unknown): SaveState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s['version'] !== 2 || !Array.isArray(s['modules'])) return null;
  return {
    version: 3,
    modules: s['modules'] as SaveState['modules'],
    storage: (s['storage'] as SaveState['storage']) ?? { ore: 0, plate: 0, science: 0 },
    pulse: typeof s['pulse'] === 'number' ? s['pulse'] : 0,
    player: s['player'] as SaveState['player'],
    inventory: { ...START_INVENTORY },
    unlocked: [...START_UNLOCKED],
    research: { active: null, progress: 0, completed: [] },
    upgrades: [],
  };
}

function readSave(): SaveState | null {
  try {
    // Try v3 first.
    const rawV3 = localStorage.getItem(SAVE_KEY);
    if (rawV3) {
      const s = JSON.parse(rawV3) as SaveState;
      if (s && s.version === 3 && Array.isArray(s.modules)) return s;
    }
    // Fall back to v2 and migrate.
    const rawV2 = localStorage.getItem(V2_SAVE_KEY);
    if (rawV2) {
      const migrated = migrateToV3(JSON.parse(rawV2));
      if (migrated) {
        // Persist under the new key immediately so next load is native v3.
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(migrated)); } catch { /* ignore */ }
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

type DescribeRow = {
  label: string;
  value: string;
  bar?: number;
  icon?: string;
  options?: { value: string; label: string }[];
  selected?: string;
  onChange?: (v: string) => void;
};

/** Build the inspector contents for the machine at `cell`, or null if empty. */
function describe(
  cell: number,
  s: Snapshot,
  onSelectRecipe: (cell: number, recipe: string) => void,
): { title: string; rows: DescribeRow[] } | null {
  const m = s.modules.find((mm) => mm.cell === cell);
  if (!m) return null;
  const dirName = ['North', 'East', 'South', 'West'][m.dir];
  switch (m.type) {
    case 'storage':
      return {
        title: 'Storage (shared depot)',
        rows: [
          { label: 'Ore', value: String(s.storage.ore), icon: 'ore' },
          { label: 'Plate', value: String(s.storage.plate), icon: 'plate' },
          { label: 'Science', value: String(s.storage.science), icon: 'science' },
        ],
      };
    case 'smelter': {
      const smelterRecipes = RECIPES
        .filter((r) => r.machines.includes('smelter') && s.unlockedRecipes.includes(r.id))
        .map((r) => ({ value: r.id, label: r.name }));
      const currentRecipeId = m.recipe ?? 'smelt_iron';
      const currentRecipe = RECIPES.find((r) => r.id === currentRecipeId);
      return {
        title: 'Smelter',
        rows: [
          {
            label: 'Recipe',
            value: currentRecipe?.name ?? '?',
            options: smelterRecipes.length > 1 ? smelterRecipes : undefined,
            selected: currentRecipeId,
            onChange: (v) => onSelectRecipe(cell, v),
          },
          { label: 'Input waiting', value: String(m.buffer ?? 0) },
          { label: 'Progress', value: `${Math.round((m.progress ?? 0) * 100)}%`, bar: m.progress ?? 0 },
          { label: 'Output ready', value: String(m.out ?? 0) },
          { label: 'Status', value: m.busy ? 'smelting' : 'idle' },
        ],
      };
    }
    case 'miner': {
      const onOre = s.ore.includes(cell);
      return {
        title: 'Miner',
        rows: [
          { label: 'On ore', value: onOre ? 'yes' : 'no' },
          { label: 'Status', value: m.busy ? 'mining' : onOre ? 'idle (no power / belt full)' : 'no ore here' },
          { label: 'Facing', value: dirName },
        ],
      };
    }
    case 'generator': {
      const out = s.research.completed.includes('power_grid') ? 18 : 12;
      return { title: 'Generator', rows: [{ label: 'Power output', value: `+${out}` }] };
    }
    case 'conveyor':
      return { title: 'Conveyor belt', rows: [{ label: 'Direction', value: dirName }] };
    case 'assembler': {
      const assemblerRecipes = RECIPES
        .filter((r) => r.machines.includes('assembler') && s.unlockedRecipes.includes(r.id))
        .map((r) => ({ value: r.id, label: r.name }));
      const currentRecipeId = m.recipe ?? 'assemble_science';
      const currentRecipe = RECIPES.find((r) => r.id === currentRecipeId);
      return {
        title: 'Assembler',
        rows: [
          {
            label: 'Recipe',
            value: currentRecipe?.name ?? '?',
            options: assemblerRecipes.length > 1 ? assemblerRecipes : undefined,
            selected: currentRecipeId,
            onChange: (v) => onSelectRecipe(cell, v),
          },
          { label: 'Input waiting', value: String(m.buffer ?? 0) },
          { label: 'Progress', value: `${Math.round((m.progress ?? 0) * 100)}%`, bar: m.progress ?? 0 },
          { label: 'Output ready', value: String(m.out ?? 0) },
          { label: 'Status', value: m.busy ? 'assembling' : 'idle' },
        ],
      };
    }
    case 'lab':
      return {
        title: 'Lab',
        rows: [
          { label: 'Science buffered', value: String(m.buffer ?? 0) },
          { label: 'Researching', value: s.research.active ?? 'nothing' },
          { label: 'Status', value: m.busy ? 'researching' : 'idle' },
        ],
      };
  }
  return null;
}

function writeSave(s: Snapshot, player: { x: number; y: number }): void {
  const save: SaveState = {
    version: 3,
    modules: s.modules.map((m) => ({ cell: m.cell, type: m.type, dir: m.dir })),
    storage: s.storage,
    pulse: s.pulse,
    player,
    inventory: s.inventory,
    // Persist module unlocks AND recipe unlocks so research round-trips through saves.
    unlocked: [...s.unlocked, ...s.unlockedRecipes],
    research: s.research,
    upgrades: s.upgrades,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

async function main(): Promise<void> {
  const root = document.getElementById('app')!;
  const renderer = new Renderer();
  await renderer.init(root);

  // Graphics quality: load persisted (or auto-detected) settings and apply now.
  const currentQuality = loadSettings();
  renderer.setQuality(currentQuality);

  // The deterministic simulation runs off the main thread.
  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (c: Command) => worker.postMessage(c);

  let tool: ModuleType | 'erase' | 'inspect' | 'blueprint' = 'conveyor';
  let dir: Dir = 1;
  let paused = false;
  let inspectCell: number | null = null;
  let bpCorner1 = -1;
  let bpCorner2 = -1;
  let bpDragging = false;
  let bpHasClipboard = false; // true after a copy; paste mode until next copy
  const SPEEDS = [300, 150, 80, 40]; // ms per tick (belts move 1 of 4 slots per tick)
  let speedIdx = 1;

  const selectResearch = (tech: string) => send({ type: 'research', action: 'select', tech });
  const contributeResearch = () => send({ type: 'research', action: 'contribute' });
  const selectRecipeCmd = (cell: number, recipe: string) => send({ type: 'select-recipe', cell, recipe });

  const hud = buildHud(root, {
    selectTool: (t) => {
      tool = t;
      if (t === 'inspect' || t === 'erase' || t === 'blueprint') renderer.setGhost(null);
      if (t !== 'blueprint') { bpHasClipboard = false; bpCorner1 = -1; bpCorner2 = -1; bpDragging = false; }
      updateAffordances();
    },
    rotate: () => {
      dir = ((dir + 1) % 4) as Dir;
      hud.setDir(dir);
    },
    togglePause: () => {
      paused = !paused;
      send({ type: 'pause', paused });
      hud.setPaused(paused);
    },
    cycleSpeed: () => {
      speedIdx = (speedIdx + 1) % SPEEDS.length;
      send({ type: 'speed', pulseMs: SPEEDS[speedIdx] });
      hud.setSpeed(SPEEDS[speedIdx]);
    },
    toggleExplain: (on) => renderer.setExplain(on),
    move: (x, y) => renderer.setMove(x, y),
    rotateView: (d) => renderer.rotateView(d),
    closeInspect: () => {
      inspectCell = null;
      updateAffordances();
    },
    reset: () => {
      try {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(V2_SAVE_KEY);
      } catch {
        /* ignore */
      }
      renderer.setPlayer(20.5, 13.5);
      send({ type: 'reset' });
    },
    selectResearch,
    contributeResearch,
    selectRecipe: selectRecipeCmd,
    applyQuality: (opts: QualityOpts) => {
      renderer.setQuality(opts);
      saveSettings(opts);
    },
  });
  hud.setDir(dir);
  hud.initSettings(currentQuality);
  hud.setSpeed(SPEEDS[speedIdx]);

  let latest: Snapshot | null = null;
  let lastSaved = 0;
  let prevSnap: Snapshot | null = null;
  let lastPlateToast = 0;
  let lastCopperPlateToast = 0;
  let lastCollect = 0;

  // Client-side sparkline ring buffer (visualisation only — NOT game state).
  const HISTORY_CAP = 64;
  const sparkHistory = {} as SparklineHistory;
  const pushHistory = (s: Snapshot) => {
    for (const item of Object.keys(s.rates) as (keyof SparklineHistory)[]) {
      const arr = (sparkHistory[item] ??= []);
      arr.push(s.rates[item].produced);
      if (arr.length > HISTORY_CAP) arr.shift();
    }
  };

  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type !== 'snapshot') return;
    const snap = e.data.snapshot;
    latest = snap;
    renderer.setSnapshot(snap);
    hud.setStats(snap);
    hud.setResearch(snap);
    if (inspectCell != null) refreshInspect();
    updateAffordances();
    const pl = renderer.getPlayer();
    pushHistory(snap);
    hud.setStatsHistory(snap, sparkHistory);
    hud.updateMinimap(snap, pl.x, pl.y);
    const near = snap.modules.some((m) => {
      if (m.type !== 'storage') return false;
      const mx = (m.cell % snap.w) + 0.5;
      const my = Math.floor(m.cell / snap.w) + 0.5;
      return Math.hypot(pl.x - mx, pl.y - my) < 1.6;
    });
    const tnow = Date.now();
    if (near && tnow - lastCollect > 400) {
      lastCollect = tnow;
      send({ type: 'collect' });
    }
    const now = Date.now();
    if (now - lastSaved > 3000) {
      lastSaved = now;
      writeSave(snap, renderer.getPlayer());
    }
    if (prevSnap) {
      const dPlate = snap.storage.plate - prevSnap.storage.plate;
      if (dPlate > 0 && now - lastPlateToast > 1500) {
        lastPlateToast = now;
        hud.pushToast(`+${dPlate} plate`, 'info');
      }
      const dCopperPlate = snap.storage.copper_plate - prevSnap.storage.copper_plate;
      if (dCopperPlate > 0 && now - lastCopperPlateToast > 1500) {
        lastCopperPlateToast = now;
        hud.pushToast(`+${dCopperPlate} copper plate`, 'info');
      }
      if (snap.power.deficit && !prevSnap.power.deficit) hud.pushToast('Low power', 'warn');
    }
    prevSnap = snap;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && latest) writeSave(latest, renderer.getPlayer());
  });

  const refreshInspect = () => {
    if (inspectCell == null || !latest) return;
    const info = describe(inspectCell, latest, selectRecipeCmd);
    if (!info) {
      inspectCell = null;
      hud.hideInspect();
      updateAffordances();
      return;
    }
    hud.showInspect(info.title, info.rows);
  };

  // Walk with WASD / arrow keys (desktop); the on-screen stick handles touch.
  const keys = new Set<string>();
  const KEYMAP: Record<string, [number, number]> = {
    w: [0, -1],
    arrowup: [0, -1],
    s: [0, 1],
    arrowdown: [0, 1],
    a: [-1, 0],
    arrowleft: [-1, 0],
    d: [1, 0],
    arrowright: [1, 0],
  };
  const recomputeMove = () => {
    let x = 0;
    let y = 0;
    for (const k of keys) {
      const v = KEYMAP[k];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    renderer.setMove(x, y);
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      send({ type: 'undo' });
      return;
    }
    if (k === 'q') {
      renderer.rotateView(-1);
      return;
    }
    if (k === 'e') {
      renderer.rotateView(1);
      return;
    }
    if (k in KEYMAP) {
      keys.add(k);
      recomputeMove();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.delete(k)) recomputeMove();
  });

  // Build / erase by tapping or dragging. Dragging the Belt tool lays a
  // connected, auto-oriented line — the key touch-building affordance.
  const canvas = renderer.canvas;
  let dragging = false;
  let lastCell = -1;

  const cellAt = (ev: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect();
    return renderer.screenToCell(ev.clientX - rect.left, ev.clientY - rect.top);
  };

  const buildAt = (cell: number) => {
    if (tool === 'erase') send({ type: 'remove', cell });
    else if (tool !== 'inspect' && tool !== 'blueprint') send({ type: 'place', cell, module: tool, dir });
  };

  const updateGhost = (cell: number) => {
    if (cell < 0 || tool === 'inspect' || tool === 'erase' || tool === 'blueprint' || !latest) {
      renderer.setGhost(null);
      return;
    }
    renderer.setGhost({ cell, type: tool, dir, valid: placementValid(cell, tool, latest) });
  };

  const updateBlueprintGhost = (originCell: number) => {
    if (originCell < 0 || !latest || latest.clipboard.length === 0) {
      renderer.setGhost(null);
      return;
    }
    // Show the first clipboard entry as a single ghost to indicate the paste origin.
    // (A full multi-cell ghost is a renderer enhancement deferred to a later task.)
    const first = latest.clipboard[0];
    renderer.setGhost({ cell: originCell, type: first.type, dir: first.dir, valid: true });
  };

  const updateAffordances = () => {
    renderer.setHighlight(tool === 'miner' && latest ? latest.ore : []);
    renderer.setSelected(inspectCell);
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const cell = cellAt(ev);
    if (cell < 0) return;
    if (tool === 'inspect') {
      inspectCell = cell;
      refreshInspect();
      updateAffordances();
      return;
    }
    if (tool === 'blueprint') {
      if (!bpHasClipboard) {
        // Selection drag mode: start corner
        bpCorner1 = cell;
        bpCorner2 = cell;
        bpDragging = true;
        canvas.classList.add('bp-selecting');
        canvas.setPointerCapture?.(ev.pointerId);
      } else {
        // Paste mode: send paste command at tapped cell
        send({ type: 'blueprint', action: 'paste', originCell: cell });
        bpHasClipboard = false; // clear after paste so user can start a new copy
      }
      return;
    }
    dragging = true;
    lastCell = cell;
    buildAt(cell);
    updateGhost(cell);
    canvas.setPointerCapture?.(ev.pointerId);
  });

  canvas.addEventListener('pointermove', (ev) => {
    const cell = cellAt(ev);
    if (tool === 'blueprint') {
      if (bpDragging && cell >= 0) {
        bpCorner2 = cell;
        // Visual feedback: show a ghost at the current hover (selection end corner)
        renderer.setGhost({ cell, type: 'conveyor', dir, valid: true });
      } else if (!bpDragging && bpHasClipboard && cell >= 0) {
        updateBlueprintGhost(cell);
      }
      return;
    }
    if (!dragging) {
      if (ev.pointerType === 'mouse') updateGhost(cell);
      return;
    }
    if (cell >= 0 && cell !== lastCell) {
      if (tool === 'conveyor') {
        const d = renderer.adjacentDir(lastCell, cell);
        if (d !== -1) {
          send({ type: 'place', cell: lastCell, module: 'conveyor', dir: d });
          send({ type: 'place', cell, module: 'conveyor', dir: d });
        } else {
          send({ type: 'place', cell, module: 'conveyor', dir });
        }
      } else {
        buildAt(cell);
      }
      lastCell = cell;
    }
    updateGhost(cell);
  });

  const endDrag = (ev: PointerEvent) => {
    if (tool === 'blueprint' && bpDragging) {
      bpDragging = false;
      canvas.classList.remove('bp-selecting');
      // Collect all cells in the bounding rectangle [corner1..corner2]
      if (bpCorner1 >= 0 && bpCorner2 >= 0 && latest) {
        const c1col = bpCorner1 % latest.w, c1row = Math.floor(bpCorner1 / latest.w);
        const c2col = bpCorner2 % latest.w, c2row = Math.floor(bpCorner2 / latest.w);
        const minCol = Math.min(c1col, c2col), maxCol = Math.max(c1col, c2col);
        const minRow = Math.min(c1row, c2row), maxRow = Math.max(c1row, c2row);
        const cells: number[] = [];
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            cells.push(r * latest.w + c);
          }
        }
        send({ type: 'blueprint', action: 'copy', cells });
        bpHasClipboard = true;
      }
      bpCorner1 = -1;
      bpCorner2 = -1;
      canvas.releasePointerCapture?.(ev.pointerId);
      renderer.setGhost(null);
      return;
    }
    renderer.setGhost(null);
    dragging = false;
    lastCell = -1;
    canvas.releasePointerCapture?.(ev.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => renderer.setGhost(null));

  send({ type: 'speed', pulseMs: SPEEDS[speedIdx] });
  const saved = readSave();
  if (saved) {
    if (saved.player) renderer.setPlayer(saved.player.x, saved.player.y);
    send({ type: 'load', save: saved });
  } else {
    send({ type: 'init' });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort in the prototype */
    });
  }
}

void main();
