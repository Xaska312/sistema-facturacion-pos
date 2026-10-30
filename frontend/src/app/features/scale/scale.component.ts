import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, throwError } from 'rxjs';
import { Product, ScaleFormat, ScalePlu } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ScaleApi } from '../../core/api/scale.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { ConfirmService } from '../../shared/confirm';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';
import { exampleLabel, formatProblem, valueDigits } from './scale-format';

const PREFIXES = ['2', '20', '21', '22', '23', '24', '25', '26', '27', '28'];

/**
 * Báscula etiquetadora (fase 8e): el formato de sus etiquetas (EAN-13 que empieza por 2) y qué producto es cada PLU.
 * Con eso, el lector del POS agrega el producto con el peso o el valor de la etiqueta.
 */
@Component({
  selector: 'app-scale',
  imports: [FormsModule, ButtonModule, InputTextModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <app-page-header title="Báscula"
                     description="Para vender lo que se pesa (queso, carnes, frutas) con las etiquetas que imprime la báscula: el lector agrega el producto con su peso o su valor." />

    @if (format(); as f) {
      <section class="card p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
        <h2 class="text-base font-bold tracking-tight">Formato de las etiquetas</h2>
        <fieldset class="flex flex-col gap-4" [disabled]="!canManage()">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" [(ngModel)]="f.enabled" (ngModelChange)="touch()" />
            Leer etiquetas de báscula en la venta
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">El código empieza por</span>
              <select class="border rounded px-2 py-2" [(ngModel)]="f.prefix" (ngModelChange)="touch()">
                @for (p of prefixes; track p) {
                  <option [value]="p">{{ p }}</option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Dígitos del PLU</span>
              <select class="border rounded px-2 py-2" [ngModel]="f.pluDigits" (ngModelChange)="f.pluDigits = +$event; touch()">
                @for (n of [3, 4, 5, 6]; track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">La etiqueta trae</span>
              <select class="border rounded px-2 py-2" [ngModel]="f.kind" (ngModelChange)="setKind(f, $event)">
                <option value="WEIGHT">El peso</option>
                <option value="PRICE">El precio</option>
              </select>
            </label>
            @if (f.kind === 'WEIGHT') {
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium">El peso viene en</span>
                <select class="border rounded px-2 py-2" [ngModel]="f.decimals" (ngModelChange)="f.decimals = +$event; touch()">
                  <option [value]="3">Gramos (00750 = 0,750 kg)</option>
                  <option [value]="2">Decagramos (075 = 0,75 kg)</option>
                  <option [value]="1">Hectogramos (0075 = 7,5 kg)</option>
                  <option [value]="0">Kilos enteros</option>
                </select>
              </label>
            }
          </div>
        </fieldset>
        @if (problem(); as message) {
          <p class="text-sm text-danger" role="alert">{{ message }}</p>
        } @else {
          @let example = sample();
          <div class="text-sm rounded-lg bg-surface-alt p-3 flex flex-col gap-1">
            <span class="text-muted">Ejemplo de etiqueta ({{ digits() }} dígitos para el {{ f.kind === 'WEIGHT' ? 'peso' : 'precio' }}):</span>
            <span class="font-mono text-base">
              <span class="font-semibold">{{ example.parts[0] }}</span>·<span class="text-brand font-semibold">{{ example.parts[1] }}</span>·<span class="font-semibold">{{ example.parts[2] }}</span>·{{ example.parts[3] }}
            </span>
            <span>{{ example.meaning }}. Compáralo con una etiqueta real de tu báscula.</span>
          </div>
        }
        @if (canManage()) {
          <div class="flex justify-end">
            <p-button label="Guardar formato" icon="pi pi-check" [loading]="saving()" [disabled]="!dirty() || !!problem()"
                      (onClick)="saveFormat()" />
          </div>
        }
      </section>
    }

    <section class="mt-6 max-w-3xl flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-base font-bold tracking-tight">PLU de los productos</h2>
          <p class="text-sm text-muted">El mismo número que tiene cada producto en la báscula. Solo productos que se venden por peso (KG, LB…).</p>
        </div>
        @if (canManage()) {
          <p-button label="Asignar PLU" icon="pi pi-plus" (onClick)="openAssign()" />
        }
      </div>
      <app-data-table [columns]="columns" [items]="plus()" [trackBy]="trackByPlu" caption="PLU de la báscula"
                      emptyIcon="pi pi-tag" emptyTitle="Aún no hay PLU asignados"
                      emptyMessage="Asigna a cada producto que pesas el PLU que le pusiste en la báscula.">
        <ng-template #actions let-row>
          @if (canManage()) {
            <p-button label="Quitar" icon="pi pi-times" size="small" severity="danger" [text]="true" (onClick)="remove(row)" />
          }
        </ng-template>
      </app-data-table>
    </section>

    <app-form-dialog [(visible)]="assignOpen" width="32rem" header="Asignar PLU" [dirty]="!!pluText.trim() || !!chosen()"
                     [invalidMessage]="assignProblem()" [save]="assign" successMessage="PLU asignado" (saved)="loadPlus()">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label for="plu-number" class="text-sm font-medium">PLU</label>
          <input pInputText id="plu-number" [(ngModel)]="pluText" inputmode="numeric" maxlength="6" class="w-32" autocomplete="off" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="plu-search" class="text-sm font-medium">Producto</label>
          @if (chosen(); as p) {
            <div class="flex items-center justify-between gap-2 border rounded-lg px-3 py-2">
              <span><span class="font-mono text-xs text-muted">{{ p.sku }}</span> {{ p.name }} <span class="text-muted">({{ p.baseUnitCode }})</span></span>
              <p-button label="Cambiar" size="small" [text]="true" (onClick)="chosen.set(null)" />
            </div>
          } @else {
            <div class="flex gap-2">
              <input pInputText id="plu-search" class="flex-1" [(ngModel)]="search" placeholder="Nombre o SKU"
                     autocomplete="off" (keydown.enter)="find($event)" />
              <p-button label="Buscar" icon="pi pi-search" [outlined]="true" (onClick)="find()" />
            </div>
            @if (results().length > 0) {
              <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
                @for (r of results(); track r.id) {
                  <li>
                    <button type="button" class="w-full text-left px-3 py-2 hover:bg-surface-alt" (click)="chosen.set(r)">
                      <span class="font-mono text-xs text-muted">{{ r.sku }}</span> {{ r.name }}
                      <span class="text-muted">({{ r.baseUnitCode }})</span>
                    </button>
                  </li>
                }
              </ul>
            }
          }
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class ScaleComponent implements OnInit {
  private readonly api = inject(ScaleApi);
  private readonly catalog = inject(CatalogApi);
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(MessageService);
  protected readonly canManage = permissionFlag('products:manage');
  protected readonly prefixes = PREFIXES;

  /** Borrador del formato (se edita con ngModel); {@code version} hace que lo calculado se actualice. */
  protected readonly format = signal<ScaleFormat | null>(null);
  private readonly version = signal(0);
  private saved = '';
  protected readonly saving = signal(false);
  protected readonly problem = computed(() => {
    this.version();
    const f = this.format();
    return f ? formatProblem(f) : null;
  });
  protected readonly sample = computed(() => {
    this.version();
    const f = this.format();
    return f ? exampleLabel(f) : { code: '', parts: ['', '', '', ''], meaning: '' };
  });
  protected readonly digits = computed(() => {
    this.version();
    const f = this.format();
    return f ? valueDigits(f) : 0;
  });
  protected readonly dirty = computed(() => {
    this.version();
    return JSON.stringify(this.format()) !== this.saved;
  });

  protected readonly plus = signal<ScalePlu[]>([]);
  protected readonly trackByPlu = (row: ScalePlu): string => row.plu;
  protected readonly columns: ColumnDef<ScalePlu>[] = [
    { header: 'PLU', cell: (r) => r.plu, kind: 'mono' },
    { header: 'SKU', cell: (r) => r.sku, kind: 'mono', hideOnMobile: true },
    { header: 'Producto', cell: (r) => r.name },
    { header: 'Unidad', cell: (r) => r.unitCode },
  ];

  protected assignOpen = false;
  protected pluText = '';
  protected search = '';
  protected readonly results = signal<Product[]>([]);
  protected readonly chosen = signal<Product | null>(null);

  ngOnInit(): void {
    this.api.settings().subscribe((f) => this.setFormat(f));
    this.loadPlus();
  }

  loadPlus(): void {
    this.api.plus().subscribe((list) => this.plus.set(list));
  }

  /** Al volver a "peso", si los decimales quedaron en 0 (guardado como precio), se sugieren gramos. */
  protected setKind(format: ScaleFormat, kind: ScaleFormat['kind']): void {
    format.kind = kind;
    if (kind === 'WEIGHT' && format.decimals === 0) {
      format.decimals = 3;
    }
    this.touch();
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  protected saveFormat(): void {
    const f = this.format();
    if (!f || this.problem()) {
      return;
    }
    this.saving.set(true);
    this.api.saveSettings(f).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.setFormat(saved);
        this.messages.add({ severity: 'success', summary: 'Formato guardado', life: 3000 });
      },
      error: () => this.saving.set(false),
    });
  }

  openAssign(): void {
    this.pluText = '';
    this.search = '';
    this.results.set([]);
    this.chosen.set(null);
    this.assignOpen = true;
  }

  protected find(event?: Event): void {
    event?.preventDefault();
    const term = this.search.trim();
    if (!term) {
      return;
    }
    this.catalog.products({ page: 0, size: 15, search: term })
      .subscribe((page) => this.results.set(page.content.filter((p) => p.active)));
  }

  protected assignProblem(): string | null {
    if (!/^\d{1,6}$/.test(this.pluText.trim()) || Number(this.pluText) === 0) {
      return 'Escribe el PLU (de 1 a 6 dígitos, como en la báscula).';
    }
    return this.chosen() ? null : 'Elige el producto.';
  }

  protected readonly assign = (): Observable<unknown> => {
    const product = this.chosen();
    return product ? this.api.assign(this.pluText.trim(), product.id) : throwError(() => new Error('Sin producto'));
  };

  remove(row: ScalePlu): void {
    this.confirm.ask({
      header: 'Quitar PLU',
      message: `¿Quitar el PLU ${row.plu} de ${row.name}? Sus etiquetas ya no se reconocerán en la venta.`,
      acceptLabel: 'Quitar PLU',
      danger: true,
      accept: () => this.api.remove(row.plu).subscribe(() => this.loadPlus()),
    });
  }

  private setFormat(f: ScaleFormat): void {
    this.format.set({ ...f });
    this.saved = JSON.stringify(this.format());
    this.touch();
  }
}
