import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { Category, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { formatCop } from '../../shared/money';
import { stockLabel } from './pos-labels';

/** Pestaña de la cuadrícula: favoritos, todos o una categoría (por id). */
export type GridTab = 'favorites' | 'all' | string;

const PAGE_SIZE = 48;

/**
 * Cuadrícula táctil de productos del POS: pestañas Favoritos / Todos / categorías y tarjetas grandes con nombre,
 * precio de lista y existencia. Tocar una tarjeta la agrega (el precio real lo calcula el servidor para el
 * cliente de la venta); la estrella la marca como favorita en este equipo.
 */
@Component({
  selector: 'app-product-grid',
  imports: [SkeletonModule],
  template: `
    <nav class="flex gap-2 overflow-x-auto pb-2 shrink-0" aria-label="Categorías de productos">
      <button type="button" class="chip" [attr.aria-pressed]="tab() === 'favorites'" (click)="select('favorites')">
        <i class="pi pi-star-fill text-xs" aria-hidden="true"></i>Favoritos
      </button>
      <button type="button" class="chip" [attr.aria-pressed]="tab() === 'all'" (click)="select('all')">Todos</button>
      @for (c of categories(); track c.id) {
        <button type="button" class="chip" [attr.aria-pressed]="tab() === c.id" (click)="select(c.id)">{{ c.name }}</button>
      }
    </nav>

    <div class="flex-1 min-h-0 overflow-y-auto" [attr.aria-busy]="loading()">
      @if (loading() && products().length === 0) {
        <div class="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          @for (i of placeholders; track i) {
            <p-skeleton height="6rem" borderRadius="0.75rem" />
          }
        </div>
      } @else if (products().length === 0) {
        <div class="h-full min-h-32 flex flex-col items-center justify-center gap-2 text-center text-muted p-4">
          <i class="pi text-2xl" [class.pi-star]="tab() === 'favorites'" [class.pi-box]="tab() !== 'favorites'"
             aria-hidden="true"></i>
          @if (tab() === 'favorites') {
            <p class="font-medium text-fg">Aún no tienes favoritos</p>
            <p class="text-sm max-w-xs">En "Todos", toca la estrella de los productos que más vendes para tenerlos aquí.</p>
          } @else {
            <p class="font-medium text-fg">No hay productos activos en esta categoría</p>
          }
        </div>
      } @else {
        <ul class="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Lista de productos">
          @for (p of products(); track p.id) {
            @let badge = stockText(p);
            <li class="relative">
              <button type="button" class="product-card" [disabled]="disabled()" [class.opacity-60]="badge === 'Agotado'"
                      [attr.aria-label]="'Agregar ' + p.name + ', ' + cop(p.salePrice) + (badge ? ', ' + badge : '')"
                      (click)="pick.emit(p)">
                <span class="font-medium leading-snug line-clamp-2 pr-8">{{ p.name }}</span>
                <span class="mt-auto flex items-end justify-between gap-1 w-full">
                  <span class="font-semibold">{{ cop(p.salePrice) }}</span>
                  @if (badge) {
                    <span class="text-xs rounded px-1.5 py-0.5"
                          [class.bg-danger-soft]="badge === 'Agotado'" [class.text-danger-soft-fg]="badge === 'Agotado'"
                          [class.bg-surface-alt]="badge !== 'Agotado'" [class.text-muted]="badge !== 'Agotado'">
                      {{ badge }}
                    </span>
                  }
                </span>
              </button>
              <button type="button" class="star" [attr.aria-pressed]="isFavorite(p.id)"
                      [attr.aria-label]="(isFavorite(p.id) ? 'Quitar de favoritos: ' : 'Agregar a favoritos: ') + p.name"
                      (click)="favoriteToggle.emit(p)">
                <i class="pi" [class.pi-star-fill]="isFavorite(p.id)" [class.text-warning]="isFavorite(p.id)"
                   [class.pi-star]="!isFavorite(p.id)" aria-hidden="true"></i>
              </button>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <div class="flex justify-center py-3">
            <button type="button" class="chip" [disabled]="loading()" (click)="loadMore()">Ver más productos</button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      flex-shrink: 0;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
    }
    .chip[aria-pressed='true'] {
      background: var(--brand);
      border-color: var(--brand);
      color: var(--brand-contrast);
    }
    .chip:disabled {
      opacity: 0.6;
    }
    .product-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      width: 100%;
      min-height: 6rem;
      padding: 0.75rem;
      text-align: left;
      border-radius: 0.75rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      box-shadow: var(--elevation-card);
      transition: border-color 0.15s, transform 0.1s;
    }
    .product-card:hover:not(:disabled) {
      border-color: var(--brand);
    }
    .product-card:active:not(:disabled) {
      transform: scale(0.98);
    }
    .product-card:disabled {
      cursor: not-allowed;
    }
    .star {
      position: absolute;
      top: 0;
      right: 0;
      width: 2.75rem;
      height: 2.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.75rem;
      color: var(--text-muted);
    }
    .star:hover {
      color: var(--text);
    }
  `,
})
export class ProductGridComponent implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Ids de los favoritos, en orden. */
  readonly favoriteIds = input<readonly string[]>([]);
  /** Existencia por producto en la sucursal de la caja (unidad base); sin dato, no se muestra. */
  readonly stock = input<ReadonlyMap<string, number>>(new Map());
  readonly disabled = input(false);
  readonly pick = output<Product>();
  readonly favoriteToggle = output<Product>();

  protected readonly cop = formatCop;
  protected readonly placeholders = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly categories = signal<Category[]>([]);
  protected readonly tab = signal<GridTab>('all');
  protected readonly loading = signal(false);
  private readonly loaded = signal<Product[]>([]);
  private readonly favoriteProducts = signal<Product[]>([]);
  private page = 0;
  protected readonly hasMore = signal(false);
  private requestSeq = 0;

  /** En Favoritos se respeta el orden guardado y desaparecen al quitarles la estrella sin recargar. */
  protected readonly products = computed(() => {
    if (this.tab() !== 'favorites') {
      return this.loaded();
    }
    const byId = new Map(this.favoriteProducts().map((p) => [p.id, p]));
    return this.favoriteIds().map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
  });

  private readonly favoriteSet = computed(() => new Set(this.favoriteIds()));

  ngOnInit(): void {
    this.catalog.categories().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.categories.set(list.filter((c) => c.active)));
    this.select(this.favoriteIds().length > 0 ? 'favorites' : 'all');
  }

  select(tab: GridTab): void {
    this.tab.set(tab);
    this.page = 0;
    this.hasMore.set(false);
    if (tab === 'favorites') {
      this.loadFavorites();
    } else {
      this.loaded.set([]);
      this.loadPage();
    }
  }

  loadMore(): void {
    this.page++;
    this.loadPage();
  }

  isFavorite(id: string): boolean {
    return this.favoriteSet().has(id);
  }

  protected stockText(product: Product): string | null {
    return product.trackInventory ? stockLabel(this.stock().get(product.id)) : null;
  }

  private loadPage(): void {
    const tab = this.tab();
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.catalog.products({ page: this.page, size: PAGE_SIZE, sort: 'name,asc', categoryId: tab === 'all' ? undefined : tab })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (seq !== this.requestSeq) {
            return;
          }
          this.loaded.update((list) => [...list, ...page.content.filter((p) => p.active)]);
          this.hasMore.set(page.page + 1 < page.totalPages);
          this.loading.set(false);
        },
        error: () => {
          if (seq === this.requestSeq) {
            this.loading.set(false);
          }
        },
      });
  }

  /** Cada favorito se pide al servidor (precio y estado al día); los borrados o inactivos no se muestran. */
  private loadFavorites(): void {
    const ids = this.favoriteIds();
    const seq = ++this.requestSeq;
    if (ids.length === 0) {
      this.favoriteProducts.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const requests: Observable<Product | null>[] = ids.map((id) =>
      this.catalog.product(id, true).pipe(catchError(() => of(null))));
    forkJoin(requests)
      .pipe(map((list) => list.filter((p): p is Product => p !== null && p.active)), takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        if (seq === this.requestSeq) {
          this.favoriteProducts.set(list);
          this.loading.set(false);
        }
      });
  }
}
