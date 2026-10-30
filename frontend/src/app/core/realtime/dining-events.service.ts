import { Injectable, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
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
const MAX_WAIT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Conexión a los avisos de mesas y cocina (Fase 12b-4, decisión 271). Usa fetch (no EventSource) para mandar el token
 * en el encabezado: el token vive solo en memoria. Si se corta, reintenta con espera creciente (1 s, 2 s… hasta 30 s);
 * con 401 renueva la sesión antes. Mientras {@link connected} es false, las pantallas siguen consultando cada pocos
 * segundos como respaldo.
 */
@Injectable({ providedIn: 'root' })
export class DiningEventsService {
  private readonly auth = inject(AuthService);

  /** Conectado al servidor (las pantallas no necesitan consultar seguido). */
  readonly connected = signal(false);
  private readonly subject = new Subject<DiningEvent>();
  readonly events$ = this.subject.asObservable();

  private running = false;
  private abort: AbortController | null = null;

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    this.connected.set(false);
  }

  /** Vuelve a conectar (otro negocio u otros permisos). */
  restart(): void {
    this.stop();
    this.start();
  }

  private async loop(): Promise<void> {
    let failures = 0;
    while (this.running) {
      const token = this.auth.accessToken();
      if (!token) {
        await sleep(5000);
        continue;
      }
      const abort = new AbortController();
      this.abort = abort;
      try {
        const response = await fetch(URL, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: abort.signal,
        });
        if (response.status === 401) {
          await firstValueFrom(this.auth.renew()).catch(() => undefined);
          failures++;
        } else if (response.ok && response.body) {
          failures = 0;
          await this.read(response.body);
        } else {
          failures++;
        }
      } catch {
        failures++;
      }
      this.connected.set(false);
      if (!this.running) {
        return;
      }
      // Se cerró normalmente (cada 10 min): de una vez; si falló, espera creciente.
      await sleep(failures === 0 ? 500 : Math.min(MAX_WAIT_MS, 1000 * 2 ** Math.min(failures - 1, 5)));
    }
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !this.running) {
        return;
      }
      for (const message of parser.push(decoder.decode(value, { stream: true }))) {
        if (message.event === 'READY') {
          this.connected.set(true);
          continue;
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
