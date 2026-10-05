import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { Branch, InventoryDocument, InventoryDocumentType, PageResponse } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { DOCUMENT_LABEL, DOCUMENT_ROUTE, documentNumber } from './labels';

/** Documentos de inventario (saldo inicial, ajustes, traslados y conteos) y acceso a crearlos. */
@Component({
  selector: 'app-inventory-documents',
  imports: [FormsModule, RouterLink, DatePipe, ButtonModule, DialogModule, DataTableComponent, HasPermissionDirective],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Movimientos de inventario</h1>
      <div class="flex flex-wrap gap-2">
        <ng-container *hasPermission="'inventory:adjust'">
          <a [routerLink]="['/app/inventario/nuevo', routes.INITIAL]"><p-button label="Saldo inicial" severity="secondary" [outlined]="true" /></a>
          <a [routerLink]="['/app/inventario/nuevo', routes.ADJUSTMENT]"><p-button label="Ajuste" severity="secondary" [outlined]="true" /></a>
          <a [routerLink]="['/app/inventario/nuevo', routes.COUNT]"><p-button label="Conteo físico" severity="secondary" [outlined]="true" /></a>
        </ng-container>
        <a *hasPermission="'inventory:transfer'" [routerLink]="['/app/inventario/nuevo', routes.TRANSFER]">
          <p-button label="Traslado" />
        </a>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mb-3">
      <select class="border rounded px-2 py-2 text-sm" [ngModel]="type" (ngModelChange)="type = $event; load(0)">
        <option value="">Todos los tipos</option>
        @for (t of types; track t) {
          <option [value]="t">{{ labels[t] }}</option>
        }
      </select>
      <select class="border rounded px-2 py-2 text-sm" [ngModel]="branchId" (ngModelChange)="branchId = $event; load(0)">
        <option value="">Todas las sucursales</option>
        @for (b of branches(); track b.id) {
          <option [value]="b.id">{{ b.name }}</option>
        }
      </select>
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    emptyText="Aún no hay movimientos" (pageChange)="load($event)">
      <ng-template #actions let-row>
        <p-button label="Ver" size="small" [text]="true" (onClick)="open(row)" />
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="detailOpen" [modal]="true" [style]="{ width: '56rem' }"
              [header]="detail() ? labels[detail()!.type] + ' ' + docNumber(detail()!.number) : 'Documento'">
      @if (detail(); as d) {
        <p class="text-sm text-muted mb-3">
          {{ d.createdAt | date: 'medium' }} · {{ d.branchName }}
          @if (d.targetBranchName) {
            → {{ d.targetBranchName }}
          }
          · {{ d.createdByName ?? '—' }}
          @if (d.reason) {
            · {{ d.reason }}
          }
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Producto</th><th class="p-2 text-right">Cantidad</th><th class="p-2">Unidad</th>
                @if (d.type === 'COUNT') {
                  <th class="p-2 text-right">Esperado</th><th class="p-2 text-right">Contado</th>
                  <th class="p-2 text-right">Diferencia</th>
                } @else {
                  <th class="p-2">Tipo</th><th class="p-2 text-right">Costo unit.</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (l of d.lines; track l.lineNo) {
                <tr class="border-t">
                  <td class="p-2"><span class="font-mono">{{ l.sku }}</span> {{ l.name }}</td>
                  <td class="p-2 text-right">{{ q(l.quantity) }}</td>
                  <td class="p-2">{{ l.unitCode }}</td>
                  @if (d.type === 'COUNT') {
                    <td class="p-2 text-right">{{ q(l.expectedQuantity) }}</td>
                    <td class="p-2 text-right">{{ q(l.countedQuantity) }}</td>
                    <td class="p-2 text-right" [class.text-danger]="(l.difference ?? 0) < 0"
                        [class.text-success]="(l.difference ?? 0) > 0">{{ q(l.difference) }}</td>
                  } @else {
                    <td class="p-2">{{ l.direction === 'IN' ? 'Entrada' : l.direction === 'OUT' ? 'Salida' : '' }}</td>
                    <td class="p-2 text-right">{{ cop(l.unitCost) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (d.notes) {
          <p class="text-sm mt-3"><span class="font-medium">Notas:</span> {{ d.notes }}</p>
        }
      }
    </p-dialog>
  `,
})
export class InventoryDocumentsComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly organization = inject(OrganizationApi);

  protected readonly labels = DOCUMENT_LABEL;
  protected readonly routes = DOCUMENT_ROUTE;
  protected readonly types: InventoryDocumentType[] = ['INITIAL', 'ADJUSTMENT', 'TRANSFER', 'COUNT'];
  protected readonly q = formatQuantity;
  protected readonly cop = formatCop;
  protected readonly docNumber = documentNumber;
  protected readonly branches = signal<Branch[]>([]);
  protected readonly page = signal<PageResponse<InventoryDocument> | null>(null);
  protected readonly detail = signal<InventoryDocument | null>(null);
  protected readonly loading = signal(true);
  protected type: InventoryDocumentType | '' = '';
  protected branchId = '';
  protected detailOpen = false;

  protected readonly trackById = (row: InventoryDocument): string => row.id;
  protected readonly columns: ColumnDef<InventoryDocument>[] = [
    { header: 'Número', cell: (d) => documentNumber(d.number), cellClass: 'font-mono' },
    { header: 'Fecha', cell: (d) => new Date(d.createdAt).toLocaleString('es-CO') },
    { header: 'Tipo', cell: (d) => DOCUMENT_LABEL[d.type] },
    { header: 'Sucursal', cell: (d) => (d.targetBranchName ? `${d.branchName} → ${d.targetBranchName}` : d.branchName ?? '') },
    { header: 'Motivo', cell: (d) => d.reason ?? '' },
    { header: 'Responsable', cell: (d) => d.createdByName ?? '—' },
  ];

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(0);
  }

  load(page: number): void {
    this.loading.set(true);
    this.api.documents(this.type || null, this.branchId || null, page).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(document: InventoryDocument): void {
    this.api.document(document.id).subscribe((full) => {
      this.detail.set(full);
      this.detailOpen = true;
    });
  }
}
