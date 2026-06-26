import { svgEl } from './icons';

export interface InspectRow {
  label: string;
  value: string;
  bar?: number; // 0..1 -> renders a fill bar under the row
  icon?: string; // icon key -> renders an icon before the label
  /** If present, render a <select> with these options instead of a value span. */
  options?: { value: string; label: string }[];
  /** The currently selected option value (used when options is set). */
  selected?: string;
  /** Callback when the user picks an option. */
  onChange?: (value: string) => void;
}
export interface Inspector {
  show(title: string, rows: InspectRow[]): void;
  hide(): void;
}

export function buildInspector(root: HTMLElement, onClose: () => void): Inspector {
  const el = document.createElement('div');
  el.className = 'dw-inspect dw-panel';
  const head = document.createElement('div');
  head.className = 'dw-ins-head';
  const title = document.createElement('div');
  title.className = 'dw-ins-title';
  const close = document.createElement('button');
  close.className = 'dw-ins-close';
  close.textContent = '✕';
  close.addEventListener('click', () => {
    el.classList.remove('show');
    onClose();
  });
  head.append(title, close);
  const body = document.createElement('div');
  body.className = 'dw-ins-body';
  el.append(head, body);
  root.append(el);

  return {
    show(t, rows) {
      title.textContent = t;
      body.innerHTML = '';
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'dw-ins-row';
        const k = document.createElement('span');
        k.className = 'dw-ins-k';
        if (r.icon) k.append(svgEl(r.icon));
        k.append(document.createTextNode(r.label));
        row.append(k);
        if (r.options && r.options.length > 0) {
          const sel = document.createElement('select');
          sel.className = 'dw-ins-select';
          for (const opt of r.options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === r.selected) o.selected = true;
            sel.append(o);
          }
          sel.addEventListener('change', () => r.onChange?.(sel.value));
          row.append(sel);
        } else {
          const v = document.createElement('span');
          v.className = 'dw-ins-v';
          v.textContent = r.value;
          row.append(v);
        }
        body.append(row);
        if (r.bar != null) {
          const bar = document.createElement('div');
          bar.className = 'dw-ins-bar';
          const fill = document.createElement('div');
          fill.className = 'dw-ins-bar-fill';
          fill.style.width = `${Math.round(Math.min(1, Math.max(0, r.bar)) * 100)}%`;
          bar.append(fill);
          body.append(bar);
        }
      }
      el.classList.add('show');
    },
    hide() {
      el.classList.remove('show');
    },
  };
}
