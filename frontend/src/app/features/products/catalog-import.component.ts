import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AiApi, AskUsage, CatalogDraft } from '../../core/api/ai.api';
import { Branch, ImportReport, Party } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi } from '../../core/api/parties.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { problemMessage } from '../../core/errors/problem';
import { AskaLoaderComponent } from '../../shared/brand/aska-loader.component';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { shrinkPhoto } from '../../shared/image-shrink';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CatalogEdit, asNew, marginOf, matchLabel, rowProblem, toConfirmed, toEdits } from './catalog-text';

type Filter = 'ALL' | 'CREATE' | 'UPDATE' | 'CHECK' | 'SKIP';

/**
 * Cargar con Aska (decisión 300, XASKA IA): la lista de precios del proveedor (Excel, PDF o fotos) se convierte en
 * productos nuevos y en costos y precios al día. La persona revisa y corrige cada fila; nada se guarda sin confirmar.
 */
@Component({
  selector: 'app-catalog-import',
  imports: [FormsModule, RouterLink, ButtonModule, PageHeaderComponent, XaskaIaLogoComponent, AskaLoaderComponent],
  template: `
    <app-page-header title="Cargar con Aska"
                     description="Sube la lista de precios de tu proveedor: Aska crea los productos nuevos y pone al día costos y precios. Tú revisas antes de guardar.">
      <a pButton routerLink="/app/productos" label="Volver a productos" icon="pi pi-arrow-left" severity="secondary"
         [outlined]="true"></a>
    </app-page-header>

    @if (!canAsk()) {
      <section class="card p-4 max-w-3xl flex gap-3 items-start">
        <app-xaska-ia-logo size="md" />
        <p class="text-sm">Cargar con Aska es parte de <strong>XASKA IA</strong>. Pídele al dueño del negocio que lo active,
          o usa <a routerLink="/app/productos/importar" class="underline">Importar desde Excel</a>.</p>
      </section>
    } @else if (draft() === null) {
      <section class="card p-4 md:p-5 flex flex-col gap-4 max-w-3xl aska-upload">
        <div class="mode-switch" role="radiogroup" aria-label="Qué vas a cargar">
          <button type="button" role="radio" [attr.aria-checked]="!inventory()" [class.mode-on]="!inventory()"
                  (click)="inventory.set(false)">
            <i class="pi pi-truck" aria-hidden="true"></i>
            <span><span class="block font-semibold">Lista del proveedor</span>
              <span class="block text-xs">Precios de compra para crear y poner al día</span></span>
          </button>
          <button type="button" role="radio" [attr.aria-checked]="inventory()" [class.mode-on]="inventory()"
                  (click)="inventory.set(true)">
            <i class="pi pi-book" aria-hidden="true"></i>
            <span><span class="block font-semibold">Mi inventario</span>
              <span class="block text-xs">Cuaderno, hojas o Excel con lo que tienes</span></span>
          </button>
        </div>
        <div class="flex items-center gap-3">
          <app-xaska-ia-logo size="lg" />
          <div>
            @if (inventory()) {
              <h2 class="text-lg font-bold tracking-tight">Tómale foto a tu inventario</h2>
              <p class="text-sm text-muted">Hasta 10 fotos del cuaderno u hojas (una por página, derecha y con buena luz), o el
                Excel. Aska saca cada producto con su cantidad y su precio, y carga lo que hay como saldo inicial.</p>
            } @else {
              <h2 class="text-lg font-bold tracking-tight">¿Qué lista te mandó el proveedor?</h2>
              <p class="text-sm text-muted">Excel o CSV, un PDF (hasta 20 páginas) o hasta 10 fotos de la lista impresa.</p>
            }
          </div>
        </div>

        <label class="aska-drop" [class.aska-drop-ready]="files().length > 0">
          <i class="pi pi-cloud-upload text-2xl" aria-hidden="true"></i>
          @if (files().length === 0) {
            <span class="font-semibold">{{ inventory() ? 'Elegir las fotos' : 'Elegir la lista' }}</span>
            <span class="text-xs text-muted">Toca aquí o arrastra el archivo</span>
          } @else {
            <span class="font-semibold">{{ fileNames() }}</span>
            <span class="text-xs text-muted">Toca para cambiarla</span>
          }
          <input type="file" multiple class="sr-only"
                 accept=".xlsx,.csv,.pdf,image/jpeg,image/png,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                 (change)="pick($event)" />
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          @if (inventory()) {
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-medium">Sede donde está ese inventario</span>
              <select class="min-h-11 rounded-lg border border-line bg-surface px-3" [(ngModel)]="branchId">
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }}</option>
                }
              </select>
              <span class="text-xs text-muted">Las cantidades entran como saldo inicial en esa sede.</span>
            </label>
          } @else {
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Proveedor</span>
            <select class="min-h-11 rounded-lg border border-line bg-surface px-3" [(ngModel)]="supplierId">
              <option value="">Sin elegir</option>
              @for (p of suppliers(); track p.id) {
                <option [value]="p.id">{{ p.displayName }}</option>
              }
            </select>
            <span class="text-xs text-muted">Así Aska recuerda sus códigos para la próxima lista y la próxima factura.</span>
          </label>
          }
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">{{ inventory() ? 'Tu margen de ganancia' : 'Margen para los productos nuevos' }}</span>
            <span class="flex items-center gap-2">
              <input type="number" min="0" max="90" step="1" class="w-24 min-h-11 rounded-lg border border-line bg-surface px-3"
                     [(ngModel)]="margin" />
              <span class="text-muted">%</span>
            </span>
            <span class="text-xs text-muted">{{ inventory()
              ? 'Si solo anotaste el precio, el costo sale con este margen (y al revés).'
              : 'Los que ya tienes conservan su margen actual.' }}</span>
          </label>
        </div>

        @if (problem(); as p) {
          <p class="aska-problem" role="alert"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> {{ p }}</p>
        }

        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="aska-button"
                  [disabled]="files().length === 0 || reading() || !marginOk() || (inventory() && !branchId)"
                  (click)="read()">
            <app-xaska-ia-logo size="btn" />
            {{ reading() ? 'Aska está leyendo la lista…' : 'Leer con Aska' }}
          </button>
          @if (usage(); as u) {
            <span class="text-xs text-muted">{{ u.used }} de {{ u.limit }} listas este mes · si no la puede leer, no se descuenta</span>
          }
        </div>
        @if (reading()) {
          <app-aska-loader [messages]="readingMessages" hint="Una lista larga puede tardar hasta un minuto." />
        }
      </section>
    } @else {
      @let d = draft()!;
      <section class="flex flex-col gap-4 max-w-7xl">
        <div class="aska-summary">
          <app-xaska-ia-logo size="md" />
          <div class="flex-1 min-w-0">
            <p class="font-semibold">Leí {{ edits().length }} productos de la lista.</p>
            <p class="text-sm">
              <strong>{{ count('CREATE') }}</strong> nuevos · <strong>{{ count('UPDATE') }}</strong> cambian de costo o precio ·
              <strong>{{ count('SKIP') }}</strong> sin cambios
              @if (count('CHECK') > 0) {
                · <strong class="text-warning">{{ count('CHECK') }} por revisar</strong>
              }
            </p>
            @for (w of d.warnings; track w) {
              <p class="text-xs mt-1">{{ w }}</p>
            }
          </div>
          <p-button label="Subir otra lista" icon="pi pi-refresh" [text]="true" (onClick)="restart()" />
        </div>

        <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar filas">
          @for (f of filters; track f.value) {
            <button type="button" class="chip" [class.chip-on]="filter() === f.value" [attr.aria-pressed]="filter() === f.value"
                    (click)="filter.set(f.value)">{{ f.label }} ({{ f.value === 'ALL' ? edits().length : count(f.value) }})</button>
          }
        </div>

        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm min-w-[62rem]">
            <caption class="sr-only">Productos leídos de la lista</caption>
            <thead>
              <tr class="text-left text-xs text-muted border-b border-line">
                <th scope="col" class="py-2 px-3 w-10">
                  <input type="checkbox" [checked]="allVisibleSelected()" (change)="selectVisible($event)"
                         aria-label="Marcar todas las filas visibles" />
                </th>
                <th scope="col" class="py-2 px-2 font-medium">Producto</th>
                <th scope="col" class="py-2 px-2 font-medium">Categoría · unidad · impuesto</th>
                @if (d.inventory) {
                  <th scope="col" class="py-2 px-2 font-medium text-right">Hay</th>
                }
                <th scope="col" class="py-2 px-2 font-medium text-right">Costo (sin IVA)</th>
                <th scope="col" class="py-2 px-2 font-medium text-right">Precio {{ d.pricesIncludeTax ? '(con IVA)' : '(sin IVA)' }}</th>
                <th scope="col" class="py-2 px-2 font-medium text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              @for (e of visible(); track e.rowId) {
                <tr class="border-b border-line last:border-0 align-top" [class.opacity-60]="!e.selected">
                  <td class="py-3 px-3">
                    <input type="checkbox" [(ngModel)]="e.selected" (ngModelChange)="touch()"
                           [attr.aria-label]="'Guardar ' + e.name" />
                  </td>
                  <td class="py-2 px-2 min-w-64">
                    <span class="badge" [class]="'badge-' + e.action.toLowerCase()">{{ actionLabel(e.action) }}</span>
                    @if (e.action === 'CREATE') {
                      <input class="field mt-1 w-full font-medium" [(ngModel)]="e.name" (ngModelChange)="touch()"
                             maxlength="200" [attr.aria-label]="'Nombre de la fila ' + e.rowId" />
                      <input class="field mt-1 w-40 font-mono text-xs" [(ngModel)]="e.sku" (ngModelChange)="touch()"
                             maxlength="40" placeholder="SKU" [attr.aria-label]="'SKU de ' + e.name" />
                    } @else if (e.match !== null) {
                      @let m = e.match!;
                      <span class="block font-medium mt-1">{{ m.name }}</span>
                      <span class="block text-xs text-muted">{{ m.sku }} · antes {{ cop(m.currentCost) }} / {{ cop(m.currentPrice) }}</span>
                      <span class="block text-xs" [class.text-warning]="m.by === 'NAME'" [class.text-muted]="m.by !== 'NAME'">
                        {{ matchText(m) }}
                        @if (m.by === 'NAME') {
                          · <button type="button" class="underline" (click)="makeNew(e)">Es otro producto</button>
                        }
                      </span>
                    }
                    <span class="block text-xs text-muted mt-1">En la lista: {{ e.description }}
                      @if (e.supplierCode) { · {{ e.supplierCode }} } · {{ cop(e.listCost) }}</span>
                  </td>
                  <td class="py-2 px-2">
                    @if (e.action === 'CREATE') {
                      <input class="field w-40" [(ngModel)]="e.category" list="aska-categories" maxlength="60"
                             placeholder="Categoría" [attr.aria-label]="'Categoría de ' + e.name" />
                      <div class="flex gap-1 mt-1">
                        <select class="field" [(ngModel)]="e.unitCode" [attr.aria-label]="'Unidad de ' + e.name">
                          @for (u of d.units; track u.code) {
                            <option [value]="u.code">{{ u.code }}</option>
                          }
                        </select>
                        <select class="field" [(ngModel)]="e.taxCode" (ngModelChange)="touch()" [attr.aria-label]="'Impuesto de ' + e.name">
                          @for (t of d.taxes; track t.code) {
                            <option [value]="t.code">{{ t.name }}</option>
                          }
                        </select>
                      </div>
                    } @else {
                      <span class="text-xs text-muted">Se conservan los datos del producto.</span>
                    }
                  </td>
                  @if (d.inventory) {
                    <td class="py-2 px-2 text-right">
                      @if (e.stockNote) {
                        <span class="block text-xs text-muted max-w-36 ml-auto">{{ e.stockNote }}</span>
                      } @else {
                        <input type="number" min="0" step="any" class="field w-20 text-right" [(ngModel)]="e.quantity"
                               (ngModelChange)="touch()" [attr.aria-label]="'Cantidad de ' + e.name" />
                      }
                    </td>
                  }
                  <td class="py-2 px-2 text-right">
                    <input type="number" min="0" step="any" class="field w-28 text-right" [(ngModel)]="e.cost"
                           (ngModelChange)="touch()" [disabled]="e.match?.costLocked === true"
                           [attr.aria-label]="'Costo de ' + e.name" />
                    @if (e.match?.costLocked) {
                      <span class="block text-xs text-muted mt-1 max-w-36 ml-auto">El costo lo pone el inventario con la próxima compra.</span>
                    }
                  </td>
                  <td class="py-2 px-2 text-right">
                    <input type="number" min="0" step="100" class="field w-28 text-right font-semibold" [(ngModel)]="e.price"
                           (ngModelChange)="touch()" [attr.aria-label]="'Precio de ' + e.name" />
                  </td>
                  <td class="py-2 px-2 text-right whitespace-nowrap">
                    @let mg = margin$(e);
                    <span [class.text-danger]="mg !== null && mg < 0" [class.text-warning]="mg !== null && mg >= 0 && mg < 10">
                      {{ mg === null ? '—' : mg + ' %' }}</span>
                    @if (problemOf(e); as p) {
                      <span class="block text-xs text-danger mt-1">{{ p }}</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="d.inventory ? 7 : 6" class="py-6 text-center text-muted">No hay filas con este filtro.</td></tr>
              }
            </tbody>
          </table>
          <datalist id="aska-categories">
            @for (c of d.categories; track c) {
              <option [value]="c"></option>
            }
          </datalist>
        </div>

        @if (report(); as r) {
          @if (r.errors.length > 0) {
            <section class="card p-4" role="alert">
              <h2 class="font-bold mb-2">No se guardó nada: hay que corregir esto</h2>
              <ul class="text-sm text-danger list-disc list-inside">
                @for (err of r.errors; track err.row + err.message) {
                  <li>{{ rowName(err.row) }}: {{ err.message }}</li>
                }
              </ul>
            </section>
          }
        }

        <div class="aska-footer">
          <p class="text-sm flex-1 min-w-48">
            @if (selectedCount() === 0) {
              Marca los productos que quieres guardar.
            } @else if (problems() > 0) {
              <span class="text-danger">{{ problems() }} {{ problems() === 1 ? 'fila tiene' : 'filas tienen' }} algo por corregir.</span>
            } @else {
              Se van a guardar <strong>{{ selectedCount() }}</strong> productos. Si el costo baja, el precio se mantiene: bájalo tú si quieres.
            }
          </p>
          <p-button [label]="'Guardar ' + selectedCount() + ' productos'" icon="pi pi-check" severity="success"
                    [disabled]="selectedCount() === 0 || problems() > 0" [loading]="saving()" (onClick)="save()" />
        </div>
      </section>
    }
  `,
  styles: `
    .aska-upload { border-top: 4px solid var(--aska); }
    .mode-switch { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.5rem; }
    .mode-switch button {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0.875rem; text-align: left; border-radius: 0.875rem;
      border: 1.5px solid var(--color-line); background: var(--color-surface); color: var(--color-muted);
    }
    .mode-switch button i { font-size: 1.25rem; color: var(--aska); }
    .mode-switch .mode-on { border-color: var(--aska); background: var(--aska-soft); color: var(--aska-soft-fg); }
    .aska-drop {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem; min-height: 8rem;
      padding: 1rem; border: 2px dashed var(--aska-line); border-radius: 1rem; background: var(--aska-soft);
      color: var(--aska-soft-fg); cursor: pointer; text-align: center;
    }
    .aska-drop:focus-within { outline: 2px solid var(--aska); outline-offset: 2px; }
    .aska-drop-ready { border-style: solid; }
    .aska-button {
      display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; padding: 0 1.125rem 0 0.5rem;
      border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; color: var(--aska-contrast);
      background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
      box-shadow: 0 0 0 4px var(--aska-glow), 0 6px 16px var(--aska-shadow);
    }
    .aska-button:disabled { opacity: 0.6; box-shadow: none; }
    .aska-problem { display: flex; gap: 0.5rem; align-items: center; font-size: 0.875rem; color: var(--color-danger); }
    .aska-summary {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.875rem; padding: 0.875rem 1rem; border-radius: 1rem;
      background: var(--aska-soft); color: var(--aska-soft-fg); border: 1px solid var(--aska-line);
    }
    .chip {
      min-height: 2.25rem; padding: 0 0.875rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600;
      border: 1px solid var(--color-line); background: var(--color-surface);
    }
    .chip-on { background: var(--aska); border-color: var(--aska); color: var(--aska-contrast); }
    .field { min-height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--color-line); background: var(--color-surface); padding: 0 0.5rem; }
    .field:disabled { opacity: 0.6; }
    .badge {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.6875rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.02em;
    }
    .badge-create { background: var(--aska); color: var(--aska-contrast); }
    .badge-update { background: var(--aska-soft); color: var(--aska-soft-fg); border: 1px solid var(--aska-line); }
    .badge-skip { background: var(--color-surface-alt); color: var(--color-muted); }
    .aska-footer {
      position: sticky; bottom: 0.75rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
      padding: 0.75rem 1rem; border-radius: 1rem; background: var(--color-surface); border: 1px solid var(--color-line);
      box-shadow: 0 8px 24px var(--aska-glow);
    }
  `,
})
export class CatalogImportComponent implements OnInit {
  private readonly ai = inject(AiApi);
  private readonly parties = inject(PartiesApi);
  private readonly organization = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);

  protected readonly canAsk = permissionFlag('ai:ask');
  protected readonly suppliers = signal<Party[]>([]);
  protected readonly usage = signal<AskUsage | null>(null);
  protected readonly files = signal<File[]>([]);
  protected readonly reading = signal(false);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly draft = signal<CatalogDraft | null>(null);
  protected readonly edits = signal<CatalogEdit[]>([]);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly filter = signal<Filter>('ALL');
  /** Sube con cada cambio en una fila para recalcular los conteos (las filas se editan en su lugar). */
  private readonly version = signal(0);
  protected readonly readingMessages = ['Leyendo la lista…', 'Buscando tus productos…', 'Calculando precios…',
    'Casi listo…'];
  protected supplierId = '';
  /** Decisión 306: cargar lo que el negocio tiene (cuaderno, hojas, Excel) con saldo inicial en una sede. */
  protected readonly inventory = signal(false);
  protected readonly branches = signal<Branch[]>([]);
  protected branchId = '';
  protected margin = 30;

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'CREATE', label: 'Nuevos' },
    { value: 'UPDATE', label: 'Cambian' },
    { value: 'CHECK', label: 'Por revisar' },
    { value: 'SKIP', label: 'Sin cambios' },
  ];

  protected readonly fileNames = computed(() => this.files().map((f) => f.name).join(', '));
  protected readonly visible = computed(() => {
    this.version();
    const f = this.filter();
    return this.edits().filter((e) => f === 'ALL' || (f === 'CHECK' ? this.needsCheck(e) : e.action === f));
  });
  protected readonly selectedCount = computed(() => {
    this.version();
    return this.edits().filter((e) => e.selected).length;
  });
  protected readonly problems = computed(() => {
    this.version();
    return this.edits().filter((e) => rowProblem(e) !== null).length;
  });
  protected readonly allVisibleSelected = computed(() => {
    this.version();
    const v = this.visible();
    return v.length > 0 && v.every((e) => e.selected);
  });

  ngOnInit(): void {
    if (!this.canAsk()) {
      return;
    }
    this.ai.catalogUsage().subscribe({ next: (u) => this.usage.set(u), error: () => this.usage.set(null) });
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((page) => {
      const active = page.content.filter((b) => b.active);
      this.branches.set(active);
      this.branchId = active[0]?.id ?? '';
    });
    if (this.route.snapshot.queryParamMap.get('modo') === 'inventario') {
      this.inventory.set(true);
    }
    this.parties.search('suppliers', { page: 0, size: 100, sort: 'displayName,asc' }, null, false).subscribe({
      next: (page) => this.suppliers.set(page.content.filter((p) => !p.system)),
      error: () => this.suppliers.set([]),
    });
  }

  protected marginOk(): boolean {
    return Number.isFinite(this.margin) && this.margin >= 0 && this.margin <= 90;
  }

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    if (chosen.length === 0) {
      return;
    }
    this.problem.set(chosen.length > 10 ? 'Sube máximo 10 fotos por vez.' : null);
    this.files.set(chosen.slice(0, 10));
  }

  async read(): Promise<void> {
    if (this.files().length === 0 || this.reading()) {
      return;
    }
    this.reading.set(true);
    this.problem.set(null);
    // Las fotos se achican antes de subir (más rápido y más barato); Excel, CSV y PDF van tal cual.
    const files = await Promise.all(this.files().map((f) => f.type.startsWith('image/') ? shrinkPhoto(f) : f));
    const inventory = this.inventory();
    this.ai.readCatalog(files, inventory ? null : this.supplierId || null, this.margin,
      inventory ? this.branchId || null : null).subscribe({
      next: (draft) => {
        this.reading.set(false);
        this.usage.set(draft.usage);
        this.report.set(null);
        this.edits.set(toEdits(draft));
        this.filter.set('ALL');
        this.draft.set(draft);
      },
      error: (error: unknown) => {
        this.reading.set(false);
        this.problem.set(error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500
          ? problemMessage(error)
          : 'No me pude conectar. Revisa el internet e intenta de nuevo.');
      },
    });
  }

  restart(): void {
    this.draft.set(null);
    this.edits.set([]);
    this.report.set(null);
    this.files.set([]);
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  selectVisible(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.visible().forEach((e) => (e.selected = on));
    this.touch();
  }

  makeNew(edit: CatalogEdit): void {
    const d = this.draft();
    if (d) {
      this.edits.update((list) => list.map((e) => (e.rowId === edit.rowId ? asNew(e, d) : e)));
      this.touch();
    }
  }

  save(): void {
    if (this.selectedCount() === 0 || this.problems() > 0) {
      return;
    }
    this.saving.set(true);
    const d = this.draft();
    this.ai.applyCatalog(toConfirmed(this.edits()), d?.inventory ? null : this.supplierId || null,
      d?.inventory ? d.branchId : null).subscribe({
      next: ({ report, stocked }) => {
        this.saving.set(false);
        this.report.set(report);
        if (report.applied) {
          this.messages.add({ severity: 'success', summary: 'Catálogo al día',
            detail: `${report.toCreate} nuevos, ${report.toUpdate} actualizados`
              + (stocked > 0 ? `, ${stocked} con su cantidad en inventario.` : '.') });
          void this.router.navigate(['/app/productos']);
        }
      },
      error: () => this.saving.set(false),
    });
  }

  protected count(f: Filter): number {
    this.version();
    return this.edits().filter((e) => (f === 'CHECK' ? this.needsCheck(e) : e.action === f)).length;
  }

  private needsCheck(e: CatalogEdit): boolean {
    return e.match?.by === 'NAME' || rowProblem(e) !== null;
  }

  protected margin$(e: CatalogEdit): number | null {
    const d = this.draft();
    return d ? marginOf(e, d.taxes, d.pricesIncludeTax) : null;
  }

  protected problemOf(e: CatalogEdit): string | null {
    return rowProblem(e);
  }

  /** El importador numera desde 2 (la fila 1 son los títulos): se traduce al nombre del producto marcado. */
  protected rowName(row: number): string {
    const chosen = this.edits().filter((e) => e.selected);
    return chosen[row - 2]?.name ?? `Fila ${row}`;
  }

  protected actionLabel(a: CatalogEdit['action']): string {
    return a === 'CREATE' ? 'Nuevo' : a === 'UPDATE' ? 'Cambia' : 'Sin cambios';
  }

  protected matchText(m: NonNullable<CatalogEdit['match']>): string {
    return matchLabel(m);
  }

  protected cop(v: number | null): string {
    return formatCop(v);
  }
}
