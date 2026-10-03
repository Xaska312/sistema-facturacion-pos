import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Branch, KardexRow, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { formatCop, formatQuantity } from '../../shared/money';
import { MOVEMENT_LABEL, documentNumber } from './labels';

/** Kardex de un producto: movimientos con saldo después de cada uno. */
@Component({
  selector: 'app-kardex',
  imports: [FormsModule, RouterLink, DatePipe, ButtonModule],
  template: `
    <a routerLink="/app/inventario" class="text-sm text-blue-600 hover:underline">← Existencias</a>
    <h1 class="text-2xl font-semibold mb-1">Kardex</h1>
    @if (product(); as p) {
      <p class="text-slate-600 mb-4"><span class="font-mono">{{ p.sku }}</span> — {{ p.name }} · costo promedio
        {{ cop(p.cost) }} por {{ p.baseUnitCode }}</p>
    }

    <div class="flex flex-wrap gap-2 mb-3 items-end">
      <label class="flex flex-col gap-1 text-sm">
        <span>Sucursal</span>
        <select class="border rounded px-2 py-2" [(ngModel)]="branch">
          <option value="">Todas</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="from" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="to" />
      </label>
      <p-button label="Consultar" (onClick)="load(0)" />
    </div>

    <div class="bg-white rounded-xl shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left">
          <tr>
            <th class="p-3">Fecha</th><th class="p-3">Movimiento</th><th class="p-3">Documento</th>
            <th class="p-3">Sucursal</th><th class="p-3 text-right">Cantidad</th><th class="p-3 text-right">Saldo</th>
            <th class="p-3 text-right">Costo unit.</th><th class="p-3">Responsable</th><th class="p-3">Motivo</th>
          </tr>
        </thead>
        <tbody>
          @for (m of page()?.content ?? []; track m.entryNo) {
            <tr class="border-t">
              <td class="p-3 whitespace-nowrap">{{ m.createdAt | date: 'short' }}</td>
              <td class="p-3">{{ movementLabel[m.type] }}</td>
              <td class="p-3 font-mono">{{ docNumber(m.documentNumber) }}</td>
              <td class="p-3">{{ m.branchName }}</td>
              <td class="p-3 text-right font-mono" [class.text-red-700]="m.quantity < 0"
                  [class.text-green-700]="m.quantity > 0">{{ m.quantity > 0 ? '+' : '' }}{{ q(m.quantity) }}</td>
              <td class="p-3 text-right font-mono">{{ q(m.balanceAfter) }}</td>
              <td class="p-3 text-right">{{ cop(m.unitCost) }}</td>
              <td class="p-3">{{ m.createdByName ?? '—' }}</td>
              <td class="p-3">{{ m.reason ?? '' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="p-6 text-center text-slate-500">Sin movimientos en el periodo.</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (page(); as p) {
      @if (p.totalPages > 1) {
        <nav class="flex justify-end gap-3 mt-3 text-sm items-center">
          <span class="text-slate-500">Página {{ p.page + 1 }} de {{ p.totalPages }}</span>
          <button type="button" class="px-3 py-1 rounded border disabled:opacity-40" [disabled]="p.page === 0"
                  (click)="load(p.page - 1)">Más recientes</button>
          <button type="button" class="px-3 py-1 rounded border disabled:opacity-40"
                  [disabled]="p.page + 1 >= p.totalPages" (click)="load(p.page + 1)">Anteriores</button>
        </nav>
      }
    }
  `,
})
export class KardexComponent implements OnInit {
  /** Parámetro de ruta :productId. */
  readonly productId = input.required<string>();
  /** Parámetro de consulta ?branchId. */
  readonly branchId = input<string>();

  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);

  protected readonly movementLabel = MOVEMENT_LABEL;
  protected readonly q = formatQuantity;
  protected readonly cop = formatCop;
  protected readonly docNumber = documentNumber;
  protected readonly product = signal<Product | null>(null);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly page = signal<PageResponse<KardexRow> | null>(null);
  protected branch = '';
  protected from = '';
  protected to = '';

  ngOnInit(): void {
    this.branch = this.branchId() ?? '';
    this.catalog.product(this.productId()).subscribe((p) => this.product.set(p));
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(0);
  }

  load(page: number): void {
    this.api.kardex(this.productId(), this.branch || null, this.from || null, this.to || null, page)
      .subscribe((result) => this.page.set(result));
  }
}
