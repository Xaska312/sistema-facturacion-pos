import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Category, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../shared/confirm';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';

@Component({
  selector: 'app-products',
  imports: [FormsModule, RouterLink, ButtonModule, DataTableComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Productos" description="Lo que vendes: precio, impuesto, unidad y códigos de barras.">
      @if (canManage) {
        <a pButton routerLink="/app/productos/importar" label="Importar CSV" icon="pi pi-upload" severity="secondary"
           [outlined]="true"></a>
        <a pButton routerLink="/app/productos/nuevo" label="Nuevo producto" icon="pi pi-plus"></a>
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="name,asc" caption="Productos" searchPlaceholder="Buscar por nombre, SKU o código de barras"
                    emptyIcon="pi pi-box" emptyTitle="Aún no hay productos"
                    emptyMessage="Crea tu primer producto o impórtalos todos desde un archivo CSV."
                    [emptyActionLabel]="canManage ? 'Crear producto' : null" (emptyAction)="create()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Categoría</span>
        <select class="border rounded-md px-2 py-2" [ngModel]="categoryId" (ngModelChange)="categoryId = $event; reloadFirstPage()">
          <option value="">Todas las categorías</option>
          @for (c of categories(); track c.id) {
            <option [value]="c.id">{{ c.name }}</option>
          }
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="includeInactive" (ngModelChange)="includeInactive = $event; reloadFirstPage()" />
        Ver inactivos
      </label>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)" />
        @if (canManage) {
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = inject(AuthService).hasPermission('products:manage');

  protected readonly page = signal<PageResponse<Product> | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected categoryId = '';
  protected includeInactive = false;
  protected query: TableQuery = initialQuery(20, 'name,asc');

  protected readonly trackById = (row: Product): string => row.id;
  protected readonly columns: ColumnDef<Product>[] = [
    { header: 'SKU', cell: (p) => p.sku, kind: 'mono', sortField: 'sku' },
    { header: 'Nombre', cell: (p) => p.name, sortField: 'name' },
    { header: 'Categoría', cell: (p) => p.categoryName, hideOnMobile: true },
    { header: 'Unidad', cell: (p) => p.baseUnitCode, hideOnMobile: true },
    { header: 'Impuesto', cell: (p) => p.taxCode, hideOnMobile: true },
    { header: 'Precio', cell: (p) => p.salePrice, kind: 'money', sortField: 'salePrice' },
    { header: 'Estado', cell: (p) => activeStatus(p.active), kind: 'status' },
  ];

  ngOnInit(): void {
    this.api.categories().subscribe((list) => this.categories.set(list.filter((c) => c.active)));
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api
      .products({
        ...toPageQuery(query),
        search: query.search,
        categoryId: this.categoryId || null,
        includeInactive: this.includeInactive,
      })
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
    void this.router.navigate(['/app/productos/nuevo']);
  }

  open(product: Product): void {
    void this.router.navigate(['/app/productos', product.id]);
  }

  toggle(product: Product): void {
    this.confirm.toggleActive({
      active: product.active,
      noun: 'producto',
      name: product.name,
      consequence: 'No se podrá vender hasta que lo actives de nuevo.',
      accept: () => this.api.setProductActive(product.id, !product.active).subscribe(() => this.load(this.query)),
    });
  }
}
