import './style.css';
import { Renderer } from './render/renderer';
import { buildHud } from './ui/hud';
import type { Command, Dir, ModuleType, SaveState, Snapshot, WorkerMessage } from './sim/types';

const SAVE_KEY = 'driftworks.save.v2';

function readSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveState;
    return s && s.version === 2 && Array.isArray(s.modules) ? s : null;
  } catch {
    return null;
  }
}

function writeSave(s: Snapshot, player: { x: number; y: number }): void {
  const save: SaveState = {
    version: 2,
    modules: s.modules.map((m) => ({ cell: m.cell, type: m.type, dir: m.dir })),
    storage: s.storage,
    pulse: s.pulse,
    player,
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

  // The deterministic simulation runs off the main thread.
  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (c: Command) => worker.postMessage(c);

  let tool: ModuleType | 'erase' = 'conveyor';
  let dir: Dir = 1;
  let paused = false;
  const SPEEDS = [1000, 600, 300, 120];
  let speedIdx = 1;

  const hud = buildHud(root, {
    selectTool: (t) => {
      tool = t;
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
    reset: () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
      renderer.setPlayer(20.5, 13.5);
      send({ type: 'reset' });
    },
  });
  hud.setDir(dir);
  hud.setSpeed(SPEEDS[speedIdx]);

  let latest: Snapshot | null = null;
  let lastSaved = 0;
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type !== 'snapshot') return;
    const snap = e.data.snapshot;
    latest = snap;
    renderer.setSnapshot(snap);
    hud.setStats(snap);
    const now = Date.now();
    if (now - lastSaved > 3000) {
      lastSaved = now;
      writeSave(snap, renderer.getPlayer());
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && latest) writeSave(latest, renderer.getPlayer());
  });

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
    else send({ type: 'place', cell, module: tool, dir });
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const cell = cellAt(ev);
    if (cell < 0) return;
    dragging = true;
    lastCell = cell;
    buildAt(cell);
    canvas.setPointerCapture?.(ev.pointerId);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const cell = cellAt(ev);
    if (cell < 0 || cell === lastCell) return;
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
  });

  const endDrag = (ev: PointerEvent) => {
    dragging = false;
    lastCell = -1;
    canvas.releasePointerCapture?.(ev.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

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
