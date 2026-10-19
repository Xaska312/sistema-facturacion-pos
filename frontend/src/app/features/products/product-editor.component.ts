import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin } from 'rxjs';
import { Category, PriceList, Product, Tax, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { formatCop } from '../../shared/money';
import { barcodeGroup, conversionGroup, fillForm, listPriceGroup, productForm, skuFromName, toInput } from './product-form';
import { ConfirmService } from '../../shared/confirm';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { TermComponent } from '../../shared/help/term.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { permissionFlag } from '../../core/auth/permission-flag';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';

/** Alta y edición de un producto: datos, presentaciones, códigos de barras y precios por lista. */
@Component({
  selector: 'app-product-editor',
  imports: [TermComponent, ReactiveFormsModule, PesosInputDirective, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, StatusBadgeComponent],
  template: `
    <app-page-header [title]="isNew() ? 'Nuevo producto' : (product()?.name ?? 'Producto')">
      @if (product()?.active === false) {
        <app-status-badge status="inactive" />
      }
    </app-page-header>

    @if (product()?.modelId; as modelId) {
      <div class="card p-3 mb-4 max-w-4xl flex flex-wrap items-center gap-2 text-sm" role="note">
        <i class="pi pi-th-large text-brand" aria-hidden="true"></i>
        <span>Esta es una talla de un modelo: el nombre, el precio y los demás datos se cambian en el modelo, para todas
          sus tallas.</span>
        <a [routerLink]="['/app/productos/modelos', modelId]" class="font-medium text-brand hover:underline">Ir al modelo</a>
      </div>
    }

    <form [formGroup]="form" (ngSubmit)="save()" (keydown.enter)="ignoreEnter($event)" class="flex flex-col gap-4 max-w-4xl">
      <fieldset [disabled]="!editable()" class="flex flex-col gap-4">
        <!-- Datos básicos: en el orden en que los piensa quien vende (nombre, precio, costo…) -->
        <section class="card p-4 grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Nombre</span>
            <input pInputText formControlName="name" placeholder="Ej.: Gaseosa cola 400 ml" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">
              {{ form.controls.openPrice.value ? 'Precio sugerido (se cambia al vender)' : 'Precio de venta (al público)' }}
            </span>
            <input pInputText appPesos="2" formControlName="salePrice" />
            <small class="text-muted">{{ formatCop(form.controls.salePrice.value) }} por {{ unitCode(form.controls.baseUnitId.value) }}</small>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Costo (lo que te cuesta a ti)</span>
            <input pInputText appPesos="2" formControlName="cost"
                   [readonly]="product()?.costLocked === true" />
            @if (product()?.costLocked) {
              <small class="text-muted">
                <app-term term="costo-promedio">Costo promedio</app-term> ponderado, calculado por el inventario.
              </small>
            } @else {
              <small class="text-muted">Opcional. Sirve para saber cuánto ganas.</small>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Impuesto</span>
            <select formControlName="taxId" class="border rounded px-2 py-2">
              @for (t of activeTaxes(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
            <small class="text-muted">¿No sabes? La mayoría de productos llevan IVA 19 %.</small>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Categoría (opcional)</span>
            <select formControlName="categoryId" class="border rounded px-2 py-2">
              <option value="">Sin categoría</option>
              @for (c of activeCategories(); track c.id) {
                <option [value]="c.id">{{ categoryPath(c) }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Se vende por</span>
            <select formControlName="baseUnitId" class="border rounded px-2 py-2">
              @for (u of activeUnits(); track u.id) {
                <option [value]="u.id">{{ u.code }} — {{ u.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código interno (SKU)</span>
            <input pInputText formControlName="sku" class="uppercase"
                   [placeholder]="isNew() ? 'Se crea solo con el nombre' : ''" />
            <small class="text-muted">Para encontrarlo rápido. Si lo dejas vacío, lo creamos con el nombre.</small>
          </label>
          <label class="flex items-start gap-2 md:mt-6">
            <input type="checkbox" formControlName="trackInventory" class="mt-1" />
            <span>Llevar control de existencias
              <small class="block text-muted">Desmárcalo para servicios o cosas que no cuentas (bolsas, domicilios).</small>
            </span>
          </label>
          @if (!product()?.modelId) {
            <label class="flex items-start gap-2">
              <input type="checkbox" formControlName="openPrice" class="mt-1" />
              <span>Precio libre: pedir el precio al vender
                <small class="block text-muted">Para impresiones, anillados o servicios que cambian de precio. Al venderlo
                  escribes cuánto cobras; el precio de arriba queda como sugerido.</small>
              </span>
            </label>
          }
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-sm font-medium">Descripción (opcional)</span>
            <textarea formControlName="description" rows="2" class="border rounded px-2 py-2"></textarea>
          </label>
        </section>

        <!-- Códigos de barras -->
        <section class="card p-4 flex flex-col gap-2">
          <header class="flex items-center justify-between">
            <div>
              <h2 class="font-medium">Códigos de barras</h2>
              <p class="text-xs text-muted">Escanea aquí el código del empaque. Si no tiene, toca "Generar código interno".</p>
            </div>
            @if (editable()) {
              <span class="flex gap-2">
                <p-button label="Generar código interno" size="small" [text]="true" [loading]="generating()"
                          (onClick)="generateBarcode()" />
                <p-button label="Agregar" size="small" [text]="true" (onClick)="addBarcode()" />
              </span>
            }
          </header>
          @for (group of form.controls.barcodes.controls; track group; let i = $index) {
            <div [formGroup]="group" class="grid grid-cols-12 gap-2 items-end">
              <label class="col-span-5 flex flex-col gap-1">
                <span class="text-xs">Código {{ group.controls.internal.value ? '(interno)' : '' }}</span>
                <input pInputText formControlName="barcode" class="font-mono" [readonly]="group.controls.internal.value" />
              </label>
              <label class="col-span-5 flex flex-col gap-1">
                <span class="text-xs">Identifica</span>
                <select formControlName="unitId" class="border rounded px-2 py-2">
                  <option value="">{{ unitCode(form.controls.baseUnitId.value) }} (unidad base)</option>
                  @for (c of form.controls.conversions.controls; track c) {
                    @if (c.controls.unitId.value) {
                      <option [value]="c.controls.unitId.value">{{ unitCode(c.controls.unitId.value) }}</option>
                    }
                  }
                </select>
              </label>
              @if (editable()) {
                <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                          (onClick)="removeRow(form.controls.barcodes, i)" />
              }
            </div>
          } @empty {
            <p class="text-sm text-muted">Sin códigos. En la venta se podrá buscar por nombre o SKU.</p>
          }
        </section>

        @if (showAdvanced()) {
          <!-- Presentaciones -->
          <section class="card p-4 flex flex-col gap-2">
            <header class="flex items-center justify-between">
              <div>
                <h2 class="font-medium">Presentaciones</h2>
                <p class="text-xs text-muted">Ej.: una caja de 24 unidades. Si no pones precio, se calcula precio base × factor.</p>
              </div>
              @if (editable()) {
                <p-button label="Agregar" size="small" [text]="true" (onClick)="addConversion()" />
              }
            </header>
            @for (group of form.controls.conversions.controls; track group; let i = $index) {
              <div [formGroup]="group" class="grid grid-cols-12 gap-2 items-end">
                <label class="col-span-4 flex flex-col gap-1">
                  <span class="text-xs">Unidad</span>
                  <select formControlName="unitId" class="border rounded px-2 py-2">
                    @for (u of activeUnits(); track u.id) {
                      @if (u.id !== form.controls.baseUnitId.value) {
                        <option [value]="u.id">{{ u.code }} — {{ u.name }}</option>
                      }
                    }
                  </select>
                </label>
                <label class="col-span-3 flex flex-col gap-1">
                  <span class="text-xs">Contiene ({{ unitCode(form.controls.baseUnitId.value) }})</span>
                  <input pInputText type="number" min="0" step="any" formControlName="factor" />
                </label>
                <label class="col-span-3 flex flex-col gap-1">
                  <span class="text-xs">Precio (opcional)</span>
                  <input pInputText appPesos="2" formControlName="salePrice"
                         [placeholder]="formatCop(form.controls.salePrice.value * group.controls.factor.value)" />
                </label>
                @if (editable()) {
                  <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                            (onClick)="removeRow(form.controls.conversions, i)" />
                }
              </div>
            } @empty {
              <p class="text-sm text-muted">Se vende solo por {{ unitCode(form.controls.baseUnitId.value) }}.</p>
            }
          </section>

          <!-- Precios por lista -->
          @if (extraLists().length > 0) {
            <section class="card p-4 flex flex-col gap-2">
              <header class="flex items-center justify-between">
                <div>
                  <h2 class="font-medium">Precios en otras listas</h2>
                  <p class="text-xs text-muted">Si una lista no tiene precio para una unidad, se usa el de la lista General.</p>
                </div>
                @if (editable()) {
                  <p-button label="Agregar" size="small" [text]="true" (onClick)="addListPrice()" />
                }
              </header>
              @for (group of form.controls.listPrices.controls; track group; let i = $index) {
                <div [formGroup]="group" class="grid grid-cols-12 gap-2 items-end">
                  <label class="col-span-4 flex flex-col gap-1">
                    <span class="text-xs">Lista</span>
                    <select formControlName="priceListId" class="border rounded px-2 py-2">
                      @for (l of extraLists(); track l.id) {
                        <option [value]="l.id">{{ l.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="col-span-3 flex flex-col gap-1">
                    <span class="text-xs">Unidad</span>
                    <select formControlName="unitId" class="border rounded px-2 py-2">
                      <option [value]="form.controls.baseUnitId.value">{{ unitCode(form.controls.baseUnitId.value) }}</option>
                      @for (c of form.controls.conversions.controls; track c) {
                        @if (c.controls.unitId.value) {
                          <option [value]="c.controls.unitId.value">{{ unitCode(c.controls.unitId.value) }}</option>
                        }
                      }
                    </select>
                  </label>
                  <label class="col-span-3 flex flex-col gap-1">
                    <span class="text-xs">Precio</span>
                    <input pInputText appPesos="2" formControlName="price" />
                  </label>
                  @if (editable()) {
                    <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                              (onClick)="removeRow(form.controls.listPrices, i)" />
                  }
                </div>
              } @empty {
                <p class="text-sm text-muted">Usa los precios de la lista General.</p>
              }
            </section>
          }
        } @else {
          <button type="button" class="self-start text-sm text-brand hover:underline" (click)="showAdvanced.set(true)">
            <i class="pi pi-angle-down text-xs" aria-hidden="true"></i> Más opciones: presentaciones (caja de 24…) y otras listas de precios
          </button>
        }
      </fieldset>

      @if (editable()) {
        <div class="flex justify-end gap-2">
          <a routerLink="/app/productos"><p-button label="Cancelar" [text]="true" severity="secondary" /></a>
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      }
    </form>
  `,
})
export class ProductEditorComponent implements OnInit, HasUnsavedChanges {
  /** Parámetro de ruta :id (ausente en /nuevo). */
  readonly id = input<string>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  protected readonly canEdit = permissionFlag('products:manage');
  private readonly canAdjustStock = permissionFlag('inventory:adjust');
  private readonly confirm = inject(ConfirmService);
  /** Una talla de un modelo no se edita aquí (fase 8d): solo desde su modelo. */
  protected readonly editable = computed(() => this.canEdit() && !this.product()?.modelId);
  protected readonly formatCop = formatCop;

  protected readonly form = productForm(this.fb);
  protected readonly product = signal<Product | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly saving = signal(false);
  protected readonly generating = signal(false);
  /** Presentaciones y otras listas de precios: escondidas al empezar (fase de arranque), visibles si el producto las usa. */
  protected readonly showAdvanced = signal(false);
  protected readonly isNew = computed(() => !this.id());
  protected readonly activeCategories = computed(() => this.categories().filter((c) => c.active));
  protected readonly activeUnits = computed(() => this.units().filter((u) => u.active));
  protected readonly activeTaxes = computed(() => this.taxes().filter((t) => t.active));
  protected readonly extraLists = computed(() => this.priceLists().filter((l) => l.active && !l.defaultList));
  /** Ya se guardó: salir hacia la lista no debe preguntar. */
  private saved = false;

  ngOnInit(): void {
    forkJoin({
      categories: this.api.categories(),
      units: this.api.units(),
      taxes: this.api.taxes(),
      priceLists: this.api.priceLists(),
    }).subscribe((refs) => {
      this.categories.set(refs.categories);
      this.units.set(refs.units);
      this.taxes.set(refs.taxes);
      this.priceLists.set(refs.priceLists);
      const id = this.id();
      if (id) {
        this.api.product(id).subscribe((p) => {
          this.product.set(p);
          fillForm(this.fb, this.form, p);
          this.showAdvanced.set(p.conversions.length > 0 || p.listPrices.length > 0);
        });
      } else {
        const und = refs.units.find((u) => u.code === 'UND');
        const iva = refs.taxes.find((t) => t.code === 'IVA19');
        this.form.patchValue({ baseUnitId: und?.id ?? '', taxId: iva?.id ?? '' });
      }
    });
  }

  protected unitCode(id: string): string {
    return this.units().find((u) => u.id === id)?.code ?? '';
  }

  protected categoryPath(category: Category): string {
    const byId = new Map<string, Category>(this.categories().map((c) => [c.id, c] as const));
    const names = [category.name];
    let parent = category.parentId ? byId.get(category.parentId) : undefined;
    while (parent && names.length < 10) {
      names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(' › ');
  }

  hasUnsavedChanges(): boolean {
    return this.editable() && !this.saved && this.form.dirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  addConversion(): void {
    this.form.controls.conversions.push(conversionGroup(this.fb));
    this.form.markAsDirty();
  }

  addBarcode(): void {
    this.form.controls.barcodes.push(barcodeGroup(this.fb));
    this.form.markAsDirty();
  }

  /** Quitar una fila (presentación, código o precio por lista) también es un cambio sin guardar. */
  protected removeRow(rows: FormArray, index: number): void {
    rows.removeAt(index);
    this.form.markAsDirty();
  }

  addListPrice(): void {
    const first = this.extraLists()[0];
    this.form.controls.listPrices.push(
      listPriceGroup(this.fb, first?.id ?? '', this.form.controls.baseUnitId.value, this.form.controls.salePrice.value));
    this.form.markAsDirty();
  }

  generateBarcode(): void {
    this.generating.set(true);
    this.api.internalBarcode().subscribe({
      next: ({ barcode }) => {
        this.generating.set(false);
        this.form.controls.barcodes.push(barcodeGroup(this.fb, barcode, '', true));
        this.form.markAsDirty();
      },
      error: () => this.generating.set(false),
    });
  }

  /**
   * Enter en un campo no guarda: el lector de códigos termina cada lectura con Enter y guardaba el producto a medio
   * crear (QA UI-1). Se guarda solo con el botón "Guardar".
   */
  protected ignoreEnter(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      event.preventDefault();
    }
  }

  save(): void {
    if (!this.form.controls.sku.value.trim()) {
      const sku = skuFromName(this.form.controls.name.value);
      if (!sku) {
        this.messages.add({ severity: 'warn', summary: 'Falta el nombre', detail: 'Escribe el nombre del producto.' });
        return;
      }
      this.form.controls.sku.setValue(sku);
    }
    const input = toInput(this.form);
    const current = this.product();
    this.saving.set(true);
    const request = current ? this.api.updateProduct(current.id, input) : this.api.createProduct(input);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Producto guardado', detail: saved.name });
        this.saved = true;
        if (!current && saved.trackInventory && this.canAdjustStock()) {
          this.offerInitialStock(saved);
        } else {
          void this.router.navigate(['/app/productos']);
        }
      },
      error: () => this.saving.set(false),
    });
  }

  /** Producto nuevo: el siguiente paso natural es decir cuántos hay (sin buscar dónde se hace). */
  private offerInitialStock(product: Product): void {
    this.confirm.ask({
      header: 'Producto creado',
      message: `¿Quieres registrar ahora cuántas unidades de ${product.name} tienes en el local?`,
      acceptLabel: 'Sí, registrar existencias',
      rejectLabel: 'Ahora no',
      accept: () => void this.router.navigate(['/app/inventario/nuevo/saldo-inicial'],
        { queryParams: { producto: product.id } }),
      reject: () => void this.router.navigate(['/app/productos']),
    });
  }
}
