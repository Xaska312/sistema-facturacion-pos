import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { Observable } from 'rxjs';
import { Category, PriceList, Tax, TaxType, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';

type Tab = 'categories' | 'units' | 'taxes' | 'price-lists';

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

/** Categorías, unidades, impuestos y listas de precios. */
@Component({
  selector: 'app-catalog-settings',
  imports: [FormsModule, NgTemplateOutlet, ButtonModule, DialogModule, InputTextModule, TagModule],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Ajustes del catálogo</h1>
      <p-button [label]="'Nueva ' + singular()" (onClick)="openCreate()" />
    </div>

    <div class="flex flex-wrap gap-2 mb-3">
      @for (t of tabs; track t.id) {
        <button type="button" class="px-3 py-1 rounded" [class.bg-brand]="tab() === t.id"
                [class.text-brand-contrast]="tab() === t.id" [attr.aria-pressed]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
      }
    </div>

    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <tbody>
          @switch (tab()) {
            @case ('categories') {
              @for (node of tree(); track node.category.id) {
                <tr class="border-t">
                  <td class="p-3" [style.padding-left.rem]="0.75 + node.depth * 1.5">{{ node.category.name }}</td>
                  <td class="p-3 text-right whitespace-nowrap">
                    <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: node.category, resource: 'categories' }" />
                  </td>
                </tr>
              } @empty {
                <tr><td class="p-6 text-center text-muted">Aún no hay categorías.</td></tr>
              }
            }
            @case ('units') {
              @for (u of units(); track u.id) {
                <tr class="border-t">
                  <td class="p-3 font-mono w-24">{{ u.code }}</td>
                  <td class="p-3">{{ u.name }}</td>
                  <td class="p-3 text-muted">{{ u.allowsDecimals ? 'Admite decimales' : 'Solo enteros' }}</td>
                  <td class="p-3 text-right whitespace-nowrap">
                    <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: u, resource: 'units' }" />
                  </td>
                </tr>
              }
            }
            @case ('taxes') {
              @for (t of taxes(); track t.id) {
                <tr class="border-t">
                  <td class="p-3 font-mono w-28">{{ t.code }}</td>
                  <td class="p-3">{{ t.name }}</td>
                  <td class="p-3">{{ taxTypeLabel[t.type] }}</td>
                  <td class="p-3">{{ t.rate }} %</td>
                  <td class="p-3 text-right whitespace-nowrap">
                    <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: t, resource: 'taxes' }" />
                  </td>
                </tr>
              }
            }
            @case ('price-lists') {
              @for (l of priceLists(); track l.id) {
                <tr class="border-t">
                  <td class="p-3 font-mono w-32">{{ l.code }}</td>
                  <td class="p-3">{{ l.name }}
                    @if (l.defaultList) {
                      <span class="text-xs text-muted">(precio de cada producto)</span>
                    }
                  </td>
                  <td class="p-3 text-right whitespace-nowrap">
                    @if (!l.defaultList) {
                      <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: l, resource: 'price-lists' }" />
                    } @else {
                      <p-tag value="Predeterminada" severity="info" />
                    }
                  </td>
                </tr>
              }
            }
          }
        </tbody>
      </table>
    </div>

    <ng-template #rowActions let-item let-resource="resource">
      <span class="inline-flex gap-2 items-center">
        @if (!item.active) {
          <p-tag value="Inactivo" severity="secondary" />
        }
        <p-button label="Editar" size="small" [text]="true" (onClick)="openEdit(item)" />
        <p-button [label]="item.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                  [severity]="item.active ? 'danger' : 'success'" (onClick)="toggle(resource, item)" />
      </span>
    </ng-template>

    <p-dialog [(visible)]="dialogOpen" [modal]="true" [header]="(editingId ? 'Editar ' : 'Nueva ') + singular()"
              [style]="{ width: '28rem' }">
      <div class="flex flex-col gap-3">
        @if (tab() !== 'categories' && !editingId) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código</span>
            <input pInputText [(ngModel)]="code" class="uppercase" />
          </label>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre</span>
          <input pInputText [(ngModel)]="name" />
        </label>
        @if (tab() === 'categories') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Dentro de</span>
            <select class="border rounded px-2 py-2" [(ngModel)]="parentId">
              <option value="">— Categoría principal —</option>
              @for (node of tree(); track node.category.id) {
                @if (!excludedParents().has(node.category.id) && node.category.active) {
                  <option [value]="node.category.id">{{ '— '.repeat(node.depth) }}{{ node.category.name }}</option>
                }
              }
            </select>
          </label>
        }
        @if (tab() === 'units') {
          <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="allowsDecimals" /> Admite decimales (peso, volumen)</label>
        }
        @if (tab() === 'taxes') {
          @if (!editingId) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Tipo</span>
              <select class="border rounded px-2 py-2" [(ngModel)]="taxType">
                @for (type of taxTypes; track type) {
                  <option [value]="type">{{ taxTypeLabel[type] }}</option>
                }
              </select>
            </label>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Tarifa (%)</span>
            <input pInputText type="number" min="0" max="100" step="0.01" [(ngModel)]="rate" />
          </label>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="dialogOpen = false" />
          <p-button label="Guardar" [loading]="saving()" [disabled]="!name.trim()" (onClick)="save()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class CatalogSettingsComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly tabs: { id: Tab; label: string; singular: string }[] = [
    { id: 'categories', label: 'Categorías', singular: 'categoría' },
    { id: 'units', label: 'Unidades', singular: 'unidad' },
    { id: 'taxes', label: 'Impuestos', singular: 'tarifa de impuesto' },
    { id: 'price-lists', label: 'Listas de precios', singular: 'lista de precios' },
  ];
  protected readonly taxTypes: TaxType[] = ['IVA', 'INC', 'EXEMPT', 'EXCLUDED'];
  protected readonly taxTypeLabel = TAX_TYPE_LABEL;

  protected readonly tab = signal<Tab>('categories');
  protected readonly categories = signal<Category[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly tree = computed(() => categoryTree(this.categories()));
  protected readonly singular = computed(() => this.tabs.find((t) => t.id === this.tab())?.singular ?? '');
  protected readonly saving = signal(false);
  /** Al editar, la categoría y sus descendientes no pueden ser su propio padre. */
  protected readonly editing = signal<string | null>(null);
  protected readonly excludedParents = computed(() => descendantsOf(this.categories(), this.editing()));

  protected dialogOpen = false;
  protected editingId: string | null = null;
  protected code = '';
  protected name = '';
  protected parentId = '';
  protected allowsDecimals = false;
  protected taxType: TaxType = 'IVA';
  protected rate = 19;

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
    this.dialogOpen = true;
  }

  openEdit(item: Category | Unit | Tax | PriceList): void {
    this.editingId = item.id;
    this.editing.set(item.id);
    this.name = item.name;
    this.parentId = 'parentId' in item ? (item.parentId ?? '') : '';
    this.allowsDecimals = 'allowsDecimals' in item ? item.allowsDecimals : false;
    this.rate = 'rate' in item ? item.rate : 0;
    this.dialogOpen = true;
  }

  save(): void {
    this.saving.set(true);
    this.saveRequest(this.name.trim(), this.editingId).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen = false;
        this.messages.add({ severity: 'success', summary: 'Guardado' });
        this.reload();
      },
      error: () => this.saving.set(false),
    });
  }

  private saveRequest(name: string, id: string | null): Observable<unknown> {
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
  }

  toggle(resource: Tab, item: { id: string; name: string; active: boolean }): void {
    const activate = !item.active;
    this.confirm.confirm({
      header: activate ? 'Activar' : 'Desactivar',
      message: `¿${activate ? 'Activar' : 'Desactivar'} ${item.name}?`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.api.setActive(resource, item.id, activate).subscribe(() => this.reload()),
    });
  }
}
