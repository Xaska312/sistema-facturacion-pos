import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Category, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ModifierGroup, ModifierReportRow, ModifiersApi } from '../../core/api/modifiers.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import {
  GroupDraft,
  appliesTo,
  draftFrom,
  draftProblem,
  emptyDraft,
  newOption,
  ruleLabel,
  toInput,
} from './modifier-form';

/** Fecha local yyyy-mm-dd (para el informe de los últimos 30 días). */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Adiciones (Fase 12b-1, decisión 268): grupos de opciones ("Tamaño", "Licor", "Extras") en tarjetas, con su regla,
 * sus opciones y precios, y a qué categorías y productos se aplican. Con permiso de reportes, lo más pedido del mes.
 */
@Component({
  selector: 'app-modifiers',
  imports: [FormsModule, ButtonModule, InputTextModule, SkeletonModule, PageHeaderComponent, FormDialogComponent,
    EmptyStateComponent, XIconComponent],
  template: `
    <app-page-header title="Adiciones"
                     description="Tamaños, extras con precio y opciones que se eligen al vender un producto. Se crean una vez y se aplican a categorías o productos.">
      @if (canManage()) {
        <p-button label="Nuevo grupo" icon="pi pi-plus" (onClick)="openNew()" />
      }
    </app-page-header>

    @if (groups(); as list) {
      @if (list.length === 0) {
        <app-empty-state icon="pi pi-plus-circle" title="Aún no tienes adiciones"
                         message="Crea un grupo como Tamaño (Mediano, Grande +$4.000) o Extras (Shot extra +$3.000) y aplícalo a una categoría."
                         [actionLabel]="canManage() ? 'Crear el primer grupo' : null" (action)="openNew()" />
      } @else {
        <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Grupos de adiciones">
          @for (g of list; track g.id) {
            <li class="card p-5 flex flex-col gap-3" [class.opacity-60]="!g.active">
              <div class="flex items-start gap-3">
                <app-xicon name="modifiers" [size]="32" />
                <div class="min-w-0 flex-1">
                  <h2 class="text-lg font-extrabold tracking-tight truncate">{{ g.name }}</h2>
                  <p class="text-sm" [class.text-brand]="g.minSelect > 0" [class.text-muted]="g.minSelect === 0">
                    {{ rule(g) }}{{ g.active ? '' : ' · Inactivo' }}
                  </p>
                </div>
                @if (canManage()) {
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" severity="secondary"
                            [ariaLabel]="'Editar ' + g.name" (onClick)="openEdit(g)" />
                }
              </div>
              <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="'Opciones de ' + g.name">
                @for (o of g.options; track o.id) {
                  <li class="chip" [class.line-through]="!o.active">
                    {{ o.name }}<span class="text-muted">{{ o.priceDelta === 0 ? '' : ' ' + delta(o.priceDelta) }}{{ o.maxQuantity > 1 ? ' · hasta ×' + o.maxQuantity : '' }}</span>
                  </li>
                }
              </ul>
              <p class="text-sm text-muted mt-auto"><span class="font-semibold text-fg">Se aplica a:</span> {{ applies(g) }}</p>
            </li>
          }
        </ul>
      }
    } @else {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        @for (i of [0, 1, 2]; track i) {
          <p-skeleton height="11rem" borderRadius="1.25rem" />
        }
      </div>
    }

    @if (canSeeReport() && report().length > 0) {
      <section class="card p-5 mt-6 max-w-3xl" aria-labelledby="top-title">
        <h2 id="top-title" class="text-base font-bold tracking-tight">Lo más pedido en los últimos 30 días</h2>
        <table class="w-full text-sm mt-3">
          <caption class="sr-only">Adiciones más vendidas</caption>
          <thead class="text-muted text-left">
            <tr><th scope="col" class="py-1 font-medium">Adición</th><th scope="col" class="py-1 font-medium text-right">Veces</th>
              <th scope="col" class="py-1 font-medium text-right">Sumó</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            @for (r of report(); track r.groupName + r.optionName) {
              <tr>
                <td class="py-2"><span class="font-medium">{{ r.optionName }}</span> <span class="text-muted">· {{ r.groupName }}</span></td>
                <td class="py-2 text-right tabular-nums">{{ q(r.units) }}</td>
                <td class="py-2 text-right tabular-nums">{{ cop(r.amount) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    <app-form-dialog [(visible)]="editorOpen" [header]="editing() ? 'Editar ' + editing()!.name : 'Nuevo grupo de adiciones'"
                     width="44rem" [dirty]="dirty" [invalidMessage]="problem()" [save]="saveRequest"
                     [successMessage]="editing() ? 'Grupo guardado' : 'Grupo creado'" (saved)="load()">
      <div class="flex flex-col gap-1">
        <label for="group-name" class="text-sm font-semibold">Nombre del grupo</label>
        <input pInputText id="group-name" maxlength="60" placeholder="Tamaño, Licor, Extras…" [(ngModel)]="draft.name"
               (ngModelChange)="touch()" />
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-semibold mb-1">Cómo se elige</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="choice">
            <input type="radio" name="multiple" [value]="false" [(ngModel)]="draft.multiple" (ngModelChange)="touch()" />
            <span><span class="block font-semibold">Una sola opción</span>
              <span class="block text-xs text-muted">Tamaño, tipo de licor, término de la carne.</span></span>
          </label>
          <label class="choice">
            <input type="radio" name="multiple" [value]="true" [(ngModel)]="draft.multiple" (ngModelChange)="touch()" />
            <span><span class="block font-semibold">Varias</span>
              <span class="block text-xs text-muted">Extras, salsas, toppings.</span></span>
          </label>
        </div>
        @if (draft.multiple) {
          <label class="flex items-center gap-2 text-sm">
            <span>Máximo por producto</span>
            <input pInputText type="number" min="2" max="20" class="w-24" [(ngModel)]="draft.max" (ngModelChange)="touch()" />
          </label>
        }
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1 size-4" [(ngModel)]="draft.required" (ngModelChange)="touch()" />
          <span><span class="font-semibold">Obligatorio</span>
            <span class="block text-xs text-muted">No deja agregar el producto sin elegir al menos una.</span></span>
        </label>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-semibold mb-1">Opciones</legend>
        <p class="text-xs text-muted -mt-1">Precio: lo que suma al producto (0 si no cambia; negativo si lo rebaja, como "Sin licor").</p>
        @for (o of draft.options; track $index; let i = $index) {
          <div class="flex flex-wrap items-center gap-2" role="group" [attr.aria-label]="'Opción ' + (i + 1)">
            <input pInputText class="flex-1 min-w-36" maxlength="60" placeholder="Nombre" [attr.aria-label]="'Nombre de la opción ' + (i + 1)"
                   [(ngModel)]="o.name" (ngModelChange)="touch()" />
            <input pInputText type="number" step="100" class="w-28" placeholder="Precio" [attr.aria-label]="'Precio de la opción ' + (i + 1)"
                   [(ngModel)]="o.priceDelta" (ngModelChange)="touch()" />
            @if (draft.multiple) {
              <label class="flex items-center gap-1 text-xs text-muted">
                <span>hasta ×</span>
                <input pInputText type="number" min="1" max="10" class="w-16" [attr.aria-label]="'Veces que se puede elegir la opción ' + (i + 1)"
                       [(ngModel)]="o.maxQuantity" (ngModelChange)="touch()" />
              </label>
            }
            @if (o.id) {
              <label class="flex items-center gap-1 text-xs">
                <input type="checkbox" class="size-4" [(ngModel)]="o.active" (ngModelChange)="touch()" />Activa
              </label>
            }
            <p-button icon="pi pi-trash" [text]="true" severity="danger" [ariaLabel]="'Quitar la opción ' + (i + 1)"
                      (onClick)="removeOption(i)" />
          </div>
        }
        <div>
          <p-button label="Agregar opción" icon="pi pi-plus" [text]="true" size="small" (onClick)="addOption()" />
        </div>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-semibold mb-1">Se aplica a</legend>
        @if (categories().length > 0) {
          <p class="text-xs text-muted -mt-1">Categorías completas (también los productos que crees después en ellas):</p>
          <div class="flex flex-wrap gap-2">
            @for (c of categories(); track c.id) {
              <label class="chip chip--toggle" [class.chip--on]="draft.categoryIds.includes(c.id)">
                <input type="checkbox" class="sr-only" [checked]="draft.categoryIds.includes(c.id)" (change)="toggleCategory(c.id)" />
                {{ c.name }}
              </label>
            }
          </div>
        }
        <label for="product-search" class="text-xs text-muted mt-1">Productos sueltos:</label>
        <input pInputText id="product-search" placeholder="Busca un producto por nombre o SKU" autocomplete="off"
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
          <ul class="flex flex-wrap gap-2" aria-label="Productos del grupo">
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

      @if (editing()) {
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1 size-4" [(ngModel)]="draft.active" (ngModelChange)="touch()" />
          <span><span class="font-semibold">Grupo activo</span>
            <span class="block text-xs text-muted">Inactivo no se ofrece al vender; las ventas que ya lo tienen no cambian.</span></span>
        </label>
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
    .choice {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.75rem;
      border-radius: 1rem;
      border: 1px solid var(--surface-border);
      cursor: pointer;
    }
    .choice:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); }
    .choice input { margin-top: 0.25rem; accent-color: var(--brand); }
  `,
})
export class ModifiersComponent implements OnInit {
  private readonly api = inject(ModifiersApi);
  private readonly catalog = inject(CatalogApi);

  protected readonly canManage = permissionFlag('modifiers:manage');
  protected readonly canSeeReport = permissionFlag('reports:read');
  protected readonly groups = signal<ModifierGroup[] | null>(null);
  protected readonly report = signal<ModifierReportRow[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly productResults = signal<Product[]>([]);
  protected readonly editing = signal<ModifierGroup | null>(null);
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly rule = ruleLabel;
  protected readonly applies = appliesTo;

  protected editorOpen = false;
  protected draft: GroupDraft = emptyDraft();
  protected dirty = false;
  protected productSearch = '';
  /** Cambia con cada edición para que el aviso del diálogo se recalcule (el borrador no es una señal). */
  private readonly revision = signal(0);
  protected readonly problem = computed(() => {
    this.revision();
    return draftProblem(this.draft);
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
    if (this.canSeeReport()) {
      const to = new Date();
      const from = new Date(to.getTime() - 29 * 86_400_000);
      this.api.report(isoDay(from), isoDay(to)).subscribe({ next: (rows) => this.report.set(rows.slice(0, 10)), error: () => undefined });
    }
  }

  load(): void {
    this.api.list().subscribe({ next: (list) => this.groups.set(list), error: () => this.groups.set([]) });
  }

  protected delta(value: number): string {
    return (value > 0 ? '+' : '−') + formatCop(Math.abs(value));
  }

  openNew(): void {
    this.editing.set(null);
    this.open(emptyDraft());
  }

  openEdit(group: ModifierGroup): void {
    this.editing.set(group);
    this.open(draftFrom(group));
  }

  private open(draft: GroupDraft): void {
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

  protected addOption(): void {
    this.draft.options.push(newOption());
    this.touch();
  }

  protected removeOption(index: number): void {
    this.draft.options.splice(index, 1);
    this.touch();
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

  protected readonly saveRequest = (): Observable<ModifierGroup> => {
    const input = toInput(this.draft);
    const current = this.editing();
    return current ? this.api.update(current.id, input) : this.api.create(input);
  };
}
