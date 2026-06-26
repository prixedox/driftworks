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
  const science = chip('science', '0');
  // Secondary items — hidden until the player has produced some, to keep the bar tidy.
  const copperOre = chip('copper_ore', '0');
  const copperPlate = chip('copper_plate', '0');
  const circuit = chip('circuit', '0');
  for (const c of [copperOre, copperPlate, circuit]) c.el.style.display = 'none';
  bar.append(pulse.el, powerWrap, ore.el, plate.el, science.el, copperOre.el, copperPlate.el, circuit.el);
  root.append(bar);

  const showWhenPositive = (c: { el: HTMLElement; value: HTMLElement }, n: number) => {
    c.value.textContent = String(n);
    c.el.style.display = n > 0 ? '' : 'none';
  };

  return {
    update(s) {
      pulse.value.textContent = String(s.pulse);
      const prod = Math.max(1, s.power.produced);
      powerFill.style.width = `${Math.min(100, (s.power.used / prod) * 100)}%`;
      powerFill.classList.toggle('deficit', s.power.deficit);
      powerNum.textContent = `${s.power.used}/${s.power.produced}`;
      ore.value.textContent = String(s.inventory.ore ?? 0);
      plate.value.textContent = String(s.inventory.plate ?? 0);
      science.value.textContent = String(s.inventory.science ?? 0);
      showWhenPositive(copperOre, s.inventory.copper_ore ?? 0);
      showWhenPositive(copperPlate, s.inventory.copper_plate ?? 0);
      showWhenPositive(circuit, s.inventory.circuit ?? 0);
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
