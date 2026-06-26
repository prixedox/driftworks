import type { Snapshot } from '../sim/types';
import { TECHS } from '../sim/data';

export interface ResearchPanel {
  update(s: Snapshot): void;
  toggle(): void;
}
export interface ResearchCallbacks {
  select: (tech: string) => void;
  contribute: () => void;
}

export function buildResearch(root: HTMLElement, cb: ResearchCallbacks): ResearchPanel {
  const panel = document.createElement('div');
  panel.className = 'dw-research dw-panel';
  const rows = new Map<string, { el: HTMLElement; status: HTMLElement; btn: HTMLButtonElement }>();
  TECHS.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'dw-tech';
    const name = document.createElement('div');
    name.className = 'dw-tech-name';
    name.textContent = `${t.name} — ${t.cost} ${t.costItem}`;
    const status = document.createElement('div');
    status.className = 'dw-tech-status';
    const btn = document.createElement('button');
    btn.className = 'dw-btn';
    btn.textContent = 'Research';
    btn.addEventListener('click', () => cb.select(t.id));
    row.append(name, status, btn);
    panel.append(row);
    rows.set(t.id, { el: row, status, btn });
  });
  const contribute = document.createElement('button');
  contribute.className = 'dw-btn dw-contribute';
  contribute.textContent = 'Contribute from inventory';
  contribute.addEventListener('click', () => cb.contribute());
  panel.append(contribute);
  root.append(panel);

  return {
    update(s) {
      const done = new Set(s.research.completed);
      for (const t of TECHS) {
        const r = rows.get(t.id)!;
        const unlockedPrereq = t.prereqs.every((p) => done.has(p));
        if (done.has(t.id)) r.status.textContent = '✓ done';
        else if (s.research.active === t.id) r.status.textContent = `researching ${s.research.progress}/${t.cost}`;
        else if (unlockedPrereq) r.status.textContent = 'available';
        else r.status.textContent = 'locked';
        r.btn.disabled = done.has(t.id) || !unlockedPrereq;
      }
      contribute.disabled = s.research.active === null;
    },
    toggle() {
      panel.classList.toggle('show');
    },
  };
}
