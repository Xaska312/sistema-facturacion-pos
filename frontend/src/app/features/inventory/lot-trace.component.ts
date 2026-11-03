import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi, LotTrace } from '../../core/api/inventory.api';
import { formatDateTime } from '../../shared/format';
import { formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { formatDay } from '../orders/order-text';
import { MOVEMENT_LABEL } from './labels';

/**
 * Trazabilidad de un lote (Fase 13-3, decisión 281): de qué compra entró (proveedor y factura) y cada salida (ventas con
 * su cliente, traslados, bajas, devoluciones). Es lo que se pide ante una alerta sanitaria o un retiro del mercado.
 */
@Component({
  selector: 'app-lot-trace',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent],
  template: `
    <app-page-header title="Trazabilidad de un lote"
                     description="De quién lo compraste y a quién se vendió. Úsalo ante una alerta sanitaria o un retiro del mercado.">
      <a pButton routerLink="/app/inventario/vencimientos" label="Vencimientos" icon="pi pi-arrow-left" [text]="true"
         severity="secondary"></a>
    </app-page-header>

    <section class="card p-4 max-w-5xl grid gap-3 md:grid-cols-3 items-end">
      <div class="flex flex-col gap-1 md:col-span-2">
        <span class="text-sm font-medium">Producto</span>
        @if (product(); as p) {
          <div class="flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2">
            <span class="font-mono text-sm text-muted">{{ p.sku }}</span> {{ p.name }}
            <p-button label="Cambiar" size="small" [text]="true" (onClick)="product.set(null); trace.set(null)" />
          </div>
        } @else {
          <form class="flex gap-2" (ngSubmit)="search()">
            <input pInputText name="productSearch" class="flex-1" [(ngModel)]="text" aria-label="Buscar producto"
                   placeholder="Nombre, SKU o principio activo" />
            <p-button type="submit" label="Buscar" [loading]="searching()" />
          </form>
          @if (results().length > 0) {
            <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
              @for (r of results(); track r.id) {
                <li><button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt"
                            (click)="product.set(r); results.set([])">
                  <span class="font-mono">{{ r.sku }}</span> {{ r.name }}</button></li>
              }
            </ul>
          }
        }
      </div>
      <form class="flex gap-2" (ngSubmit)="find()">
        <label class="flex flex-col gap-1 flex-1">
          <span class="text-sm font-medium">Lote</span>
          <input pInputText name="lot" class="uppercase" maxlength="40" [(ngModel)]="lot" placeholder="L-12345" />
        </label>
        <p-button type="submit" label="Trazar" class="self-end" [disabled]="!product() || !lot.trim()" [loading]="loading()" />
      </form>
    </section>

    @if (trace(); as t) {
      <section class="card p-4 mt-4 max-w-5xl">
        <h2 class="font-bold tracking-tight">{{ t.name }} · lote {{ t.lotNumber }}</h2>
        <p class="text-sm text-muted mb-3">Vence {{ t.expirationDate ? day(t.expirationDate) : 'sin fecha' }} ·
          comprado {{ q(t.received) }} · vendido {{ q(t.sold) }} · hay {{ q(t.onHand) }} {{ t.unitCode }}</p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Movimientos del lote</caption>
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Fecha</th>
                <th class="p-2">Movimiento</th>
                <th class="p-2">Documento</th>
                <th class="p-2">Cliente o proveedor</th>
                <th class="p-2">Sucursal</th>
                <th class="p-2 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              @for (e of t.entries; track $index) {
                <tr class="border-t">
                  <td class="p-2 whitespace-nowrap">{{ when(e.at) }}</td>
                  <td class="p-2">{{ movement(e.type) }}</td>
                  <td class="p-2">{{ e.document ?? '—' }}</td>
                  <td class="p-2">{{ e.party ?? '—' }}</td>
                  <td class="p-2">{{ e.branchName }}</td>
                  <td class="p-2 text-right tabular-nums" [class.text-danger]="e.quantity < 0">{{ q(e.quantity) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
})
export class LotTraceComponent implements OnInit {
  /** ?producto=id&lote=X desde Vencimientos. */
  readonly producto = input<string>();
  readonly lote = input<string>();

  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  protected readonly product = signal<Product | null>(null);
  protected readonly results = signal<Product[]>([]);
  protected readonly searching = signal(false);
  protected readonly loading = signal(false);
  protected readonly trace = signal<LotTrace | null>(null);
  protected text = '';
  protected lot = '';

  protected readonly q = formatQuantity;
  protected readonly day = formatDay;
  protected readonly when = formatDateTime;

  ngOnInit(): void {
    const id = this.producto();
    this.lot = this.lote() ?? '';
    if (id) {
      this.catalog.product(id, true).subscribe((p) => {
        this.product.set(p);
        if (this.lot) {
          this.find();
        }
      });
    }
  }

  protected movement(type: keyof typeof MOVEMENT_LABEL): string {
    return MOVEMENT_LABEL[type] ?? type;
  }

  search(): void {
    const text = this.text.trim();
    if (!text) {
      return;
    }
    this.searching.set(true);
    this.catalog.products({ page: 0, size: 10, search: text }).subscribe({
      next: (page) => {
        this.searching.set(false);
        const found = page.content.filter((p) => p.tracksLots);
        if (found.length === 1) {
          this.product.set(found[0]);
        } else {
          this.results.set(found);
        }
      },
      error: () => this.searching.set(false),
    });
  }

  find(): void {
    const product = this.product();
    if (!product || !this.lot.trim()) {
      return;
    }
    this.loading.set(true);
    this.api.trace(product.id, this.lot.trim()).subscribe({
      next: (t) => {
        this.trace.set(t);
        this.loading.set(false);
      },
      error: () => {
        this.trace.set(null);
        this.loading.set(false);
      },
    });
  }
}
