import { TenantStatus } from '../../core/api/api.models';
import { SecurityEvent } from '../../core/api/platform.api';
import { StatusKey } from '../../shared/status';

/** Nombres de los eventos de seguridad (ver SecurityEvent.java). */
export const EVENT_LABEL: Readonly<Record<string, string>> = {
  REGISTERED: 'Cuenta creada',
  LOGIN_SUCCEEDED: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  ACCOUNT_LOCKED: 'Cuenta bloqueada por intentos',
  LOGOUT: 'Cierre de sesión',
  TENANT_ENTERED: 'Entró a un negocio',
  TENANT_ACCESS_DENIED: 'Acceso negado a un negocio',
  REFRESH_TOKEN_REUSED: 'Sesión reutilizada (posible robo)',
  RATE_LIMITED: 'Límite de solicitudes superado',
  TENANT_CREATED: 'Negocio creado',
  TENANT_PROVISIONING_FAILED: 'Falló la creación de un negocio',
  TENANT_SUSPENDED: 'Negocio suspendido',
  TENANT_REACTIVATED: 'Negocio reactivado',
  TENANT_CLOSED: 'Negocio cerrado por su dueño',
  TENANT_CLOSE_DENIED: 'Contraseña errada al cerrar un negocio',
};

/** Eventos que merecen atención (se resaltan en la lista). */
const WARNING_EVENTS: ReadonlySet<string> = new Set([
  'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'TENANT_ACCESS_DENIED', 'REFRESH_TOKEN_REUSED', 'RATE_LIMITED',
  'TENANT_PROVISIONING_FAILED', 'TENANT_CLOSE_DENIED',
]);

const REASON_LABEL: Readonly<Record<string, string>> = {
  UNKNOWN_EMAIL: 'correo no registrado',
  BAD_PASSWORD: 'contraseña incorrecta',
  LOCKED: 'cuenta bloqueada',
  INACTIVE: 'cuenta inactiva',
};

export function eventLabel(event: string): string {
  return EVENT_LABEL[event] ?? event;
}

export function isWarningEvent(event: string): boolean {
  return WARNING_EVENTS.has(event);
}

/** Detalle corto del evento: motivo del fallo, ruta del límite, hasta cuándo se bloqueó… */
export function eventDetail(e: Pick<SecurityEvent, 'event' | 'details'>): string | null {
  const d = e.details ?? {};
  const reason = typeof d['reason'] === 'string' ? d['reason'] : null;
  if ((e.event === 'LOGIN_FAILED' || e.event === 'TENANT_CLOSE_DENIED') && reason) {
    return REASON_LABEL[reason] ?? reason;
  }
  if (e.event === 'RATE_LIMITED' && typeof d['path'] === 'string') {
    return d['path'];
  }
  if (e.event === 'ACCOUNT_LOCKED' && typeof d['until'] === 'string') {
    return `hasta ${new Date(d['until']).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return reason;
}

export const TENANT_STATUS_LABEL: Readonly<Record<TenantStatus, string>> = {
  ACTIVE: 'Activo',
  PROVISIONING: 'Creando…',
  SUSPENDED: 'Suspendido',
  FAILED: 'Falló la creación',
};

/** Insignia del estado del negocio en la consola. */
export function tenantStatusKey(status: TenantStatus): StatusKey {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'SUSPENDED':
      return 'voided';
    case 'FAILED':
      return 'expired';
    default:
      return 'pending';
  }
}

/** Texto para los miembros de un negocio suspendido (pantalla de elegir negocio). */
export function suspendedMessage(reason: string | null | undefined, closedByOwner: boolean | undefined): string {
  if (closedByOwner) {
    return 'Su dueño lo eliminó. Los datos se conservan; para recuperarlo hay que pedirlo a soporte.';
  }
  const why = reason?.trim() ? `Motivo: ${reason.trim()}. ` : '';
  return `${why}Mientras esté suspendido nadie puede entrar. Si crees que es un error, comunícate con soporte.`;
}
