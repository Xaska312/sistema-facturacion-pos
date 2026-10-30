/**
 * Íconos propios de XASKA (identidad, opción D "duotono desplazado"): una línea redondeada de 1,8 sobre una forma
 * del color de marca, corrida un poco hacia abajo y a la derecha. Cada ícono tiene su trazo y su forma de relleno
 * (en una cuadrícula de 24 × 24). Solo SVG en línea: sin fuentes de íconos ni archivos aparte.
 */
export interface XIconDef {
  /** Trazo (paths, círculos, rectángulos) en color de texto. */
  stroke: string;
  /** Forma de relleno, en el color de marca, que se desplaza detrás del trazo. */
  fill: string;
}

export const XICONS = {
  home: { stroke: '<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
    fill: '<path d="M5 10l7-5.5 7 5.5v10H5z"/>' },
  sell: { stroke: '<path d="M3 4h2l2.2 10.5a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    fill: '<path d="M6.2 8H20l-1.4 6.6a1 1 0 0 1-1 .7H8.2z"/>' },
  cash: { stroke: '<rect x="3" y="9" width="18" height="10" rx="1.5"/><path d="M7 9V5h10v4"/><path d="M3 15h18"/>',
    fill: '<rect x="3" y="9" width="18" height="10" rx="1.5"/>' },
  sales: { stroke: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    fill: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/>' },
  credit: { stroke: '<path d="M5 6a2 2 0 0 1 2-2h11v13H7a2 2 0 0 0-2 2z"/><path d="M5 19a2 2 0 0 0 2 2h11v-4"/><path d="M9 8h5"/>',
    fill: '<path d="M5 6a2 2 0 0 1 2-2h11v13H7a2 2 0 0 0-2 2z"/>' },
  orders: { stroke: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    fill: '<rect x="3" y="10" width="18" height="11" rx="2"/>' },
  quotes: { stroke: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
    fill: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/>' },
  'cash-history': { stroke: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
    fill: '<circle cx="12" cy="12" r="8.5"/>' },
  reports: { stroke: '<path d="M4 20h16M7 16v-4M12 16V8M17 16v-6"/>',
    fill: '<path d="M10.5 8h3v8h-3zM5.5 12h3v4h-3zM15.5 10h3v6h-3z"/>' },
  audit: { stroke: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    fill: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>' },
  products: { stroke: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
    fill: '<path d="M12 3l8 4.5L12 12 4 7.5z"/>' },
  catalog: { stroke: '<path d="M3 4h8l10 10-7 7L3 11z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    fill: '<path d="M3 4h8l10 10-7 7L3 11z"/>' },
  stock: { stroke: '<path d="M3 9 12 4l9 5v11H3z"/><path d="M7 20v-6h10v6M7 17h10"/>',
    fill: '<path d="M3 9 12 4l9 5v11H3z"/>' },
  movements: { stroke: '<path d="M4 8h15l-3-3M20 16H5l3 3"/>',
    fill: '<rect x="4" y="6" width="11" height="4" rx="2"/><rect x="9" y="14" width="11" height="4" rx="2"/>' },
  customers: { stroke: '<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16.5 13.5a5 5 0 0 1 4.5 5.5"/>',
    fill: '<circle cx="9" cy="8" r="3"/>' },
  suppliers: { stroke: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    fill: '<path d="M3 6h11v10H3z"/>' },
  branches: { stroke: '<path d="M4 21V5l8-2v18M12 8h8v13M2 21h20M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
    fill: '<path d="M4 21V5l8-2v18z"/>' },
  registers: { stroke: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 12h.5M12 12h.5M15.5 12h.5M8.5 16h.5M12 16h.5M15.5 16h.5"/>',
    fill: '<rect x="5" y="3" width="14" height="7" rx="2"/>' },
  users: { stroke: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    fill: '<circle cx="12" cy="8" r="4"/>' },
  roles: { stroke: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    fill: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>' },
  settings: { stroke: '<path d="M4 7h8.5M17.5 7H20M4 17h3M11 17h9"/><circle cx="9" cy="17" r="2"/><circle cx="15" cy="7" r="2"/>',
    fill: '<circle cx="9" cy="17" r="2"/><circle cx="15" cy="7" r="2"/>' },
  all: { stroke: '<rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/>',
    fill: '<rect x="4" y="4" width="6" height="6" rx="2"/>' },
  platform: { stroke: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.5M7 17h.5"/>',
    fill: '<rect x="3" y="4" width="18" height="6" rx="2"/>' },
} as const satisfies Record<string, XIconDef>;

export type XIconName = keyof typeof XICONS;

/** SVG completo (sin dimensiones: las pone el componente). Los trazos usan currentColor. */
export function xiconMarkup(name: XIconName): string {
  const icon: XIconDef = XICONS[name];
  return '<g class="xicon-fill" transform="translate(1.6 1.6)">' + icon.fill + '</g>' + icon.stroke;
}
