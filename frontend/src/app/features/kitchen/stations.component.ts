import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { Category, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { KitchenApi, KitchenStation } from '../../core/api/kitchen.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StationDraft, emptyStation, stationDraft, stationProblem, stationReceives, toStationInput } from './station-form';

/**
 * Estaciones de cocina (Fase 12b-3, decisión 270): Cocina (la principal) recibe todo lo que no tenga otra estación;
 * las demás (Bar, Parrilla) reciben las categorías y productos que se les asignen. Un producto va a la estación que
 * tenga él mismo, si no a la de su categoría.
 */
@Component({
  selector: 'app-stations',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SkeletonModule, PageHeaderComponent,
    FormDialogComponent, XIconComponent],
  template: `
    <app-page-header title="Estaciones de cocina" glyph="kitchen"
                     description="A dónde sale cada producto al enviar a cocina. Lo que no tenga estación va a la principal.">
      <a pButton routerLink="/app/comandas" label="Comandas" icon="pi pi-arrow-left" severity="secondary" [text]="true"></a>
      <p-button label="Nueva estación" icon="pi pi-plus" (onClick)="openNew()" />
    </app-page-header>

    @if (stations(); as list) {
      <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Estaciones">
        @for (s of list; track s.id) {
          <li class="card p-5 flex flex-col gap-3" [class.opacity-60]="!s.active">
            <div class="flex items-start gap-3">
              <app-xicon name="kitchen" [size]="32" />
              <div class="min-w-0 flex-1">
                <h2 class="text-lg font-extrabold tracking-tight truncate">{{ s.name }}</h2>
                <p class="text-sm" [class.text-brand]="s.main" [class.text-muted]="!s.main">
                  {{ s.main ? 'Principal' : s.active ? 'Activa' : 'Inactiva: lo suyo va a la principal' }}
                </p>
              </div>
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" severity="secondary"
                        [ariaLabel]="'Editar ' + s.name" (onClick)="openEdit(s)" />
            </div>
            <p class="text-sm text-muted mt-auto"><span class="font-semibold text-fg">Recibe:</span> {{ receives(s) }}</p>
          </li>
        }
      </ul>
    } @else {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        @for (i of [0, 1]; track i) {
          <p-skeleton height="9rem" borderRadius="1.25rem" />
        }
      </div>
    }

    <app-form-dialog [(visible)]="editorOpen" [header]="editing() ? 'Editar ' + editing()!.name : 'Nueva estación'"
                     width="40rem" [dirty]="dirty" [invalidMessage]="problem()" [save]="saveRequest"
                     [successMessage]="editing() ? 'Estación guardada' : 'Estación creada'" (saved)="load()">
      <div class="flex flex-col gap-1">
        <label for="station-name" class="text-sm font-semibold">Nombre</label>
        <input pInputText id="station-name" maxlength="40" placeholder="Bar, Parrilla, Postres…" [(ngModel)]="draft.name"
               (ngModelChange)="touch()" />
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-semibold mb-1">Recibe</legend>
        @if (categories().length > 0) {
          <p class="text-xs text-muted -mt-1">Categorías completas (si estaban en otra estación, pasan a esta):</p>
          <div class="flex flex-wrap gap-2">
            @for (c of categories(); track c.id) {
              <label class="chip chip--toggle" [class.chip--on]="draft.categoryIds.includes(c.id)">
                <input type="checkbox" class="sr-only" [checked]="draft.categoryIds.includes(c.id)" (change)="toggleCategory(c.id)" />
                {{ c.name }}
              </label>
            }
          </div>
        }
        <label for="station-product" class="text-xs text-muted mt-1">Productos sueltos (mandan sobre su categoría):</label>
        <input pInputText id="station-product" placeholder="Busca un producto por nombre o SKU" autocomplete="off"
               [ngModel]="productSearch" (ngModelChange)="searchProducts($event)" />
        @if (productResults().length > 0) {
          <ul class="border border-line rounded-xl divide-y divide-line max-h-48 overflow-auto" aria-label="Productos encontrados">
            @for (p of productResults(); track p.id) {
              <li>
                <button type="button" class="w-full min-h-11 px-3 text-left text-sm hover:bg-surface-alt flex justify-between gap-2"
                        [disabled]="hasProduct(p.id)" (click)="addProduct(p)">
                  <span>{{ p.name }}</span>
                  <span class="text-muted">{{ hasProduct(p.id) ? 'Agregado' : 'Agregar' }}</span>
                </button>
              </li>
            }
          </ul>
        }
        @if (draft.products.length > 0) {
          <ul class="flex flex-wrap gap-2" aria-label="Productos de la estación">
            @for (p of draft.products; track p.id) {
              <li class="chip chip--on">
                {{ p.name }}
                <button type="button" class="ml-1 size-6 inline-flex items-center justify-center rounded-full"
                        [attr.aria-label]="'Quitar ' + p.name" (click)="removeProduct(p.id)">
                  <i class="pi pi-times text-xs" aria-hidden="true"></i>
                </button>
              </li>
            }
          </ul>
        }
      </fieldset>

      @if (!editing()?.main) {
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1 size-4" [(ngModel)]="draft.main" (ngModelChange)="touch()" />
          <span><span class="font-semibold">Estación principal</span>
            <span class="block text-xs text-muted">Recibe todo lo que no tenga otra estación (reemplaza a la actual).</span></span>
        </label>
        @if (editing() && !draft.main) {
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1 size-4" [(ngModel)]="draft.active" (ngModelChange)="touch()" />
            <span><span class="font-semibold">Activa</span>
              <span class="block text-xs text-muted">Inactiva, lo suyo sale por la principal.</span></span>
          </label>
        }
      }
    </app-form-dialog>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 2rem;
      padding: 0.125rem 0.75rem;
      border-radius: 9999px;
      background: var(--surface-alt);
      font-size: 0.875rem;
      font-weight: 600;
    }
    .chip--toggle { min-height: 2.75rem; cursor: pointer; border: 1px solid var(--surface-border); }
    .chip--on { background: var(--brand-soft); color: var(--brand-soft-text); border-color: var(--brand); }
    .chip--toggle:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  `,
})
export class StationsComponent implements OnInit {
  private readonly api = inject(KitchenApi);
  private readonly catalog = inject(CatalogApi);

  protected readonly stations = signal<KitchenStation[] | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly productResults = signal<Product[]>([]);
  protected readonly editing = signal<KitchenStation | null>(null);
  protected readonly receives = stationReceives;

  protected editorOpen = false;
  protected draft: StationDraft = emptyStation();
  protected dirty = false;
  protected productSearch = '';
  private readonly revision = signal(0);
  protected readonly problem = computed(() => {
    this.revision();
    const current = this.editing();
    return stationProblem(this.draft, (this.stations() ?? []).filter((s) => s.id !== current?.id));
  });
  private readonly searches = new Subject<string>();

  constructor() {
    this.searches.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((text) => this.catalog.products({ page: 0, size: 8, search: text })),
      takeUntilDestroyed(),
    ).subscribe((page) => this.productResults.set(page.content));
  }

  ngOnInit(): void {
    this.load();
    this.catalog.categories().subscribe((list) => this.categories.set(list.filter((c) => c.active)));
  }

  load(): void {
    this.api.stations().subscribe({ next: (list) => this.stations.set(list), error: () => this.stations.set([]) });
  }

  protected openNew(): void {
    this.editing.set(null);
    this.open(emptyStation());
  }

  protected openEdit(station: KitchenStation): void {
    this.editing.set(station);
    this.open(stationDraft(station));
  }

  private open(draft: StationDraft): void {
    this.draft = draft;
    this.dirty = false;
    this.productSearch = '';
    this.productResults.set([]);
    this.touch(false);
    this.editorOpen = true;
  }

  protected touch(changed = true): void {
    this.dirty = this.dirty || changed;
    this.revision.update((n) => n + 1);
  }

  protected toggleCategory(id: string): void {
    const ids = this.draft.categoryIds;
    this.draft.categoryIds = ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id];
    this.touch();
  }

  protected searchProducts(text: string): void {
    this.productSearch = text;
    if (text.trim().length < 2) {
      this.productResults.set([]);
      return;
    }
    this.searches.next(text.trim());
  }

  protected hasProduct(id: string): boolean {
    return this.draft.products.some((p) => p.id === id);
  }

  protected addProduct(product: Product): void {
    if (!this.hasProduct(product.id)) {
      this.draft.products = [...this.draft.products, { id: product.id, name: product.name }];
      this.touch();
    }
  }

  protected removeProduct(id: string): void {
    this.draft.products = this.draft.products.filter((p) => p.id !== id);
    this.touch();
  }

  protected readonly saveRequest = (): Observable<KitchenStation> => {
    const input = toStationInput(this.draft);
    const current = this.editing();
    return current ? this.api.updateStation(current.id, input) : this.api.createStation(input);
  };
}
