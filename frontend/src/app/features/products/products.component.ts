import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ButtonLinkComponent } from '../../shared/ui/button-link.component';
import { Category, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ConfirmService } from '../../shared/confirm';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { medicineTags } from './medicine-form';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { AskaNudgeComponent } from '../ai/aska-nudge.component';
import { AskaMomentsState } from '../ai/aska-moments-state';
import { MANUAL_PRODUCTS_TRIGGER } from '../ai/aska-nudge';

@Component({
  selector: 'app-products',
  imports: [AskaNudgeComponent, FormsModule, RouterLink, ButtonComponent, ButtonLinkComponent, DataTableComponent, PageHeaderComponent, CellTemplateDirective,
    XaskaIaLogoComponent],
  template: `
    <app-page-header title="Productos" [description]="'Lo que vendes: precio, impuesto, unidad y códigos de barras.'
                       + (hasVariants() ? ' Los productos con tallas y colores están en «Con tallas».' : '')">
      <!-- Solo con su módulo encendido (Fase 12a). -->
      @if (hasVariants()) {
        <a appButton routerLink="/app/productos/modelos" label="Con tallas" icon="pi pi-th-large" severity="secondary"
           [outlined]="true"></a>
      }
      @if (hasScale()) {
        <a appButton routerLink="/app/bascula" label="Báscula" icon="pi pi-calculator" severity="secondary"
           [outlined]="true"></a>
      }
      @if (canManage() && canAsk()) {
        <a routerLink="/app/productos/cargar-con-aska" class="aska-cta">
          <app-xaska-ia-logo size="btn" /> Cargar con Aska
        </a>
      }
      @if (canManage()) {
        <a appButton routerLink="/app/productos/importar" label="Importar desde Excel" icon="pi pi-file-excel" severity="secondary"
           [outlined]="true"></a>
        <a appButton routerLink="/app/productos/nuevo" label="Nuevo producto" icon="pi pi-plus"></a>
      }
    </app-page-header>

    @if (showNudge()) {
      <!-- Decisión 308: Aska en el momento del dolor. -->
      <app-aska-nudge class="mb-4" moment="products" [available]="canAsk()"
                      [title]="'Ya creaste ' + manualProducts() + ' productos a mano'"
                      withAi="Pásame una foto de la lista del proveedor o de tu cuaderno y los creo todos de una vez, con sus precios."
                      withoutAi="Con XASKA IA, Aska crea tus productos desde una foto de la lista del proveedor o de tu cuaderno."
                      action="Cargar con Aska" (act)="nudgeLoad()" (closed)="nudgeClosed.set(true)" />
    }

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="name,asc" caption="Productos"
                    [searchPlaceholder]="hasMedicines() ? 'Buscar por nombre, principio activo, SKU o código' : 'Buscar por nombre, SKU o código de barras'"
                    emptyIcon="pi pi-box" emptyTitle="Aún no hay productos"
                    emptyMessage="Crea tu primer producto o impórtalos todos desde una plantilla de Excel."
                    [emptyActionLabel]="canManage() ? 'Crear producto' : null" (emptyAction)="create()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Categoría</span>
        <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="categoryId" (ngModelChange)="categoryId = $event; reloadFirstPage()">
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
      <!-- Ficha del medicamento (Fase 13-1): principio activo y marcas (fórmula, antibiótico, nevera). -->
      <ng-template appCell="name" let-row>
        <span class="block">{{ row.name }}</span>
        @if (row.medicine?.activeIngredients) {
          <span class="block text-xs text-muted">{{ row.medicine.activeIngredients }}</span>
        }
        @if (tags(row).length > 0) {
          <span class="flex flex-wrap gap-1 mt-1">
            @for (t of tags(row); track t.label) {
              <span class="text-[11px] font-semibold rounded-full px-2 py-0.5"
                    [class]="t.tone === 'danger' ? 'bg-danger-soft text-danger-soft-fg'
                      : t.tone === 'warn' ? 'bg-warning-soft text-warning-soft-fg' : 'bg-info-soft text-info-soft-fg'">{{ t.label }}</span>
            }
          </span>
        }
      </ng-template>
      <ng-template #actions let-row>
        <app-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (clicked)="open(row)" />
        @if (canManage()) {
          <app-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (clicked)="toggle(row)" />
          @if (!row.modelId) {
            <app-button label="Eliminar" icon="pi pi-trash" size="small" [text]="true" severity="danger"
                      (clicked)="remove(row)" />
          }
        }
      </ng-template>
    </app-data-table>
  `,
  styles: `
    /* Botón de Aska: noche índigo (como su panel) para que el logo, más claro y con brillo, resalte encima. */
    .aska-cta {
      display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; padding: 0 1rem 0 0.5rem;
      border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; color: var(--aska-contrast);
      background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
      box-shadow: 0 0 0 4px var(--aska-glow), 0 6px 16px var(--aska-shadow);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .aska-cta:hover { transform: translateY(-1px); box-shadow: 0 0 0 4px var(--aska-glow), 0 10px 22px var(--aska-shadow); }
    .aska-cta:focus-visible { outline: 2px solid var(--aska-amber); outline-offset: 2px; }
  `,
})
export class ProductsComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = permissionFlag('products:manage');
  protected readonly canAsk = permissionFlag('ai:ask');
  private readonly moments = inject(AskaMomentsState);
  protected readonly manualProducts = this.moments.manualProducts;
  /** Decisión 308: desde el 3.er producto creado a mano seguido. */
  protected readonly nudgeClosed = signal(false);
  protected readonly showNudge = computed(() =>
    this.canManage() && !this.nudgeClosed() && this.manualProducts() >= MANUAL_PRODUCTS_TRIGGER);
  protected readonly hasVariants = permissionFlag('module:variants');
  protected readonly hasScale = permissionFlag('module:scale');
  protected readonly hasMedicines = permissionFlag('module:medicines');
  protected readonly tags = (p: Product) => medicineTags(p.medicine);

  protected readonly page = signal<PageResponse<Product> | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected categoryId = '';
  protected includeInactive = false;
  protected query: TableQuery = initialQuery(20, 'name,asc');

  protected readonly trackById = (row: Product): string => row.id;
  protected readonly columns: ColumnDef<Product>[] = [
    { header: 'SKU', cell: (p) => p.sku, kind: 'mono', sortField: 'sku' },
    { header: 'Nombre', cell: (p) => p.name, sortField: 'name', template: 'name' },
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
        // Las tallas se ven en su modelo ("Con tallas"), no una por una aquí (fase 8d).
        includeVariants: false,
      })
      .pipe(this.latest.only()).subscribe({
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

  protected nudgeLoad(): void {
    this.moments.resetManualProducts();
    void this.router.navigate(['/app/productos/cargar-con-aska']);
  }

  create(): void {
    void this.router.navigate(['/app/productos/nuevo']);
  }

  open(product: Product): void {
    void this.router.navigate(['/app/productos', product.id]);
  }

  /** Decisión 314: lo oculta para siempre; las ventas y reportes anteriores lo conservan. */
  remove(product: Product): void {
    this.confirm.ask({
      header: 'Eliminar producto',
      message: `¿Eliminar ${product.name}? Ya no aparecerá en ninguna lista ni se podrá vender; las ventas y reportes `
        + 'anteriores lo conservan. Su SKU y su código de barras quedan libres. No se puede deshacer.',
      acceptLabel: 'Eliminar producto',
      danger: true,
      accept: () => this.api.deleteProduct(product.id).subscribe(() => this.load(this.query)),
    });
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
