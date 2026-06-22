import { World } from './world';
import type { Command, WorkerMessage } from './types';

// The sim worker. It owns the authoritative World and advances it on a fixed
// schedule. The schedule (wall clock) is NOT part of the simulation — only the
// number of advance() calls and the command order matter for determinism.

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const world = new World();
let pulseMs = 600;
let paused = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function post(): void {
  const msg: WorkerMessage = { type: 'snapshot', snapshot: world.snapshot(pulseMs, paused) };
  ctx.postMessage(msg);
}

function schedule(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(tick, pulseMs);
}

function tick(): void {
  if (!paused) {
    world.advance();
    post();
  }
  schedule();
}

ctx.onmessage = (e: MessageEvent<Command>) => {
  const cmd = e.data;
  switch (cmd.type) {
    case 'init':
    case 'reset':
      world.loadDemo();
      post();
      break;
    case 'load':
      world.loadSave(cmd.save);
      post();
      break;
    case 'place':
      world.place(cmd.cell, cmd.module, cmd.dir);
      post();
      break;
    case 'remove':
      world.remove(cmd.cell);
      post();
      break;
    case 'pause':
      paused = cmd.paused;
      post();
      break;
    case 'speed':
      pulseMs = cmd.pulseMs;
      break;
  }
};

schedule();
