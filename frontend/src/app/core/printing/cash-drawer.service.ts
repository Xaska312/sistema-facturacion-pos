import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CashApi } from '../api/cash.api';
import { problemMessage } from '../errors/problem';
import { PrintAgentService } from './print-agent.service';

/**
 * "Abrir cajón" sin una venta (decisión 286): primero queda en la auditoría (permiso cash:drawer y caja abierta) y
 * después XASKA Impresora manda el pulso al cajón. Lanza un Error con el mensaje para el cajero.
 */
@Injectable({ providedIn: 'root' })
export class CashDrawerService {
  private readonly cash = inject(CashApi);
  private readonly agent = inject(PrintAgentService);

  async open(reason: string | null): Promise<void> {
    if (!(await this.agent.ensure())) {
      throw new Error('Instala XASKA Impresora y elige la impresora en Ajustes → Impresora de este equipo.');
    }
    try {
      await firstValueFrom(this.cash.drawerOpened(reason));
    } catch (e: unknown) {
      throw new Error(problemMessage(e));
    }
    await this.agent.openDrawer();
  }
}
