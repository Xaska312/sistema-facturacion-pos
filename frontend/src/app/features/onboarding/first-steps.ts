/**
 * Lista de primeros pasos para un negocio nuevo, calculada con datos reales (conteos del servidor).
 * Un conteo {@code null} significa "no se pudo saber" (sin permiso o error): ese paso se muestra pendiente.
 */
export interface FirstStepCounts {
  branches: number | null;
  categories: number | null;
  products: number | null;
  stockDocuments: number | null;
  /** Miembros activos o invitados (incluye al dueño). */
  team: number | null;
  cashSessions: number | null;
  sales: number | null;
}

export type FirstStepId = 'branch' | 'categories' | 'products' | 'stock' | 'team' | 'cash' | 'sale' | 'tables'
  | 'modifiers' | 'stations' | 'tips';

/** Conteos de un restaurante (Fase 12b, apertura al público): mesas, adiciones, estaciones e INC. */
export interface RestaurantStepCounts extends FirstStepCounts {
  tables: number | null;
  modifierGroups: number | null;
  /** Estaciones de cocina (la principal viene creada). */
  stations: number | null;
  /** 1 si el impuesto al consumo ya está activo. */
  consumptionTax: number | null;
}

export interface FirstStep {
  id: FirstStepId;
  title: string;
  description: string;
  actionLabel: string;
  route: string;
  /** Permiso para hacer el paso; sin él, el paso se muestra sin botón. */
  permission: string;
  done: boolean;
  optional: boolean;
}

export interface FirstStepsProgress {
  done: number;
  total: number;
  percent: number;
  /** Primer paso pendiente (el que se resalta). */
  next: FirstStep | null;
  complete: boolean;
}

const atLeast = (value: number | null, min: number): boolean => value !== null && value >= min;

export function buildFirstSteps(counts: FirstStepCounts): FirstStep[] {
  return [
    {
      id: 'branch', permission: 'branches:manage', route: '/app/sucursales', actionLabel: 'Ver sucursales',
      title: 'Revisa tu sucursal',
      description: 'Tu negocio ya trae una sucursal principal. Ponle la dirección o crea una por cada local.',
      done: atLeast(counts.branches, 1), optional: false,
    },
    {
      id: 'categories', permission: 'products:manage', route: '/app/catalogo', actionLabel: 'Crear categorías',
      title: 'Crea las categorías',
      description: 'Agrupa tus productos (bebidas, aseo…). Los impuestos de Colombia (IVA 19 %, 5 %, exento) ya vienen listos.',
      done: atLeast(counts.categories, 1), optional: false,
    },
    {
      id: 'products', permission: 'products:manage', route: '/app/productos', actionLabel: 'Cargar productos',
      title: 'Carga tus productos',
      description: 'Créalos uno a uno o impórtalos todos desde una plantilla de Excel.',
      done: atLeast(counts.products, 1), optional: false,
    },
    {
      id: 'stock', permission: 'inventory:adjust', route: '/app/inventario/nuevo/saldo-inicial',
      actionLabel: 'Registrar existencias',
      title: 'Registra las existencias iniciales',
      description: 'Cuenta lo que tienes hoy en el local y regístralo como saldo inicial, para vender con existencias.',
      done: atLeast(counts.stockDocuments, 1), optional: false,
    },
    {
      id: 'team', permission: 'members:manage', route: '/app/usuarios', actionLabel: 'Invitar usuarios',
      title: 'Invita a tu equipo',
      description: 'Cada cajero o vendedor entra con su propio usuario. Si trabajas solo, puedes saltar este paso.',
      done: atLeast(counts.team, 2), optional: true,
    },
    {
      id: 'cash', permission: 'cash:operate', route: '/pos', actionLabel: 'Abrir caja',
      title: 'Abre la caja',
      description: 'Cuenta el efectivo con el que empiezas el día (la base) y abre la caja.',
      done: atLeast(counts.cashSessions, 1), optional: false,
    },
    {
      id: 'sale', permission: 'sales:create', route: '/pos', actionLabel: 'Ir a vender',
      title: 'Haz tu primera venta',
      description: 'Escanea o toca los productos, cobra y entrega el tiquete.',
      done: atLeast(counts.sales, 1), optional: false,
    },
  ];
}

/**
 * Primeros pasos de un restaurante: mesas en vez de existencias (lo que se prepara no se cuenta en inventario),
 * adiciones con la plantilla del término, cocina y bar, propina e INC, el equipo (meseros y cocina) y la primera mesa.
 * {@code modules}: autoridades de módulos de la sesión (sin Adiciones o sin Cocina, esos pasos no salen).
 */
export function buildRestaurantSteps(counts: RestaurantStepCounts, modules: ReadonlySet<string>): FirstStep[] {
  const base = buildFirstSteps(counts);
  const step = (id: FirstStepId) => base.find((s) => s.id === id)!;
  const steps: FirstStep[] = [
    {
      id: 'tables', permission: 'tables:manage', route: '/app/mesas/configurar', actionLabel: 'Configurar mesas',
      title: 'Crea tus zonas y mesas',
      description: 'Salón, terraza, barra… y sus mesas numeradas de una vez.',
      done: atLeast(counts.tables, 1), optional: false,
    },
    {
      ...step('categories'),
      description: 'Entradas, platos fuertes, bebidas, postres… así asignas la cocina, el bar y el impuesto por categoría.',
    },
    { ...step('products'), title: 'Carga tu menú', description: 'Tus platos y bebidas con su precio, uno a uno o desde Excel.' },
  ];
  if (modules.has('module:modifiers')) {
    steps.push({
      id: 'modifiers', permission: 'modifiers:manage', route: '/app/adiciones', actionLabel: 'Crear adiciones',
      title: 'Crea las adiciones',
      description: 'Término de la carne, tamaños, salsas, "sin cebolla"… con las plantillas listas.',
      done: atLeast(counts.modifierGroups, 1), optional: true,
    });
  }
  if (modules.has('module:kitchen')) {
    steps.push({
      id: 'stations', permission: 'kitchen:manage', route: '/app/comandas/estaciones', actionLabel: 'Ver estaciones',
      title: 'Separa la cocina y el bar',
      description: 'La Cocina ya viene creada. Si tienes bar, créalo y asígnale las bebidas para que salgan en su comanda.',
      done: atLeast(counts.stations, 2), optional: true,
    });
  }
  steps.push(
    {
      id: 'tips', permission: 'settings:manage', route: '/app/ajustes', actionLabel: 'Ir a Ajustes',
      title: 'Propina e impuesto al consumo',
      description: 'Revisa la propina sugerida (10 %) y, si eres responsable de INC, aplícalo a tus categorías.',
      done: atLeast(counts.consumptionTax, 1), optional: true,
    },
    {
      ...step('team'),
      description: 'Invita a tus meseros (rol Mesero) y a la cocina (rol Cocina). Si trabajas solo, salta este paso.',
    },
    step('cash'),
    {
      ...step('sale'), permission: 'tables:operate', route: '/app/mesas', actionLabel: 'Ir a las mesas',
      title: 'Atiende tu primera mesa',
      description: 'Abre una mesa, pide, envía a cocina y cobra.',
    },
  );
  return steps;
}

/** Los pasos opcionales cuentan como hechos para terminar, pero no se resaltan como siguientes. */
export function firstStepsProgress(steps: readonly FirstStep[]): FirstStepsProgress {
  const required = steps.filter((s) => !s.optional);
  const done = steps.filter((s) => s.done).length;
  const next = required.find((s) => !s.done) ?? steps.find((s) => !s.done) ?? null;
  return {
    done,
    total: steps.length,
    percent: steps.length === 0 ? 100 : Math.round((done / steps.length) * 100),
    next,
    complete: required.every((s) => s.done),
  };
}

/** "Ocultar la lista" se recuerda en este equipo, por usuario y negocio (preferencia de interfaz). */
export function firstStepsKey(userId: string, tenantId: string): string {
  return `pos.first-steps.${userId}.${tenantId}`;
}

export function isFirstStepsDismissed(key: string, storage: Storage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(key) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissFirstSteps(key: string, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, 'dismissed');
  } catch {
    // Sin almacenamiento: la lista se oculta solo hasta recargar.
  }
}

export function restoreFirstSteps(key: string, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Sin almacenamiento: nada que restaurar.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
