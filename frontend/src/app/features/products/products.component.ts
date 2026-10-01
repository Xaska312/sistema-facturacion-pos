import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { Category, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop } from '../../shared/money';

@Component({
  selector: 'app-products',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, TagModule, DataTableComponent, HasPermissionDirective],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Productos</h1>
      <div class="flex gap-2" *hasPermission="'products:manage'">
        <a routerLink="/app/productos/importar"><p-button label="Importar CSV" severity="secondary" [outlined]="true" /></a>
        <a routerLink="/app/productos/nuevo"><p-button label="Nuevo producto" /></a>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mb-3 items-center">
      <input pInputText class="w-full md:w-80" placeholder="Buscar por nombre, SKU o código de barras"
             [(ngModel)]="search" (keyup.enter)="load(0)" />
      <select class="border rounded px-2 py-2 text-sm" [ngModel]="categoryId"
              (ngModelChange)="categoryId = $event; load(0)">
        <option value="">Todas las categorías</option>
        @for (c of categories(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="includeInactive" (ngModelChange)="includeInactive = $event; load(0)" />
        Ver inactivos
      </label>
      <p-button label="Buscar" [text]="true" (onClick)="load(0)" />
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    emptyText="No hay productos" (pageChange)="load($event)">
      <ng-template #actions let-row>
        <span class="inline-flex gap-2 items-center">
          @if (!row.active) {
            <p-tag value="Inactivo" severity="secondary" />
          }
          <p-button label="Ver" size="small" [text]="true" (onClick)="open(row)" />
          <p-button *hasPermission="'products:manage'" [label]="row.active ? 'Desactivar' : 'Activar'" size="small"
                    [text]="true" [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        </span>
      </ng-template>
    </app-data-table>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);

  protected readonly page = signal<PageResponse<Product> | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected search = '';
  protected categoryId = '';
  protected includeInactive = false;
  private currentPage = 0;

  protected readonly trackById = (row: Product): string => row.id;
  protected readonly columns: ColumnDef<Product>[] = [
    { header: 'SKU', cell: (p) => p.sku, cellClass: 'font-mono' },
    { header: 'Nombre', cell: (p) => p.name },
    { header: 'Categoría', cell: (p) => p.categoryName ?? '—' },
    { header: 'Unidad', cell: (p) => p.baseUnitCode ?? '' },
    { header: 'Precio', cell: (p) => formatCop(p.salePrice) },
    { header: 'Impuesto', cell: (p) => p.taxCode ?? '' },
  ];

  ngOnInit(): void {
    this.api.categories().subscribe((list) => this.categories.set(list.filter((c) => c.active)));
    this.load(0);
  }

  load(page: number): void {
    this.currentPage = page;
    this.loading.set(true);
    this.api
      .products({
        page,
        size: 20,
        sort: 'name,asc',
        search: this.search.trim() || null,
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

  open(product: Product): void {
    void this.router.navigate(['/app/productos', product.id]);
  }

  toggle(product: Product): void {
    const activate = !product.active;
    this.confirm.confirm({
      header: activate ? 'Activar producto' : 'Desactivar producto',
      message: activate
        ? `¿Activar ${product.name}?`
        : `¿Desactivar ${product.name}? No se podrá vender hasta que lo actives de nuevo.`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.api.setProductActive(product.id, activate).subscribe(() => this.load(this.currentPage)),
    });
  }
}
