import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { OfflineSalesService } from '../../core/offline/offline-sales.service';
import { formatCop } from '../../shared/money';

/**
 * Estado del modo sin internet en Vender (decisión 332): sin conexión (se sigue vendiendo), ventas por enviar y las
 * que el servidor rechazó, con su motivo y "Reintentar".
 */
@Component({
  selector: 'app-offline-bar',
  imports: [ButtonModule],
  template: `
    @if (sales.offline()) {
      <div class="offline-bar bg-warning-soft text-warning-soft-fg" role="status">
        <i class="pi pi-wifi" aria-hidden="true"></i>
        <span class="font-bold">Sin conexión.</span>
        <span>Sigues vendiendo: las ventas se guardan en este equipo y se envían solas cuando vuelva el internet.</span>
        @if (sales.pending() > 0) {
          <span class="font-semibold">{{ countText(sales.pending()) }} por enviar.</span>
        }
      </div>
    } @else if (sales.pending() > 0) {
      <div class="offline-bar bg-surface-alt" role="status">
        <i class="pi pi-sync" [class.pi-spin]="sales.syncing()" aria-hidden="true"></i>
        <span>Enviando {{ countText(sales.pending()) }} hecha{{ sales.pending() === 1 ? '' : 's' }} sin conexión…</span>
      </div>
    }
    @if (sales.failed().length > 0) {
      <div class="offline-bar bg-danger-soft text-danger" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <span class="font-bold">{{ countText(sales.failed().length) }} sin conexión no se pudo enviar:</span>
        <ul class="basis-full text-sm">
          @for (f of sales.failed(); track f.key) {
            <li class="flex flex-wrap items-center gap-2 py-1">
              <span class="font-mono">{{ f.sale.documentNumber }}</span>
              <span>{{ cop(f.sale.total) }}</span>
              <span class="flex-1 min-w-40">{{ f.error }}</span>
              <p-button label="Reintentar" icon="pi pi-refresh" size="small" severity="secondary" [outlined]="true"
                        (onClick)="sales.retry(f.key)" />
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    .offline-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
      border-radius: 0.75rem; font-size: 0.875rem; }
  `,
})
export class OfflineBarComponent {
  protected readonly sales = inject(OfflineSalesService);
  protected readonly cop = formatCop;

  protected countText(n: number): string {
    return n === 1 ? '1 venta' : `${n} ventas`;
  }
}
