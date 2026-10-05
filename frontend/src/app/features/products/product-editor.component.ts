import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin } from 'rxjs';
import { Category, PriceList, Product, Tax, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatCop } from '../../shared/money';
import { barcodeGroup, conversionGroup, fillForm, listPriceGroup, productForm, toInput } from './product-form';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

/** Alta y edición de un producto: datos, presentaciones, códigos de barras y precios por lista. */
@Component({
  selector: 'app-product-editor',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, StatusBadgeComponent],
  template: `
    <app-page-header [title]="isNew() ? 'Nuevo producto' : (product()?.name ?? 'Producto')">
      @if (product()?.active === false) {
        <app-status-badge status="inactive" />
      }
    </app-page-header>

    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4 max-w-4xl">
      <fieldset [disabled]="!canEdit" class="flex flex-col gap-4">
        <!-- Datos básicos -->
        <section class="card p-4 grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">SKU</span>
            <input pInputText formControlName="sku" class="uppercase" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Nombre</span>
            <input pInputText formControlName="name" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Categoría</span>
            <select formControlName="categoryId" class="border rounded px-2 py-2">
              <option value="">Sin categoría</option>
              @for (c of activeCategories(); track c.id) {
                <option [value]="c.id">{{ categoryPath(c) }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Impuesto</span>
            <select formControlName="taxId" class="border rounded px-2 py-2">
              @for (t of activeTaxes(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Unidad base</span>
            <select formControlName="baseUnitId" class="border rounded px-2 py-2">
              @for (u of activeUnits(); track u.id) {
                <option [value]="u.id">{{ u.code }} — {{ u.name }}</option>
              }
            </select>
          </label>
          <label class="flex items-center gap-2 mt-6">
            <input type="checkbox" formControlName="trackInventory" /> Controla inventario
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Costo</span>
            <input pInputText type="number" min="0" step="0.01" formControlName="cost"
                   [readonly]="product()?.costLocked === true" />
            @if (product()?.costLocked) {
              <small class="text-muted">Costo promedio ponderado, calculado por el inventario.</small>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Precio de venta (lista General)</span>
            <input pInputText type="number" min="0" step="0.01" formControlName="salePrice" />
            <small class="text-muted">{{ formatCop(form.controls.salePrice.value) }} por {{ unitCode(form.controls.baseUnitId.value) }}</small>
          </label>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-sm font-medium">Descripción</span>
            <textarea formControlName="description" rows="2" class="border rounded px-2 py-2"></textarea>
          </label>
        </section>

        <!-- Presentaciones -->
        <section class="card p-4 flex flex-col gap-2">
          <header class="flex items-center justify-between">
            <div>
              <h2 class="font-medium">Presentaciones</h2>
              <p class="text-xs text-muted">Ej.: una caja de 24 unidades. Si no pones precio, se calcula precio base × factor.</p>
            </div>
            @if (canEdit) {
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
                <input pInputText type="number" min="0" step="0.01" formControlName="salePrice"
                       [placeholder]="formatCop(form.controls.salePrice.value * group.controls.factor.value)" />
              </label>
              @if (canEdit) {
                <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                          (onClick)="form.controls.conversions.removeAt(i)" />
              }
            </div>
          } @empty {
            <p class="text-sm text-muted">Se vende solo por {{ unitCode(form.controls.baseUnitId.value) }}.</p>
          }
        </section>

        <!-- Códigos de barras -->
        <section class="card p-4 flex flex-col gap-2">
          <header class="flex items-center justify-between">
            <h2 class="font-medium">Códigos de barras</h2>
            @if (canEdit) {
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
              @if (canEdit) {
                <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                          (onClick)="form.controls.barcodes.removeAt(i)" />
              }
            </div>
          } @empty {
            <p class="text-sm text-muted">Sin códigos. En la venta se podrá buscar por nombre o SKU.</p>
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
              @if (canEdit) {
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
                  <input pInputText type="number" min="0" step="0.01" formControlName="price" />
                </label>
                @if (canEdit) {
                  <p-button class="col-span-2" label="Quitar" size="small" [text]="true" severity="danger"
                            (onClick)="form.controls.listPrices.removeAt(i)" />
                }
              </div>
            } @empty {
              <p class="text-sm text-muted">Usa los precios de la lista General.</p>
            }
          </section>
        }
      </fieldset>

      @if (canEdit) {
        <div class="flex justify-end gap-2">
          <a routerLink="/app/productos"><p-button label="Cancelar" [text]="true" severity="secondary" /></a>
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      }
    </form>
  `,
})
export class ProductEditorComponent implements OnInit {
  /** Parámetro de ruta :id (ausente en /nuevo). */
  readonly id = input<string>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  protected readonly canEdit = inject(AuthService).hasPermission('products:manage');
  protected readonly formatCop = formatCop;

  protected readonly form = productForm(this.fb);
  protected readonly product = signal<Product | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly saving = signal(false);
  protected readonly generating = signal(false);
  protected readonly isNew = computed(() => !this.id());
  protected readonly activeCategories = computed(() => this.categories().filter((c) => c.active));
  protected readonly activeUnits = computed(() => this.units().filter((u) => u.active));
  protected readonly activeTaxes = computed(() => this.taxes().filter((t) => t.active));
  protected readonly extraLists = computed(() => this.priceLists().filter((l) => l.active && !l.defaultList));

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

  addConversion(): void {
    this.form.controls.conversions.push(conversionGroup(this.fb));
  }

  addBarcode(): void {
    this.form.controls.barcodes.push(barcodeGroup(this.fb));
  }

  addListPrice(): void {
    const first = this.extraLists()[0];
    this.form.controls.listPrices.push(
      listPriceGroup(this.fb, first?.id ?? '', this.form.controls.baseUnitId.value, this.form.controls.salePrice.value));
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

  save(): void {
    const input = toInput(this.form);
    const current = this.product();
    this.saving.set(true);
    const request = current ? this.api.updateProduct(current.id, input) : this.api.createProduct(input);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Producto guardado', detail: saved.name });
        void this.router.navigate(['/app/productos']);
      },
      error: () => this.saving.set(false),
    });
  }
}
