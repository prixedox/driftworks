export interface InspectRow {
  label: string;
  value: string;
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
        k.textContent = r.label;
        const v = document.createElement('span');
        v.className = 'dw-ins-v';
        v.textContent = r.value;
        row.append(k, v);
        body.append(row);
      }
      el.classList.add('show');
    },
    hide() {
      el.classList.remove('show');
    },
  };
}
