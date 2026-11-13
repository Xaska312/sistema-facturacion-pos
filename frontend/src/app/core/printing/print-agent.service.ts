import { Injectable, computed, signal } from '@angular/core';

/**
 * XASKA Impresora (decisión 286): el programa del computador de la caja que imprime directo en la térmica y abre el
 * cajón. Se le habla con fetch (no con HttpClient: así el token de la sesión nunca le llega) en 127.0.0.1:17777.
 */
export const AGENT_URL = 'http://127.0.0.1:17777';
export const AGENT_DOWNLOAD = '/descargas/XASKA-Impresora.exe';

/** Preferencias de impresión de este equipo (cada caja tiene su impresora). */
export interface PrinterPrefs {
  /**
   * Este equipo usa XASKA Impresora (se encontró alguna vez en Ajustes). Sin esto la app ni lo busca: así no se le
   * pregunta al navegador por los dispositivos del equipo en los computadores que no lo tienen.
   */
  enabled: boolean;
  /** Nombre de la impresora en Windows; null = la predeterminada. */
  printer: string | null;
  /** Imprimir el tiquete solo al cobrar. */
  autoPrint: boolean;
  /** Abrir el cajón al cobrar con efectivo. */
  drawerOnCash: boolean;
  /** Imprimir sin tildes (impresoras sin la página 850). */
  plain: boolean;
  /** Tecla que abre el cajón en Vender (decisión 342); '' = ninguna. */
  drawerKey: DrawerKey;
}

/**
 * Teclas que se pueden asignar al cajón. Solo teclas de función libres: F1, F2 y F4 ya son de Vender y F5, F11 y F12
 * son del navegador (recargar, pantalla completa, herramientas).
 */
export const DRAWER_KEYS = ['F3', 'F6', 'F7', 'F8', 'F9', 'F10'] as const;
export type DrawerKey = (typeof DRAWER_KEYS)[number] | '';
export const DEFAULT_DRAWER_KEY: DrawerKey = 'F8';

function drawerKeyOf(v: unknown): DrawerKey {
  return v === '' || (DRAWER_KEYS as readonly unknown[]).includes(v) ? (v as DrawerKey) : DEFAULT_DRAWER_KEY;
}

export type AgentState = 'unknown' | 'checking' | 'missing' | 'ready';

const KEY = 'xaska.printer';
const DEFAULTS: PrinterPrefs = { enabled: false, printer: null, autoPrint: false, drawerOnCash: true, plain: false,
  drawerKey: DEFAULT_DRAWER_KEY };

export function loadPrinterPrefs(): PrinterPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const v = JSON.parse(raw) as Partial<PrinterPrefs>;
    return {
      enabled: v.enabled === true,
      printer: typeof v.printer === 'string' && v.printer ? v.printer : null,
      autoPrint: v.autoPrint === true,
      drawerOnCash: v.drawerOnCash !== false,
      plain: v.plain === true,
      drawerKey: drawerKeyOf(v.drawerKey),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePrinterPrefs(prefs: PrinterPrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento (modo privado): vale mientras la pestaña siga abierta.
  }
}

/** Bytes a base64 (así los recibe el programa en JSON). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

@Injectable({ providedIn: 'root' })
export class PrintAgentService {
  readonly state = signal<AgentState>('unknown');
  readonly printers = signal<string[]>([]);
  readonly defaultPrinter = signal<string | null>(null);
  readonly version = signal<string | null>(null);
  readonly prefs = signal<PrinterPrefs>(loadPrinterPrefs());

  /** La impresora que se usa: la elegida o la predeterminada de Windows. */
  readonly printerName = computed(() => this.prefs().printer ?? this.defaultPrinter());
  /** Hay programa y una impresora: se imprime directo. */
  readonly ready = computed(() => this.state() === 'ready' && !!this.printerName());

  private checking: Promise<boolean> | null = null;

  /** Busca el programa (1,5 s como mucho). Devuelve si está listo. */
  check(): Promise<boolean> {
    if (this.checking) {
      return this.checking;
    }
    this.state.set('checking');
    this.checking = (async () => {
      try {
        const res = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        const body = (await res.json()) as { app?: string; version?: string; printers?: string[]; default?: string };
        if (body.app !== 'xaska-impresora') {
          throw new Error('otro programa');
        }
        this.printers.set(body.printers ?? []);
        this.defaultPrinter.set(body.default || null);
        this.version.set(body.version ?? null);
        this.state.set('ready');
        if (!this.prefs().enabled) {
          this.update({ enabled: true });
        }
        return this.ready();
      } catch {
        this.state.set('missing');
        return false;
      } finally {
        this.checking = null;
      }
    })();
    return this.checking;
  }

  /** Lo busca solo si este equipo lo usa y aún no se sabe (para no preguntar en cada venta). */
  async ensure(): Promise<boolean> {
    if (!this.prefs().enabled) {
      return false;
    }
    return this.state() === 'ready' ? this.ready() : this.check();
  }

  update(changes: Partial<PrinterPrefs>): void {
    const next = { ...this.prefs(), ...changes };
    this.prefs.set(next);
    savePrinterPrefs(next);
  }

  /** Manda el tiquete; lanza un Error con el mensaje para el cajero si no se pudo. */
  async print(bytes: Uint8Array, doc = 'Tiquete XASKA'): Promise<void> {
    await this.send('/print', { printer: this.printerName() ?? '', data: toBase64(bytes), doc });
  }

  /** Abre el cajón (lo conectado a la impresora). */
  async openDrawer(): Promise<void> {
    await this.send('/drawer', { printer: this.printerName() ?? '' });
  }

  private async send(path: string, body: object): Promise<void> {
    let res: Response;
    try {
      res = await fetch(AGENT_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.state.set('missing');
      throw new Error('XASKA Impresora no responde en este computador. Revisa que esté instalado (Ajustes → Impresora de este equipo).');
    }
    if (!res.ok) {
      let message = 'La impresora no recibió el trabajo.';
      try {
        message = ((await res.json()) as { error?: string }).error ?? message;
      } catch {
        // Sin cuerpo: queda el mensaje general.
      }
      throw new Error(message);
    }
  }
}
