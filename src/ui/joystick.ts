/** A virtual thumbstick for walking on touch devices (also draggable with a mouse). */
export function buildJoystick(root: HTMLElement, onMove: (x: number, y: number) => void): void {
  const base = document.createElement('div');
  base.className = 'dw-joy';
  const knob = document.createElement('div');
  knob.className = 'dw-joy-knob';
  base.appendChild(knob);
  root.appendChild(base);
  const R = 38; // max knob travel
  let active = false;

  const update = (ev: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    let dx = ev.clientX - (rect.left + rect.width / 2);
    let dy = ev.clientY - (rect.top + rect.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > R) {
      dx = (dx / mag) * R;
      dy = (dy / mag) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, dy / R);
  };
  const end = (ev: PointerEvent) => {
    active = false;
    knob.style.transform = 'translate(0,0)';
    onMove(0, 0);
    base.releasePointerCapture?.(ev.pointerId);
  };
  base.addEventListener('pointerdown', (ev) => {
    active = true;
    base.setPointerCapture?.(ev.pointerId);
    update(ev);
  });
  base.addEventListener('pointermove', (ev) => {
    if (active) update(ev);
  });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}
