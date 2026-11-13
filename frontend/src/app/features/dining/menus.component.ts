import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { Category, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { BranchOption, DiningApi, DiningMenu, RegisterOption } from '../../core/api/dining.api';
import { problemMessage } from '../../core/errors/problem';
import { AuthService } from '../../core/auth/auth.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { MenuDraft, emptyMenu, menuContents, menuDraft, menuProblem, toMenuInput } from './menu-form';

/**
 * Cartas por piso (decisión 294): cada carta tiene su caja y sus categorías (y productos sueltos). Lo de cada carta se
 * cobra en su caja aunque la mesa esté en otro piso o se pague en otra caja; si una cuenta trae de dos cartas, se
 * registra una venta por caja y el cliente recibe un solo tiquete. Plan Empresa.
 */
@Component({
  selector: 'app-dining-menus',
  imports: [FormsModule, RouterLink, ButtonModule, AppInputDirective, SkeletonComponent, PageHeaderComponent,
    FormDialogComponent, EmptyStateComponent, XIconComponent],
  template: `
    <app-page-header title="Cartas por piso" glyph="tables"
                     description="Lo de cada carta se cobra en su caja, aunque la mesa esté en otro piso. Si la cuenta trae de dos cartas, sale una venta por caja y un solo tiquete.">
      <a pButton routerLink="/app/mesas/configurar" label="Configurar mesas" icon="pi pi-arrow-left" severity="secondary"
         [text]="true"></a>
      @if (allowed() && registers().length > 0) {
        <p-button label="Nueva carta" icon="pi pi-plus" (onClick)="openNew()" />
      }
    </app-page-header>

    @if (branches().length > 1) {
      <label class="flex items-center gap-2 text-sm mb-4">
        <span class="font-semibold">Sucursal</span>
        <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="branchId()" (ngModelChange)="changeBranch($event)">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    }

    @if (!allowed()) {
      <div class="card p-5 text-sm" role="status">
        <p class="font-semibold">Las cartas por piso están en el plan Empresa.</p>
        <p class="text-muted mt-1">Escríbenos para activarlas en tu negocio.</p>
      </div>
    } @else if (menus() !== null) {
      @let list = menus() ?? [];
      @if (list.length === 0) {
        <div class="card">
          <app-empty-state icon="pi pi-book" title="Crea la carta de cada piso"
                           message="Por ejemplo, Piso 1 (comida rápida, Caja 1) y Piso 2 (cócteles, Caja 2). Si tienes una sola caja, primero crea otra en Configuración → Cajas."
                           [actionLabel]="registers().length > 0 ? 'Nueva carta' : null" (action)="openNew()" />
        </div>
      } @else {
        <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Cartas">
          @for (m of list; track m.id) {
            <li class="card p-5 flex flex-col gap-3" [class.opacity-60]="!m.active">
              <div class="flex items-start gap-3">
                <app-xicon name="tables" [size]="32" />
                <div class="min-w-0 flex-1">
                  <h2 class="text-lg font-extrabold tracking-tight truncate">{{ m.name }}</h2>
                  <p class="text-sm" [class.text-brand]="m.active" [class.text-muted]="!m.active">
                    {{ m.active ? 'Se cobra en ' + m.cashRegister.name : 'Inactiva: lo suyo se cobra como antes' }}
                  </p>
                </div>
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" severity="secondary"
                          [ariaLabel]="'Editar ' + m.name" (onClick)="openEdit(m)" />
              </div>
              <p class="text-sm text-muted mt-auto"><span class="font-semibold text-fg">Tiene:</span> {{ contents(m) }}</p>
            </li>
          }
        </ul>
      }
    } @else {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        @for (i of [0, 1]; track i) {
          <app-skeleton height="9rem" borderRadius="1.25rem" />
        }
      </div>
    }

    <app-form-dialog [(visible)]="editorOpen" [header]="editing() ? 'Editar ' + editing()!.name : 'Nueva carta'"
                     width="40rem" [dirty]="dirty" [invalidMessage]="problem()" [save]="saveRequest"
                     [successMessage]="editing() ? 'Carta guardada' : 'Carta creada'" (saved)="load()">
      <div class="flex flex-col gap-1">
        <label for="menu-name" class="text-sm font-semibold">Nombre</label>
        <input appInput id="menu-name" maxlength="40" placeholder="Piso 1, Piso 2, Bar…" [(ngModel)]="draft.name"
               (ngModelChange)="touch()" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="menu-register" class="text-sm font-semibold">Se cobra en</label>
        <select id="menu-register" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="draft.cashRegisterId"
                (ngModelChange)="touch()">
          <option value="" disabled>Elige la caja</option>
          @for (r of registers(); track r.id) {
            <option [value]="r.id">{{ r.name }}</option>
          }
        </select>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-semibold mb-1">Tiene</legend>
        @if (categories().length > 0) {
          <p class="text-xs text-muted -mt-1">Categorías completas (si estaban en otra carta, pasan a esta):</p>
          <div class="flex flex-wrap gap-2">
            @for (c of categories(); track c.id) {
              <label class="chip chip--toggle" [class.chip--on]="draft.categoryIds.includes(c.id)">
                <input type="checkbox" class="sr-only" [checked]="draft.categoryIds.includes(c.id)" (change)="toggleCategory(c.id)" />
                {{ c.name }}
              </label>
            }
          </div>
        }
        <label for="menu-product" class="text-xs text-muted mt-1">Productos sueltos (mandan sobre su categoría):</label>
        <input appInput id="menu-product" placeholder="Busca un producto por nombre o SKU" autocomplete="off"
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
          <ul class="flex flex-wrap gap-2" aria-label="Productos de la carta">
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
          <span><span class="font-semibold">Activa</span>
            <span class="block text-xs text-muted">Inactiva, lo suyo se cobra en la caja de la zona o de quien cobra.</span></span>
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
  `,
})
export class MenusComponent implements OnInit {
  private readonly api = inject(DiningApi);
  private readonly catalog = inject(CatalogApi);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  /** Función del plan "Caja por zona" (plan Empresa). */
  protected readonly allowed = computed(() => this.auth.hasPermission('plan:zone-registers'));
  protected readonly branches = signal<BranchOption[]>([]);
  protected readonly branchId = signal<string | null>(null);
  protected readonly menus = signal<DiningMenu[] | null>(null);
  protected readonly registers = signal<RegisterOption[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly productResults = signal<Product[]>([]);
  protected readonly editing = signal<DiningMenu | null>(null);
  protected readonly contents = menuContents;

  protected editorOpen = false;
  protected draft: MenuDraft = emptyMenu();
  protected dirty = false;
  protected productSearch = '';
  private readonly revision = signal(0);
  protected readonly problem = computed(() => {
    this.revision();
    const current = this.editing();
    return menuProblem(this.draft, (this.menus() ?? []).filter((m) => m.id !== current?.id));
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
    this.catalog.categories().subscribe((list) => this.categories.set(list.filter((c) => c.active)));
    this.api.floor(null).subscribe({
      next: (f) => {
        this.branches.set(f.branches);
        this.branchId.set(f.branchId);
        this.load();
      },
      error: (e: unknown) => {
        this.menus.set([]);
        this.messages.add({ severity: 'error', summary: 'No se pudieron cargar las cartas', detail: problemMessage(e) });
      },
    });
  }

  load(): void {
    this.api.menus(this.branchId()).subscribe({ next: (list) => this.menus.set(list), error: () => this.menus.set([]) });
    this.api.registers(this.branchId()).pipe(catchError(() => of([] as RegisterOption[])))
      .subscribe((r) => this.registers.set(r));
  }

  protected changeBranch(id: string): void {
    this.branchId.set(id);
    this.menus.set(null);
    this.load();
  }

  protected openNew(): void {
    this.editing.set(null);
    this.open(emptyMenu(this.registers().length === 1 ? this.registers()[0].id : ''));
  }

  protected openEdit(menu: DiningMenu): void {
    this.editing.set(menu);
    this.open(menuDraft(menu));
  }

  private open(draft: MenuDraft): void {
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

  protected readonly saveRequest = (): Observable<DiningMenu> => {
    const input = toMenuInput(this.draft);
    const current = this.editing();
    return current ? this.api.updateMenu(current.id, input) : this.api.createMenu(this.branchId() ?? '', input);
  };
}
