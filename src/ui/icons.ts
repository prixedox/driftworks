export const ICONS: Record<string, string> = {
  miner: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- pickaxe head -->
    <line x1="4" y1="20" x2="14" y2="10"/>
    <path d="M14 10 L19 5 Q21 3 22 4 Q22 6 20 7 L15 12"/>
    <path d="M12 12 L4 20"/>
  </svg>`,

  conveyor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- left roller -->
    <circle cx="4" cy="17" r="3"/>
    <!-- right roller -->
    <circle cx="20" cy="17" r="3"/>
    <!-- belt top -->
    <line x1="4" y1="14" x2="20" y2="14"/>
    <!-- belt bottom arc -->
    <path d="M4 20 Q12 22 20 20"/>
    <!-- chevrons -->
    <polyline points="8,11 11,8 14,11"/>
    <polyline points="13,11 16,8 19,11"/>
  </svg>`,

  smelter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- furnace body -->
    <rect x="5" y="10" width="14" height="11" rx="1"/>
    <!-- door opening -->
    <rect x="9" y="14" width="6" height="4" rx="1"/>
    <!-- flame -->
    <path d="M12 9 Q10 6 12 4 Q14 6 16 4 Q15 8 12 9Z"/>
  </svg>`,

  storage: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- crate body -->
    <rect x="3" y="7" width="18" height="14" rx="1"/>
    <!-- lid -->
    <rect x="2" y="5" width="20" height="4" rx="1"/>
    <!-- cross braces -->
    <line x1="12" y1="7" x2="12" y2="21"/>
    <line x1="3" y1="14" x2="21" y2="14"/>
  </svg>`,

  generator: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- bold lightning bolt in circle -->
    <circle cx="12" cy="12" r="9"/>
    <polyline points="14,4 10,12 14,12 10,20"/>
  </svg>`,

  erase: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- eraser shape -->
    <path d="M20 20H7L3 16l10-10 7 7-3 4z"/>
    <line x1="6" y1="17" x2="13" y2="10"/>
    <!-- base line -->
    <line x1="2" y1="22" x2="22" y2="22"/>
  </svg>`,

  inspect: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- magnifier circle -->
    <circle cx="10" cy="10" r="7"/>
    <!-- handle -->
    <line x1="15" y1="15" x2="21" y2="21"/>
    <!-- cross hair inside -->
    <line x1="10" y1="7" x2="10" y2="13"/>
    <line x1="7" y1="10" x2="13" y2="10"/>
  </svg>`,

  pulse: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- baseline -->
    <polyline points="2,12 6,12 9,5 12,19 15,9 18,12 22,12"/>
  </svg>`,

  power: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- battery body -->
    <rect x="2" y="8" width="17" height="8" rx="2"/>
    <!-- battery cap -->
    <line x1="21" y1="11" x2="21" y2="13"/>
    <!-- fill indicator bars -->
    <line x1="5" y1="11" x2="5" y2="13"/>
    <line x1="9" y1="11" x2="9" y2="13"/>
    <line x1="13" y1="11" x2="13" y2="13"/>
  </svg>`,

  ore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- rough nugget polygon -->
    <polygon points="12,3 18,7 20,14 15,20 9,20 4,14 6,7"/>
    <!-- facet lines -->
    <line x1="12" y1="3" x2="12" y2="20"/>
    <line x1="6" y1="7" x2="18" y2="7"/>
  </svg>`,

  plate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- flat ingot / bar -->
    <rect x="3" y="9" width="18" height="6" rx="2"/>
    <!-- top face highlight (isometric bar) -->
    <line x1="3" y1="9" x2="21" y2="9"/>
    <!-- shine line -->
    <line x1="6" y1="12" x2="18" y2="12"/>
  </svg>`,

  science: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- flask body -->
    <path d="M9 3h6M10 3v6L6 17a2 2 0 0 0 1.8 2.9h8.4A2 2 0 0 0 18 17L14 9V3"/>
    <!-- bubbles inside -->
    <circle cx="10" cy="15" r="0.8" fill="currentColor" stroke="none"/>
    <circle cx="13" cy="17" r="0.8" fill="currentColor" stroke="none"/>
  </svg>`,

  assembler: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- gear outer circle -->
    <circle cx="12" cy="12" r="3"/>
    <!-- gear teeth -->
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
  </svg>`,

  lab: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- microscope base -->
    <rect x="5" y="19" width="14" height="2" rx="1"/>
    <!-- arm -->
    <line x1="12" y1="19" x2="12" y2="10"/>
    <line x1="8" y1="10" x2="16" y2="10"/>
    <!-- eyepiece -->
    <rect x="10" y="4" width="4" height="6" rx="1"/>
    <!-- stage -->
    <line x1="9" y1="15" x2="15" y2="15"/>
    <circle cx="12" cy="15" r="2"/>
  </svg>`,

  research: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- lightbulb -->
    <path d="M9 21h6M12 3a6 6 0 0 1 4.5 10c-.8.9-1.5 1.7-1.5 3H9c0-1.3-.7-2.1-1.5-3A6 6 0 0 1 12 3z"/>
    <line x1="12" y1="16" x2="12" y2="19"/>
  </svg>`,

  lock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- shackle -->
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    <!-- body -->
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <!-- keyhole -->
    <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
  </svg>`,
};

export function svgEl(name: string, cls = 'dw-icon'): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = ICONS[name] ?? '';
  return span;
}
