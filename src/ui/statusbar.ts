import type { Snapshot } from '../sim/types';
import { svgEl } from './icons';

export interface StatusBar {
  update(s: Snapshot): void;
}

export function buildStatusBar(root: HTMLElement): StatusBar {
  const bar = document.createElement('div');
  bar.className = 'dw-statusbar dw-panel';

  const pulse = chip('pulse', '0');
  const powerWrap = document.createElement('div');
  powerWrap.className = 'dw-stat dw-power';
  powerWrap.append(svgEl('power'));
  const powerFill = document.createElement('div');
  powerFill.className = 'dw-power-fill';
  const powerTrack = document.createElement('div');
  powerTrack.className = 'dw-power-track';
  powerTrack.append(powerFill);
  const powerNum = span('dw-num', '0/0');
  powerWrap.append(powerTrack, powerNum);

  const ore = chip('ore', '0');
  const plate = chip('plate', '0');
  bar.append(pulse.el, powerWrap, ore.el, plate.el);
  root.append(bar);

  return {
    update(s) {
      pulse.value.textContent = String(s.pulse);
      const prod = Math.max(1, s.power.produced);
      powerFill.style.width = `${Math.min(100, (s.power.used / prod) * 100)}%`;
      powerFill.classList.toggle('deficit', s.power.deficit);
      powerNum.textContent = `${s.power.used}/${s.power.produced}`;
      ore.value.textContent = String(s.storage.ore);
      plate.value.textContent = String(s.storage.plate);
    },
  };

  function chip(icon: string, v: string) {
    const el = document.createElement('div');
    el.className = 'dw-stat';
    el.append(svgEl(icon));
    const value = span('dw-num', v);
    el.append(value);
    return { el, value };
  }
  function span(cls: string, text: string) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }
}
