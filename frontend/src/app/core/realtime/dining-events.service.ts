import { Injectable, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { QUICK_CLOSE_MS, newClientId, reconnectDelay, retryAfterMs } from './reconnect';
import { SseParser } from './sse-parser';

/** Aviso en tiempo real de mesas y cocina (espejo de DiningEvents del backend). */
export type DiningEventType = 'TAB_CHANGED' | 'TICKET_SENT' | 'TICKET_STATUS' | 'ITEM_VOIDED';

export interface DiningEvent {
  type: DiningEventType;
  branchId: string;
  tabId: string | null;
  ticketId: string | null;
  number: number | null;
  stationId: string | null;
  label: string | null;
  status: string | null;
  /** En "Lista": quien envió la comanda; en lo demás, quien hizo el cambio. */
  userId: string | null;
}

const URL = '/api/v1/dining/events';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cómo terminó una conexión que sí abrió. */
type StreamEnd = 'ended' | 'replaced' | 'stopped';

/**
 * Conexión a los avisos de mesas y cocina (Fase 12b-4, decisión 271). Usa fetch (no EventSource) para mandar el token
 * en el encabezado: el token vive solo en memoria. Si se corta, reintenta con espera creciente y al azar (decisión 291);
 * con 401 renueva la sesión antes y con 429 espera lo que pide el servidor. Mientras {@link connected} es false, las
 * pantallas siguen consultando cada pocos segundos como respaldo.
 *
 * <p>Cada persona tiene un tope de conexiones a la vez: si otra pantalla de la misma cuenta ocupa el lugar de esta, el
 * servidor manda {@code REPLACED} y esta pantalla **no se vuelve a conectar sola** ({@link replaced}): queda
 * consultando y con el botón "Recibir avisos aquí" ({@link takeOver}). Antes se reconectaba al medio segundo, sacaba a
 * otra y así en cadena hasta pasar el límite de solicitudes.
 */
@Injectable({ providedIn: 'root' })
export class DiningEventsService {
  private readonly auth = inject(AuthService);

  /** Conectado al servidor (las pantallas no necesitan consultar seguido). */
  readonly connected = signal(false);
  /** Otra pantalla de esta cuenta tiene los avisos en vivo; esta solo consulta hasta que se pidan aquí. */
  readonly replaced = signal(false);
  private readonly subject = new Subject<DiningEvent>();
  readonly events$ = this.subject.asObservable();

  /** Identifica esta pestaña: su conexión nueva reemplaza a la anterior sin sacar a otra pantalla. */
  private readonly clientId = newClientId();
  /** Cada arranque tiene su número: un ciclo viejo que aún esperaba no sigue en paralelo con el nuevo. */
  private generation = 0;
  private running = false;
  private abort: AbortController | null = null;
  private replacedTenant: string | null = null;

  start(): void {
    if (this.running || this.replaced()) {
      return;
    }
    this.running = true;
    void this.loop(++this.generation);
  }

  stop(): void {
    this.halt();
    this.replaced.set(false);
  }

  /** Vuelve a conectar (otro negocio u otros permisos). Si otra pantalla tiene los avisos en este negocio, no. */
  restart(): void {
    if (this.replaced() && this.auth.tenantId() === this.replacedTenant) {
      return;
    }
    this.stop();
    this.start();
  }

  /** "Recibir avisos aquí": esta pantalla vuelve a tomar los avisos (la más vieja de la cuenta los deja). */
  takeOver(): void {
    this.stop();
    this.start();
  }

  private halt(): void {
    this.running = false;
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.connected.set(false);
  }

  private async loop(generation: number): Promise<void> {
    const alive = () => this.running && this.generation === generation;
    let failures = 0;
    while (alive()) {
      const token = this.auth.accessToken();
      if (!token) {
        await sleep(5000);
        continue;
      }
      const abort = new AbortController();
      this.abort = abort;
      let waitAtLeast = 0;
      try {
        const openedAt = Date.now();
        const response = await fetch(`${URL}?client=${encodeURIComponent(this.clientId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: abort.signal,
        });
        if (response.status === 401) {
          await firstValueFrom(this.auth.renew()).catch(() => undefined);
          failures++;
        } else if (response.status === 429) {
          waitAtLeast = retryAfterMs(response.headers.get('Retry-After'));
          failures++;
        } else if (response.ok && response.body) {
          const end = await this.read(response.body, alive);
          if (end === 'replaced' && alive()) {
            this.replacedTenant = this.auth.tenantId();
            this.halt();
            this.replaced.set(true);
            return;
          }
          // Se cerró normalmente (cada 10 min). Si fue enseguida y sin decir por qué, algo anda mal: espera más.
          failures = Date.now() - openedAt < QUICK_CLOSE_MS ? failures + 1 : 0;
        } else {
          failures++;
        }
      } catch {
        failures++;
      }
      if (!alive()) {
        return;
      }
      this.connected.set(false);
      await sleep(reconnectDelay(failures, waitAtLeast, Math.random()));
    }
  }

  private async read(body: ReadableStream<Uint8Array>, alive: () => boolean): Promise<StreamEnd> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (!alive()) {
        return 'stopped';
      }
      if (done) {
        return 'ended';
      }
      for (const message of parser.push(decoder.decode(value, { stream: true }))) {
        if (message.event === 'READY') {
          this.connected.set(true);
          continue;
        }
        if (message.event === 'REPLACED') {
          void reader.cancel().catch(() => undefined);
          return 'replaced';
        }
        try {
          this.subject.next(JSON.parse(message.data) as DiningEvent);
        } catch {
          // Un aviso que no se entiende se ignora.
        }
      }
    }
  }
}
