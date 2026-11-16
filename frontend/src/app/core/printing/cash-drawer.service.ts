import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CashApi } from '../api/cash.api';
import { problemMessage } from '../errors/problem';
import { PrintAgentService } from './print-agent.service';
import { AuthService } from '../auth/auth.service';
import { OfflineDrawerService } from '../offline/offline-drawer.service';
import { OfflineSalesService, isNetworkError } from '../offline/offline-sales.service';

/**
 * "Abrir cajón" sin una venta (decisión 286): primero queda en la auditoría (permiso cash:drawer y caja abierta) y
 * después XASKA Impresora manda el pulso al cajón. Lanza un Error con el mensaje para el cajero.
 *
 * Sin internet (decisión 352) el cajón se abre igual y el registro se guarda en el equipo para enviarlo al volver la
 * conexión: XASKA Impresora está en el mismo computador y no necesita internet.
 */
@Injectable({ providedIn: 'root' })
export class CashDrawerService {
  private readonly cash = inject(CashApi);
  private readonly agent = inject(PrintAgentService);
  private readonly auth = inject(AuthService);
  private readonly offlineSales = inject(OfflineSalesService);
  private readonly offlineDrawer = inject(OfflineDrawerService);

  async open(reason: string | null): Promise<void> {
    if (!(await this.agent.ensure())) {
      throw new Error('Instala XASKA Impresora y elige la impresora en Ajustes → Impresora de este equipo.');
    }
    if (this.offlineSales.offline() || this.auth.offlineBoot()) {
      await this.openOffline(reason);
      return;
    }
    try {
      await firstValueFrom(this.cash.drawerOpened(reason));
    } catch (e: unknown) {
      if (isNetworkError(e)) {
        this.offlineSales.noteNetworkError();
        await this.openOffline(reason);
        return;
      }
      throw new Error(problemMessage(e));
    }
    await this.agent.openDrawer();
  }

  private async openOffline(reason: string | null): Promise<void> {
    await this.agent.openDrawer();
    await this.offlineDrawer.record(reason);
  }
}
