import type { ItemType, Snapshot } from '../sim/types';
import { ITEM_COLOR, ITEM_LABEL } from '../sim/types';
import { svgEl } from './icons';

/** One produced-total history array per item, for the sparklines. */
export type SparklineHistory = Record<ItemType, number[]>;

export interface StatsPanel {
  update(s: Snapshot, history: SparklineHistory): void;
  toggle(): void;
}

const RATE_WINDOW = 30; // mirrors world.ts; used only to clamp the per-min divisor
const SPARK_W = 72;
const SPARK_H = 22;
const ITEMS = Object.keys(ITEM_COLOR) as ItemType[];

/** Three.js 0xRRGGBB → CSS #rrggbb (single source of truth is ITEM_COLOR). */
function cssColor(hex: number): string {
  return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
}

export function buildStats(root: HTMLElement): StatsPanel {
  const panel = document.createElement('div');
  panel.className = 'dw-stats dw-panel';

  const header = document.createElement('div');
  header.className = 'dw-stats-header';
  header.textContent = 'Production';
  panel.append(header);

  const rows = {} as Record<ItemType, {
    producedEl: HTMLElement;
    consumedEl: HTMLElement;
    ctx: CanvasRenderingContext2D;
  }>;

  for (const item of ITEMS) {
    const row = document.createElement('div');
    row.className = 'dw-stats-row';

    const label = document.createElement('div');
    label.className = 'dw-stats-label';
    label.append(svgEl(item));
    const labelText = document.createElement('span');
    labelText.textContent = ITEM_LABEL[item];
    label.append(labelText);

    const nums = document.createElement('div');
    nums.className = 'dw-stats-nums';
    const producedEl = document.createElement('span');
    producedEl.className = 'dw-stats-produced';
    producedEl.textContent = '+0/min';
    const sep = document.createElement('span');
    sep.className = 'dw-stats-sep';
    sep.textContent = '·';
    const consumedEl = document.createElement('span');
    consumedEl.className = 'dw-stats-consumed';
    consumedEl.textContent = '-0/min';
    nums.append(producedEl, sep, consumedEl);

    const canvas = document.createElement('canvas');
    canvas.width = SPARK_W;
    canvas.height = SPARK_H;
    canvas.className = 'dw-sparkline';
    const ctx = canvas.getContext('2d')!;

    row.append(label, nums, canvas);
    panel.append(row);
    rows[item] = { producedEl, consumedEl, ctx };
  }

  // Power row
  const powerRow = document.createElement('div');
  powerRow.className = 'dw-stats-row dw-stats-power';
  powerRow.append(svgEl('power'));
  const powerText = document.createElement('span');
  powerText.className = 'dw-stats-powertext';
  powerText.textContent = '0 / 0 W';
  powerRow.append(powerText);
  panel.append(powerRow);

  root.append(panel);

  return {
    update(s, history) {
      // window totals → items/min. Clamp the divisor to elapsed ticks so the
      // first partial window doesn't understate the rate.
      const windowTicks = Math.max(1, Math.min(s.pulse, RATE_WINDOW));
      const ticksPerMin = 60000 / Math.max(1, s.pulseMs);
      const toPerMin = (n: number) => Math.round((n / windowTicks) * ticksPerMin);

      for (const item of ITEMS) {
        const r = rows[item];
        r.producedEl.textContent = `+${toPerMin(s.rates[item].produced)}/min`;
        r.consumedEl.textContent = `-${toPerMin(s.rates[item].consumed)}/min`;
        drawSparkline(r.ctx, history[item] ?? [], cssColor(ITEM_COLOR[item]));
      }

      powerText.textContent = `${s.power.used} / ${s.power.produced} W${s.power.deficit ? ' ⚠' : ''}`;
      powerRow.className = `dw-stats-row dw-stats-power${s.power.deficit ? ' deficit' : ''}`;
    },
    toggle() {
      panel.classList.toggle('show');
    },
  };
}

function drawSparkline(ctx: CanvasRenderingContext2D, data: number[], color: string): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length < 2) return;

  const max = Math.max(1, ...data);
  const step = canvas.width / (data.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = canvas.height - (data[i] / max) * (canvas.height - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // faint fill below the line
  ctx.lineTo((data.length - 1) * step, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
}
