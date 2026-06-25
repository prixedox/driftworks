export interface Toasts {
  push(text: string, kind?: 'info' | 'warn'): void;
}
export function buildToasts(root: HTMLElement): Toasts {
  const stack = document.createElement('div');
  stack.className = 'dw-toasts';
  root.append(stack);
  return {
    push(text, kind = 'info') {
      const t = document.createElement('div');
      t.className = `dw-toast ${kind}`;
      t.textContent = text;
      stack.append(t);
      setTimeout(() => t.classList.add('out'), 1400);
      setTimeout(() => t.remove(), 1900);
    },
  };
}
