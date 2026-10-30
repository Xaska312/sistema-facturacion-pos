import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DiningEvent, DiningEventsService } from '../../core/realtime/dining-events.service';
import { chime } from '../../shared/sound';
import { KitchenPrinterService } from './kitchen-printer';

/**
 * Lo que corre en segundo plano en un restaurante mientras XASKA está abierto (Fases 12b-3 y 12b-4): la conexión a
 * los avisos en tiempo real (si el usuario atiende mesas o usa la pantalla de cocina), la impresora de comandas de este
 * equipo y el aviso con sonido a quien envió una comanda cuando la cocina la marca Lista.
 */
@Injectable({ providedIn: 'root' })
export class RestaurantLiveService {
  private readonly auth = inject(AuthService);
  private readonly events = inject(DiningEventsService);
  private readonly printer = inject(KitchenPrinterService);
  private readonly messages = inject(MessageService);
  private readonly injector = inject(Injector);

  private started = false;
  private alerts: Subscription | null = null;
  private watcher: { destroy(): void } | null = null;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.printer.start();
    // Se reconecta al cambiar de negocio o de permisos (cada renovación del token trae los permisos de nuevo).
    this.watcher = effect(() => {
      const live = this.auth.hasPermission('module:tables')
        && (this.auth.hasPermission('tables:operate') || this.auth.hasPermission('kitchen:view'));
      this.auth.tenantId();
      untracked(() => (live ? this.events.restart() : this.events.stop()));
    }, { injector: this.injector });
    this.alerts = this.events.events$
      .pipe(filter((e) => isReadyFor(e, this.auth.user()?.id ?? null)))
      .subscribe((e) => {
        chime();
        this.messages.add({
          severity: 'success',
          summary: `${e.label ?? 'Comanda'}: #${e.number ?? ''} lista`,
          detail: 'La cocina la marcó lista. Llévala a la mesa.',
          life: 10_000,
        });
      });
  }

  stop(): void {
    this.started = false;
    this.watcher?.destroy();
    this.watcher = null;
    this.alerts?.unsubscribe();
    this.alerts = null;
    this.events.stop();
    this.printer.stop();
  }
}

/** El aviso "Lista" es para quien envió la comanda. */
export function isReadyFor(event: DiningEvent, userId: string | null): boolean {
  return event.type === 'TICKET_STATUS' && event.status === 'READY' && userId !== null && event.userId === userId;
}
