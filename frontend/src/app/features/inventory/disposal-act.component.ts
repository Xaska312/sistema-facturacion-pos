import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InventoryDocument } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime } from '../../shared/format';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { printReceipt } from '../../shared/receipt/receipt-prefs';
import { formatDay } from '../orders/order-text';
import { documentNumber } from './labels';

/**
 * Acta de baja (Fase 13-3, decisión 281): lo que se sacó del inventario por vencido, averiado o retirado del mercado,
 * con lote, vencimiento, cantidad y valor, cómo se dispuso (gestor de residuos) y espacio para las firmas de quien
 * responde y del testigo. Se imprime en hoja carta para el archivo de la inspección.
 */
@Component({
  selector: 'app-disposal-act',
  imports: [RouterLink, ButtonModule, PageHeaderComponent],
  template: `
    <app-page-header title="Acta de baja" description="Imprímela, fírmala y guárdala con el acta del gestor de residuos.">
      <a pButton routerLink="/app/inventario/movimientos" label="Movimientos" icon="pi pi-arrow-left" [text]="true"
         severity="secondary"></a>
      <p-button label="Imprimir" icon="pi pi-print" [disabled]="!doc()" (onClick)="print()" />
    </app-page-header>

    @if (doc(); as d) {
      <article class="receipt-print-root card max-w-3xl p-8 text-sm leading-relaxed act">
        <header class="flex flex-wrap justify-between gap-2 border-b pb-3 mb-4">
          <div>
            <p class="text-lg font-bold">{{ businessName() }}</p>
            <p>{{ d.branchName }}</p>
          </div>
          <div class="text-right">
            <p class="font-bold">ACTA DE BAJA {{ number(d.number) }}</p>
            <p>{{ when(d.createdAt) }}</p>
          </div>
        </header>
        <p class="mb-3">Se dan de baja del inventario los siguientes productos por el motivo
          <strong>{{ d.reason }}</strong>. Quedan fuera de la venta y se entregan para su disposición final como se indica
          abajo.</p>
        <table class="w-full border-collapse mb-4">
          <thead>
            <tr class="border-b text-left">
              <th class="py-1 pr-2">Producto</th>
              <th class="py-1 pr-2">Lote</th>
              <th class="py-1 pr-2">Vence</th>
              <th class="py-1 pr-2 text-right">Cantidad</th>
              <th class="py-1 text-right">Valor al costo</th>
            </tr>
          </thead>
          <tbody>
            @for (l of d.lines; track l.lineNo) {
              <tr class="border-b">
                <td class="py-1 pr-2"><span class="font-mono">{{ l.sku }}</span> {{ l.name }}</td>
                <td class="py-1 pr-2 font-mono">{{ l.lotNumber ?? 'Sin lote' }}</td>
                <td class="py-1 pr-2">{{ l.expirationDate ? day(l.expirationDate) : '—' }}</td>
                <td class="py-1 pr-2 text-right tabular-nums">{{ q(l.quantity) }} {{ l.unitCode }}</td>
                <td class="py-1 text-right tabular-nums">{{ cop((l.unitCost ?? 0) * l.baseQuantity) }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="font-semibold">
              <td colspan="4" class="py-1 pr-2 text-right">Total</td>
              <td class="py-1 text-right tabular-nums">{{ cop(total()) }}</td>
            </tr>
          </tfoot>
        </table>
        <p><strong>Disposición final:</strong> {{ d.disposalMethod }}</p>
        @if (d.notes) {
          <p><strong>Observaciones:</strong> {{ d.notes }}</p>
        }
        <div class="grid grid-cols-2 gap-8 mt-16">
          <div class="border-t pt-1">
            <p>{{ d.createdByName ?? '' }}</p>
            <p class="text-xs">Responsable (director técnico o regente)</p>
          </div>
          <div class="border-t pt-1">
            <p>{{ d.witnessName ?? '' }}</p>
            <p class="text-xs">Testigo</p>
          </div>
        </div>
      </article>
    } @else {
      <p class="text-muted p-4">Cargando…</p>
    }
  `,
  styles: [`
    @media print {
      .act { padding: 1.5cm; max-width: none; box-shadow: none; border: 0; }
    }
  `],
})
export class DisposalActComponent implements OnInit {
  /** Parámetro de ruta :id. */
  readonly id = input.required<string>();

  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly doc = signal<InventoryDocument | null>(null);
  protected readonly businessName = computed(() => this.auth.currentTenant()?.tradeName ?? '');
  protected readonly total = computed(() =>
    (this.doc()?.lines ?? []).reduce((sum, l) => sum + (l.unitCost ?? 0) * l.baseQuantity, 0));

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly day = formatDay;
  protected readonly when = formatDateTime;
  protected readonly number = documentNumber;

  ngOnInit(): void {
    this.api.document(this.id()).subscribe({
      next: (d) => {
        if (d.type !== 'DISPOSAL') {
          void this.router.navigate(['/app/inventario/movimientos']);
          return;
        }
        this.doc.set(d);
      },
      error: () => void this.router.navigate(['/app/inventario/movimientos']),
    });
  }

  protected print(): void {
    printReceipt();
  }
}
