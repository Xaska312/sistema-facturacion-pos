import { CashSession, PaymentMethod, PosConfig, TenantSummary, UserSummary } from '../api/api.models';
import { AccessClaims } from '../auth/jwt';

/**
 * Lo que el equipo recuerda para abrir Vender sin internet (decisión 333): quién vende (usuario, negocio y permisos),
 * su caja abierta y lo que Vender necesita (ajustes y medios de pago). No guarda la contraseña ni el token: el token
 * vive solo en memoria y al volver la conexión se renueva con la cookie de siempre. Solo se guarda en el equipo donde
 * ese usuario tiene la caja abierta y vale 24 horas desde la última vez que hubo conexión.
 */
export interface OfflineBoot {
  savedAt: number;
  user: UserSummary;
  claims: AccessClaims;
  tenant: TenantSummary;
  session: CashSession;
  config: PosConfig;
  methods: PaymentMethod[];
  decimalUnitIds: string[];
}

const KEY = 'xaska.offline-boot';
export const OFFLINE_BOOT_MS = 24 * 60 * 60 * 1000;

export function saveOfflineBoot(boot: OfflineBoot): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(boot));
  } catch {
    // Sin almacenamiento: la app no abrirá sin internet en este equipo.
  }
}

/** Lo guardado si todavía vale (menos de 24 horas); si venció, se borra. */
export function readOfflineBoot(now = Date.now()): OfflineBoot | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) {
      return null;
    }
    const boot = JSON.parse(raw) as OfflineBoot;
    if (!boot?.user?.id || !boot.claims?.tid || !boot.session?.id || now - boot.savedAt > OFFLINE_BOOT_MS
      || boot.savedAt > now + 60_000) {
      clearOfflineBoot();
      return null;
    }
    return boot;
  } catch {
    return null;
  }
}

export function clearOfflineBoot(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // nada que borrar
  }
}
