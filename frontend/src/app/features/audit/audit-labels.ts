import { AuditData } from '../../core/api/audit.api';

/**
 * Nombres en español de la auditoría. El backend tiene la misma lista para el CSV
 * ({@code audit/application/AuditLabels.java}): si se agrega una acción, actualizar ambos.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  audit: 'Auditoría',
  branch: 'Sucursal',
  business: 'Negocio',
  business_settings: 'Ajustes del negocio',
  cash_movement: 'Movimiento de caja',
  cash_register: 'Caja',
  cash_session: 'Turno de caja',
  category: 'Categoría',
  customer: 'Cliente',
  inventory_document: 'Documento de inventario',
  invitation: 'Invitación',
  member: 'Equipo',
  price_list: 'Lista de precios',
  product: 'Producto',
  report: 'Reporte',
  role: 'Rol',
  sale: 'Venta',
  session: 'Sesión',
  supplier: 'Proveedor',
  tax: 'Impuesto',
  unit: 'Unidad de medida',
};

/** Sustantivo en minúscula para "Creó producto", "Desactivó caja"… */
const NOUNS: Readonly<Record<string, string>> = {
  branch: 'sucursal',
  cash_register: 'caja',
  category: 'categoría',
  customer: 'cliente',
  member: 'miembro del equipo',
  price_list: 'lista de precios',
  product: 'producto',
  role: 'rol',
  supplier: 'proveedor',
  tax: 'impuesto',
  unit: 'unidad de medida',
};

const ACTIONS: Readonly<Record<string, string>> = {
  AUDIT_EXPORTED: 'Exportó la auditoría',
  BUSINESS_CLOSED: 'Eliminó (cerró) el negocio',
  BUSINESS_CREATED: 'Creó el negocio',
  BUSINESS_REACTIVATED: 'Reactivó el negocio',
  BUSINESS_SUSPENDED: 'Suspendió el negocio',
  CASH_MOVEMENT_CREATED: 'Registró un movimiento de caja',
  CASH_SESSION_CLOSED: 'Cerró caja',
  CASH_SESSION_OPENED: 'Abrió caja',
  INVENTORY_DOCUMENT_CREATED: 'Registró un documento de inventario',
  INVITATION_ACCEPTED: 'Aceptó una invitación',
  INVITATION_CREATED: 'Invitó a una persona',
  INVITATION_RESENT: 'Reenvió una invitación',
  INVITATION_REVOKED: 'Anuló una invitación',
  PRODUCTS_IMPORTED: 'Importó productos',
  REPORT_EXPORTED: 'Exportó un reporte',
  SALE_CREATED: 'Registró una venta',
  SALE_VOIDED: 'Anuló una venta',
  SESSION_ENDED: 'Cerró sesión',
  SESSION_STARTED: 'Entró al negocio',
  SETTINGS_UPDATED: 'Cambió los ajustes del negocio',
  STOCK_LEVELS_UPDATED: 'Cambió existencias mínimas y máximas',
  TENANT_PROVISIONED: 'Quedó como dueño del negocio',
};

const VERBS: Readonly<Record<string, string>> = {
  CREATED: 'Creó',
  UPDATED: 'Modificó',
  ACTIVATED: 'Activó',
  DEACTIVATED: 'Desactivó',
  DELETED: 'Eliminó',
};

/** Nombre de los datos guardados en el detalle; lo que no está aquí se muestra con su nombre técnico. */
const FIELDS: Readonly<Record<string, string>> = {
  active: 'Activo',
  address: 'Dirección',
  allowNegativeStock: 'Vender sin existencias',
  amount: 'Monto',
  branches: 'Sucursales',
  businessType: 'Tipo de negocio',
  by: 'Quién',
  cashRegisterId: 'Caja (id)',
  cashSessionId: 'Turno de caja (id)',
  categoryId: 'Categoría (id)',
  cityCode: 'Ciudad (código DANE)',
  code: 'Código',
  cost: 'Costo',
  counted: 'Contado',
  customerId: 'Cliente (id)',
  description: 'Descripción',
  difference: 'Diferencia',
  document: 'Documento',
  email: 'Correo',
  expected: 'Esperado',
  file: 'Archivo',
  from: 'Desde',
  items: 'Líneas',
  legalName: 'Razón social',
  maxStock: 'Existencia máxima',
  minStock: 'Existencia mínima',
  name: 'Nombre',
  number: 'Número',
  openingAmount: 'Base de efectivo',
  permissions: 'Permisos',
  phone: 'Teléfono',
  price: 'Precio',
  rate: 'Tarifa',
  reason: 'Motivo',
  roles: 'Roles',
  rows: 'Filas',
  sku: 'SKU',
  slug: 'Identificador',
  status: 'Estado',
  timezone: 'Zona horaria',
  to: 'Hasta',
  total: 'Total',
  tradeName: 'Nombre comercial',
  type: 'Tipo',
};

export function entityLabel(entity: string): string {
  return ENTITIES[entity] ?? entity;
}

export function actionLabel(action: string, entity: string | null = null): string {
  const known = ACTIONS[action];
  if (known) {
    return known;
  }
  const cut = action.lastIndexOf('_');
  const verb = cut < 0 ? undefined : VERBS[action.slice(cut + 1)];
  if (!verb) {
    return action;
  }
  const noun = entity ? NOUNS[entity] : undefined;
  return noun ? `${verb} ${noun}` : verb;
}

export function fieldLabel(field: string): string {
  return FIELDS[field] ?? field;
}

/** Valor legible de un dato guardado: vacío → "—", sí/no, listas y objetos en una línea. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : value.map((v) => displayValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export interface DataRow {
  field: string;
  label: string;
  before: string;
  after: string;
  /** Hay datos de antes y después, y este cambió. */
  changed: boolean;
}

/**
 * Filas del detalle: cada dato con su valor antes y después, en el orden en que se guardaron (primero los de
 * "después"). Solo se marca "cambió" cuando hay ambas versiones; en una creación todo es nuevo.
 */
export function dataRows(before: AuditData | null, after: AuditData | null): DataRow[] {
  const keys = [...Object.keys(after ?? {}), ...Object.keys(before ?? {})].filter((k, i, all) => all.indexOf(k) === i);
  const compare = before !== null && after !== null;
  return keys.map((field) => {
    const old = displayValue(before?.[field]);
    const now = displayValue(after?.[field]);
    return { field, label: fieldLabel(field), before: old, after: now, changed: compare && old !== now };
  });
}

/** Opciones de módulo para el filtro, ordenadas por nombre en español. */
export function entityOptions(actions: readonly { entity: string }[]): { value: string; label: string }[] {
  return [...new Set(actions.map((a) => a.entity))]
    .map((value) => ({ value, label: entityLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** Opciones de acción para el filtro (de un módulo, o de todos si no hay módulo). */
export function actionOptions(actions: readonly { entity: string; action: string }[], entity: string | null):
  { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const a of actions) {
    if (!entity || a.entity === entity) {
      seen.set(a.action, actionLabel(a.action, a.entity));
    }
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
