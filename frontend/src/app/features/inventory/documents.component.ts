import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { Branch, InventoryDocument, InventoryDocumentLine, InventoryDocumentType, PageResponse } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { DOCUMENT_LABEL, DOCUMENT_ROUTE, documentNumber } from './labels';

/** Documentos de inventario (saldo inicial, ajustes, traslados y conteos) y acceso a crearlos. */
@Component({
  selector: 'app-inventory-documents',
  imports: [FormsModule, RouterLink, DatePipe, ButtonModule, DialogModule, DataTableComponent, HasPermissionDirective,
    PageHeaderComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Movimientos de inventario"
                     description="Saldos iniciales, ajustes, traslados entre sucursales y conteos físicos.">
      <ng-container *hasPermission="'inventory:adjust'">
        <a pButton [routerLink]="['/app/inventario/nuevo', routes.INITIAL]" label="Saldo inicial" severity="secondary"
           [outlined]="true"></a>
        <a pButton [routerLink]="['/app/inventario/nuevo', routes.ADJUSTMENT]" label="Ajuste" severity="secondary"
           [outlined]="true"></a>
        <a pButton [routerLink]="['/app/inventario/nuevo', routes.COUNT]" label="Conteo físico" severity="secondary"
           [outlined]="true"></a>
      </ng-container>
      <a *hasPermission="'inventory:transfer'" pButton [routerLink]="['/app/inventario/nuevo', routes.TRANSFER]"
         label="Traslado" icon="pi pi-arrow-right-arrow-left"></a>
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    caption="Documentos de inventario" emptyIcon="pi pi-arrow-right-arrow-left"
                    emptyTitle="Aún no hay movimientos"
                    emptyMessage="Empieza con un saldo inicial para cargar las existencias que ya tienes."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Tipo de documento</span>
        <select class="border rounded-md px-2 py-2" [ngModel]="type" (ngModelChange)="type = $event; reloadFirstPage()">
          <option value="">Todos los tipos</option>
          @for (t of types; track t) {
            <option [value]="t">{{ labels[t] }}</option>
          }
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Sucursal</span>
        <select class="border rounded-md px-2 py-2" [ngModel]="branchId" (ngModelChange)="branchId = $event; reloadFirstPage()">
          <option value="">Todas las sucursales</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)" />
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
        <app-data-table [columns]="lineColumns()" [items]="d.lines" [trackBy]="lineKey" [pageSizeOptions]="[]"
                        caption="Líneas del documento">
          <ng-template appCell="product" let-row>
            <span class="font-mono">{{ row.sku }}</span> {{ row.name }}
          </ng-template>
          <ng-template appCell="difference" let-row>
            <span [class.text-danger]="(row.difference ?? 0) < 0" [class.text-success]="(row.difference ?? 0) > 0">
              {{ q(row.difference) }}
            </span>
          </ng-template>
        </app-data-table>
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
  protected query: TableQuery = initialQuery();
  protected readonly lineKey = (line: InventoryDocumentLine): number => line.lineNo;
  protected readonly lineColumns = computed<ColumnDef<InventoryDocumentLine>[]>(() => {
    const base: ColumnDef<InventoryDocumentLine>[] = [
      { header: 'Producto', cell: (l) => l.name, template: 'product' },
      { header: 'Cantidad', cell: (l) => l.quantity, kind: 'number' },
      { header: 'Unidad', cell: (l) => l.unitCode },
    ];
    if (this.detail()?.type === 'COUNT') {
      return [...base,
        { header: 'Esperado', cell: (l) => l.expectedQuantity, kind: 'number' },
        { header: 'Contado', cell: (l) => l.countedQuantity, kind: 'number' },
        { header: 'Diferencia', cell: (l) => l.difference, kind: 'number', template: 'difference' }];
    }
    return [...base,
      { header: 'Tipo', cell: (l) => (l.direction === 'IN' ? 'Entrada' : l.direction === 'OUT' ? 'Salida' : null) },
      { header: 'Costo unit.', cell: (l) => l.unitCost, kind: 'money' }];
  });
  protected readonly columns: ColumnDef<InventoryDocument>[] = [
    { header: 'Número', cell: (d) => documentNumber(d.number), kind: 'mono' },
    { header: 'Tipo', cell: (d) => DOCUMENT_LABEL[d.type] },
    { header: 'Fecha', cell: (d) => d.createdAt, kind: 'datetime' },
    { header: 'Sucursal', cell: (d) => (d.targetBranchName ? `${d.branchName} → ${d.targetBranchName}` : d.branchName) },
    { header: 'Motivo', cell: (d) => d.reason, hideOnMobile: true },
    { header: 'Responsable', cell: (d) => d.createdByName, hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.documents(this.type || null, this.branchId || null, query.page, query.size).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }

  open(document: InventoryDocument): void {
    this.api.document(document.id).subscribe((full) => {
      this.detail.set(full);
      this.detailOpen = true;
    });
  }
}
