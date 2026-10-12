import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PageResponse, ProductModelRow } from '../../../core/api/api.models';
import { CatalogApi } from '../../../core/api/catalog.api';
import { permissionFlag } from '../../../core/auth/permission-flag';
import { ConfirmService } from '../../../shared/confirm';
import { LatestRequest } from '../../../shared/latest-request';
import { PageHeaderComponent } from '../../../shared/page-header.component';
import { activeStatus } from '../../../shared/status';
import { DataTableComponent } from '../../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../../shared/table/table';

/** Productos con tallas y colores (fase 8d): cada modelo agrupa sus variantes talla × color. */
@Component({
  selector: 'app-product-models',
  imports: [FormsModule, RouterLink, ButtonModule, DataTableComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Productos con tallas"
                     description="Calzado y ropa: un modelo con su precio y una variante por cada talla y color. Cada variante se vende, se cuenta y tiene su propio código de barras.">
      <a pButton routerLink="/app/productos" label="Productos" icon="pi pi-arrow-left" severity="secondary"
         [text]="true"></a>
      <a pButton routerLink="/app/productos/tallas" label="Escalas de tallas" icon="pi pi-sliders-h"
         severity="secondary" [outlined]="true"></a>
      @if (canManage()) {
        <a pButton routerLink="/app/productos/modelos/nuevo" label="Nuevo modelo" icon="pi pi-plus"></a>
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="name,asc" caption="Modelos con tallas" searchPlaceholder="Buscar por nombre o prefijo"
                    emptyIcon="pi pi-th-large" emptyTitle="Aún no hay productos con tallas"
                    emptyMessage="Crea un modelo (p. ej. «Tenis Runner»), elige sus tallas y colores, y se crean todas las variantes con su código."
                    [emptyActionLabel]="canManage() ? 'Crear modelo' : null" (emptyAction)="create()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="includeInactive" (ngModelChange)="includeInactive = $event; reloadFirstPage()" />
        Ver inactivos
      </label>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)" />
        @if (canManage()) {
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>
  `,
})
export class ProductModelsComponent implements OnInit {
  private readonly latest = new LatestRequest();
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = permissionFlag('products:manage');

  protected readonly page = signal<PageResponse<ProductModelRow> | null>(null);
  protected readonly loading = signal(true);
  protected includeInactive = false;
  protected query: TableQuery = initialQuery(20, 'name,asc');

  protected readonly trackById = (row: ProductModelRow): string => row.id;
  protected readonly columns: ColumnDef<ProductModelRow>[] = [
    { header: 'Prefijo', cell: (m) => m.skuPrefix, kind: 'mono', sortField: 'skuPrefix' },
    { header: 'Nombre', cell: (m) => m.name, sortField: 'name' },
    { header: 'Categoría', cell: (m) => m.categoryName, hideOnMobile: true },
    { header: 'Escala', cell: (m) => m.sizeScaleName, hideOnMobile: true },
    { header: 'Variantes', cell: (m) => m.variants, kind: 'number' },
    { header: 'Precio', cell: (m) => m.salePrice, kind: 'money' },
    { header: 'Estado', cell: (m) => activeStatus(m.active), kind: 'status' },
  ];

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api
      .productModels({ ...toPageQuery(query), search: query.search, includeInactive: this.includeInactive })
      .pipe(this.latest.only())
      .subscribe({
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

  create(): void {
    void this.router.navigate(['/app/productos/modelos/nuevo']);
  }

  open(row: ProductModelRow): void {
    void this.router.navigate(['/app/productos/modelos', row.id]);
  }

  toggle(row: ProductModelRow): void {
    this.confirm.toggleActive({
      active: row.active,
      noun: 'modelo',
      name: row.name,
      consequence: 'Se desactivan también todas sus tallas: no se podrán vender hasta que lo actives de nuevo.',
      accept: () => this.api.setProductModelActive(row.id, !row.active).subscribe(() => this.load(this.query)),
    });
  }
}
