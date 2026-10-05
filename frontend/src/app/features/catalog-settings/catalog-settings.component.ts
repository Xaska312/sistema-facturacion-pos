import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Category, PriceList, Tax, TaxType, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ConfirmService } from '../../shared/confirm';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusKey, activeStatus } from '../../shared/status';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';

export type Tab = 'categories' | 'units' | 'taxes' | 'price-lists';

export const TAX_TYPE_LABEL: Record<TaxType, string> = {
  IVA: 'IVA',
  INC: 'Impoconsumo (INC)',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
};

/** Ordena las categorías como árbol (padre seguido de sus hijas) con su profundidad. */
export function categoryTree(categories: Category[]): { category: Category; depth: number }[] {
  const children = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId && categories.some((p) => p.id === c.parentId) ? c.parentId : null;
    const list = children.get(key) ?? [];
    list.push(c);
    children.set(key, list);
  }
  const result: { category: Category; depth: number }[] = [];
  const walk = (parent: string | null, depth: number): void => {
    const list = (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    for (const c of list) {
      result.push({ category: c, depth });
      if (depth < 20) {
        walk(c.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return result;
}

/** IDs de una categoría y todas sus descendientes (vacío si no hay categoría). */
export function descendantsOf(categories: Category[], rootId: string | null): Set<string> {
  const result = new Set<string>();
  if (!rootId) {
    return result;
  }
  result.add(rootId);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        added = true;
      }
    }
  }
  return result;
}

/** Fila común de las cuatro listas (categorías, unidades, impuestos y listas de precios). */
export interface SettingRow {
  id: string;
  name: string;
  active: boolean;
  code: string | null;
  /** Profundidad en el árbol de categorías. */
  depth: number;
  detail: string | null;
  locked: boolean;
  source: Category | Unit | Tax | PriceList;
}

export function settingRows(tab: Tab, data: { tree: { category: Category; depth: number }[]; units: Unit[];
  taxes: Tax[]; priceLists: PriceList[] }): SettingRow[] {
  switch (tab) {
    case 'categories':
      return data.tree.map(({ category, depth }) => ({
        id: category.id, name: category.name, active: category.active, code: null, depth, detail: null, locked: false,
        source: category,
      }));
    case 'units':
      return data.units.map((u) => ({
        id: u.id, name: u.name, active: u.active, code: u.code, depth: 0,
        detail: u.allowsDecimals ? 'Admite decimales' : 'Solo enteros', locked: false, source: u,
      }));
    case 'taxes':
      return data.taxes.map((t) => ({
        id: t.id, name: t.name, active: t.active, code: t.code, depth: 0,
        detail: `${TAX_TYPE_LABEL[t.type]} · ${t.rate.toLocaleString('es-CO')} %`, locked: false, source: t,
      }));
    default:
      return data.priceLists.map((l) => ({
        id: l.id, name: l.name, active: l.active, code: l.code, depth: 0,
        detail: l.defaultList ? 'Precio de cada producto' : null, locked: l.defaultList, source: l,
      }));
  }
}

/** Categorías, unidades, impuestos y listas de precios. */
@Component({
  selector: 'app-catalog-settings',
  imports: [FormsModule, ButtonModule, InputTextModule, DataTableComponent, CellTemplateDirective, PageHeaderComponent,
    FormDialogComponent],
  template: `
    <app-page-header title="Ajustes del catálogo"
                     description="Categorías, unidades de medida, tarifas de impuesto y listas de precios de tus productos.">
      <p-button [label]="'Nueva ' + singular()" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    <div class="flex flex-wrap gap-1 mb-3 p-1 rounded-lg bg-surface-alt w-fit" role="group" aria-label="Tipo de ajuste">
      @for (t of tabs; track t.id) {
        <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                [class.bg-surface]="tab() === t.id" [class.shadow-card]="tab() === t.id"
                [class.text-muted]="tab() !== t.id" [attr.aria-pressed]="tab() === t.id" (click)="tab.set(t.id)">
          {{ t.label }}
        </button>
      }
    </div>

    <app-data-table [columns]="columns()" [items]="rows()" [trackBy]="trackById" [caption]="currentTab().label"
                    [emptyTitle]="'Aún no hay ' + currentTab().label.toLowerCase()" emptyIcon="pi pi-tags"
                    [emptyActionLabel]="'Crear ' + singular()" (emptyAction)="openCreate()">
      <ng-template appCell="name" let-row>
        <span class="inline-flex items-center gap-2" [style.padding-left.rem]="row.depth * 1.25">
          @if (row.depth > 0) {
            <i class="pi pi-angle-right text-xs text-muted" aria-hidden="true"></i>
          }
          {{ row.name }}
        </span>
      </ng-template>
      <ng-template #actions let-row>
        @if (!row.locked) {
          <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row.source)" />
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" width="28rem" [header]="(editingId ? 'Editar ' : 'Nueva ') + singular()"
                     [dirty]="draftDirty()" [invalidMessage]="draftProblem()" [save]="saveRequest"
                     successMessage="Guardado" (saved)="reload()">
      <div class="flex flex-col gap-3">
        @if (tab() !== 'categories' && !editingId) {
          <div class="flex flex-col gap-1">
            <label for="setting-code" class="text-sm font-medium">Código</label>
            <input pInputText id="setting-code" [(ngModel)]="code" class="uppercase" autocomplete="off" />
            <small class="text-xs text-muted">Corto y sin espacios (p. ej. {{ codeExample() }}). No se puede cambiar después.</small>
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="setting-name" class="text-sm font-medium">Nombre</label>
          <input pInputText id="setting-name" [(ngModel)]="name" />
        </div>
        @if (tab() === 'categories') {
          <div class="flex flex-col gap-1">
            <label for="setting-parent" class="text-sm font-medium">Dentro de</label>
            <select id="setting-parent" class="border rounded-md px-2 py-2" [(ngModel)]="parentId">
              <option value="">— Categoría principal —</option>
              @for (node of tree(); track node.category.id) {
                @if (!excludedParents().has(node.category.id) && node.category.active) {
                  <option [value]="node.category.id">{{ '— '.repeat(node.depth) }}{{ node.category.name }}</option>
                }
              }
            </select>
          </div>
        }
        @if (tab() === 'units') {
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" [(ngModel)]="allowsDecimals" /> Admite decimales (peso, volumen)
          </label>
        }
        @if (tab() === 'taxes') {
          @if (!editingId) {
            <div class="flex flex-col gap-1">
              <label for="setting-tax-type" class="text-sm font-medium">Tipo</label>
              <select id="setting-tax-type" class="border rounded-md px-2 py-2" [(ngModel)]="taxType">
                @for (type of taxTypes; track type) {
                  <option [value]="type">{{ taxTypeLabel[type] }}</option>
                }
              </select>
            </div>
          }
          <div class="flex flex-col gap-1">
            <label for="setting-rate" class="text-sm font-medium">Tarifa (%)</label>
            <input pInputText id="setting-rate" type="number" min="0" max="100" step="0.01" [(ngModel)]="rate" />
          </div>
        }
      </div>
    </app-form-dialog>
  `,
})
export class CatalogSettingsComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(ConfirmService);

  protected readonly tabs: { id: Tab; label: string; singular: string; example: string }[] = [
    { id: 'categories', label: 'Categorías', singular: 'categoría', example: '' },
    { id: 'units', label: 'Unidades', singular: 'unidad', example: 'KG' },
    { id: 'taxes', label: 'Impuestos', singular: 'tarifa de impuesto', example: 'IVA5' },
    { id: 'price-lists', label: 'Listas de precios', singular: 'lista de precios', example: 'MAYORISTA' },
  ];
  protected readonly taxTypes: TaxType[] = ['IVA', 'INC', 'EXEMPT', 'EXCLUDED'];
  protected readonly taxTypeLabel = TAX_TYPE_LABEL;

  protected readonly tab = signal<Tab>('categories');
  protected readonly categories = signal<Category[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly tree = computed(() => categoryTree(this.categories()));
  protected readonly currentTab = computed(() => this.tabs.find((t) => t.id === this.tab()) ?? this.tabs[0]);
  protected readonly singular = computed(() => this.currentTab().singular);
  protected readonly codeExample = computed(() => this.currentTab().example);
  protected readonly rows = computed(() =>
    settingRows(this.tab(), { tree: this.tree(), units: this.units(), taxes: this.taxes(), priceLists: this.priceLists() }),
  );
  protected readonly columns = computed<ColumnDef<SettingRow>[]>(() => {
    const status: ColumnDef<SettingRow> = {
      header: 'Estado',
      cell: (r) => settingStatus(r),
      kind: 'status',
    };
    if (this.tab() === 'categories') {
      return [{ header: 'Nombre', cell: (r) => r.name, template: 'name' }, status];
    }
    return [
      { header: 'Código', cell: (r) => r.code, kind: 'mono' },
      { header: 'Nombre', cell: (r) => r.name },
      { header: 'Detalle', cell: (r) => r.detail },
      status,
    ];
  });
  /** Al editar, la categoría y sus descendientes no pueden ser su propio padre. */
  protected readonly editing = signal<string | null>(null);
  protected readonly excludedParents = computed(() => descendantsOf(this.categories(), this.editing()));
  protected readonly trackById = (row: SettingRow): string => row.id;

  protected dialogOpen = false;
  protected editingId: string | null = null;
  protected code = '';
  protected name = '';
  protected parentId = '';
  protected allowsDecimals = false;
  protected taxType: TaxType = 'IVA';
  protected rate = 19;
  private snapshot = '';

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.categories().subscribe((l) => this.categories.set(l));
    this.api.units().subscribe((l) => this.units.set(l));
    this.api.taxes().subscribe((l) => this.taxes.set(l));
    this.api.priceLists().subscribe((l) => this.priceLists.set(l));
  }

  openCreate(): void {
    this.editingId = null;
    this.editing.set(null);
    this.code = '';
    this.name = '';
    this.parentId = '';
    this.allowsDecimals = false;
    this.taxType = 'IVA';
    this.rate = 19;
    this.snapshot = this.draftJson();
    this.dialogOpen = true;
  }

  openEdit(item: Category | Unit | Tax | PriceList): void {
    this.editingId = item.id;
    this.editing.set(item.id);
    this.code = '';
    this.name = item.name;
    this.parentId = 'parentId' in item ? (item.parentId ?? '') : '';
    this.allowsDecimals = 'allowsDecimals' in item ? item.allowsDecimals : false;
    this.rate = 'rate' in item ? item.rate : 0;
    this.snapshot = this.draftJson();
    this.dialogOpen = true;
  }

  protected draftDirty(): boolean {
    return this.draftJson() !== this.snapshot;
  }

  protected draftProblem(): string | null {
    if (this.tab() !== 'categories' && !this.editingId && !this.code.trim()) {
      return 'Escribe el código.';
    }
    if (!this.name.trim()) {
      return 'Escribe el nombre.';
    }
    if (this.tab() === 'taxes' && (Number(this.rate) < 0 || Number(this.rate) > 100)) {
      return 'La tarifa debe estar entre 0 y 100 %.';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<unknown> => {
    const name = this.name.trim();
    const id = this.editingId;
    const tab = this.tab();
    if (tab === 'categories') {
      return this.api.saveCategory(id, name, this.parentId || null);
    }
    if (tab === 'units') {
      return id
        ? this.api.updateUnit(id, name, this.allowsDecimals)
        : this.api.createUnit(this.code.trim(), name, this.allowsDecimals);
    }
    if (tab === 'taxes') {
      return id
        ? this.api.updateTax(id, name, Number(this.rate))
        : this.api.createTax(this.code.trim(), name, this.taxType, Number(this.rate));
    }
    return id ? this.api.renamePriceList(id, name) : this.api.createPriceList(this.code.trim(), name);
  };

  toggle(row: SettingRow): void {
    const resource = this.tab();
    this.confirm.toggleActive({
      active: row.active,
      noun: this.singular(),
      name: row.name,
      consequence: 'No se podrá elegir en productos nuevos hasta que la actives de nuevo.',
      accept: () => this.api.setActive(resource, row.id, !row.active).subscribe(() => this.reload()),
    });
  }

  private draftJson(): string {
    return JSON.stringify([this.code, this.name, this.parentId, this.allowsDecimals, this.taxType, this.rate]);
  }
}

/** "Categoría", "unidad", "tarifa" y "lista" son femeninos: "Activa"/"Inactiva". */
function settingStatus(row: SettingRow): StatusKey {
  return row.locked ? 'default' : activeStatus(row.active, true);
}
