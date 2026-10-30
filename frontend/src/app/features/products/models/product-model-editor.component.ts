import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, forkJoin, tap } from 'rxjs';
import { Category, ProductModel, ProductVariant, SizeScale, Tax } from '../../../core/api/api.models';
import { CatalogApi } from '../../../core/api/catalog.api';
import { permissionFlag } from '../../../core/auth/permission-flag';
import { ConfirmService } from '../../../shared/confirm';
import { FormDialogComponent } from '../../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../../shared/forms/pesos-input.directive';
import { formatCop } from '../../../shared/money';
import { PageHeaderComponent } from '../../../shared/page-header.component';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { HasUnsavedChanges, warnIfUnsaved } from '../../../shared/unsaved-changes';
import { modelGrid, newVariantCount, parseColors, variantExample } from './model-grid';
import { SizePickerComponent } from './size-picker.component';

const MAX_COLORS = 20;
const MAX_VARIANTS = 400;
const BARCODE = /^[A-Za-z0-9.-]{1,48}$/;

/**
 * Modelo con tallas y colores (fase 8d). Al crearlo se eligen la escala, las tallas y los colores y se crea una
 * variante por cada combinación, con su código interno. Después se editan los datos (para todas las tallas), se
 * agregan tallas o colores y se cambia el código de barras de cada variante.
 */
@Component({
  selector: 'app-product-model-editor',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, ButtonModule, InputTextModule, PesosInputDirective,
    PageHeaderComponent, StatusBadgeComponent, FormDialogComponent, SizePickerComponent],
  template: `
    <app-page-header [title]="isNew() ? 'Nuevo modelo con tallas' : (model()?.name ?? 'Modelo')"
                     [description]="isNew() ? 'Un precio para todas las tallas y colores; cada combinación queda como un producto con su propio código.' : null">
      @if (model()?.active === false) {
        <app-status-badge status="inactive" />
      }
      <a pButton routerLink="/app/productos/modelos" label="Volver" icon="pi pi-arrow-left" severity="secondary"
         [text]="true"></a>
      @if (model(); as m) {
        @if (canEdit()) {
          <p-button [label]="m.active ? 'Desactivar' : 'Activar'" [icon]="m.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="m.active ? 'danger' : 'success'" [outlined]="true" (onClick)="toggleModel(m)" />
        }
      }
    </app-page-header>

    <form [formGroup]="form" (ngSubmit)="save()" (keydown.enter)="ignoreEnter($event)" class="flex flex-col gap-4 max-w-5xl">
      <fieldset [disabled]="!canEdit()" class="flex flex-col gap-4">
        <section class="card p-4 grid gap-3 md:grid-cols-2">
          @if (isNew()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Prefijo del SKU</span>
              <input pInputText formControlName="skuPrefix" class="uppercase" maxlength="20" autocomplete="off" />
              <small class="text-xs text-muted">Corto, p. ej. RUN. Cada talla queda como RUN-38-NEGRO. No se cambia después.</small>
            </label>
          } @else {
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium">Prefijo del SKU</span>
              <span class="font-mono py-2">{{ model()?.skuPrefix }}</span>
            </div>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Nombre</span>
            <input pInputText formControlName="name" maxlength="140" />
            <small class="text-xs text-muted">Sin la talla ni el color: se agregan solos (p. ej. «Tenis Runner T38 Negro»).</small>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Categoría</span>
            <select formControlName="categoryId" class="border rounded px-2 py-2">
              <option value="">Sin categoría</option>
              @for (c of activeCategories(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
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
            <span class="text-sm font-medium">Precio de venta (al público)</span>
            <input pInputText appPesos="2" formControlName="salePrice" />
            @if (Number(form.controls.salePrice.value) >= 1) {
              <small class="text-xs text-muted">{{ formatCop(form.controls.salePrice.value) }} en todas las tallas y colores.</small>
            } @else if (form.controls.salePrice.touched || !isNew()) {
              <small class="text-xs text-danger">Escribe el precio al que vendes cada par o prenda.</small>
            } @else {
              <small class="text-xs text-muted">El mismo para todas las tallas y colores.</small>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Costo (lo que te cuesta a ti)</span>
            <input pInputText appPesos="2" formControlName="cost" />
            @if (isNew()) {
              <small class="text-xs text-muted">Lo que pagas al proveedor por unidad. Opcional: también lo puedes poner al cargar el inventario.</small>
            } @else {
              <small class="text-xs text-muted">Las tallas que ya tienen movimientos de inventario conservan su costo promedio.</small>
            }
            @if (costAbovePrice()) {
              <small class="text-xs text-warning">El costo es mayor que el precio de venta: revisa que no estén al revés.</small>
            }
          </label>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-sm font-medium">Descripción</span>
            <textarea formControlName="description" rows="2" maxlength="500" class="border rounded px-2 py-2"></textarea>
          </label>
        </section>

        @if (isNew()) {
          <section class="card p-4 flex flex-col gap-4">
            <h2 class="font-bold tracking-tight">Tallas y colores</h2>
            <label class="flex flex-col gap-1 max-w-sm">
              <span class="text-sm font-medium">Escala de tallas</span>
              <select formControlName="sizeScaleId" class="border rounded px-2 py-2" (change)="newSizes.set([])">
                @for (s of activeScales(); track s.id) {
                  <option [value]="s.id">{{ s.name }}</option>
                }
              </select>
              <small class="text-xs text-muted">
                ¿Falta una escala o una talla? <a routerLink="/app/productos/tallas" class="text-brand hover:underline">Escalas de tallas</a>
              </small>
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium">Tallas que vendes de este modelo</span>
              <app-size-picker [sizes]="scaleSizes()" [(selected)]="newSizes" />
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Colores (opcional)</span>
              <input pInputText [value]="colorsText()" (input)="setColors($event)"
                     placeholder="Negro, Blanco, Azul cielo" autocomplete="off" />
              <small class="text-xs text-muted">Sepáralos con comas. Si lo dejas vacío, solo se crean las tallas.</small>
            </label>
            @if (preview(); as p) {
              <p class="text-sm" [class.text-danger]="p.problem" role="status">
                @if (p.problem) {
                  {{ p.problem }}
                } @else {
                  Se crearán <strong>{{ p.count }}</strong> {{ p.count === 1 ? 'variante' : 'variantes' }}, cada una con su
                  código de barras. Ejemplo: <span class="font-mono">{{ p.sku }}</span> — {{ p.name }}.
                }
              </p>
            }
          </section>
        }
      </fieldset>

      @if (canEdit()) {
        <div class="flex justify-end gap-2">
          <a routerLink="/app/productos/modelos"><p-button label="Cancelar" [text]="true" severity="secondary" /></a>
          <p-button type="submit" [label]="isNew() ? 'Crear modelo' : 'Guardar cambios'" [loading]="saving()"
                    [disabled]="form.invalid || (isNew() && !!preview().problem) || (!isNew() && form.pristine)" />
        </div>
      }
    </form>

    @if (model(); as m) {
      <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
        <header class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="font-bold tracking-tight">Tallas y códigos de barras</h2>
            <p class="text-xs text-muted">
              {{ m.variants.length }} {{ m.variants.length === 1 ? 'variante' : 'variantes' }} · {{ m.sizeScaleName }}.
              @if (canEdit()) {
                Toca una casilla para poner el código del proveedor o desactivar esa talla.
              }
            </p>
          </div>
          @if (canEdit() && m.active) {
            <p-button label="Agregar tallas o colores" icon="pi pi-plus" size="small" [outlined]="true"
                      (onClick)="openAdd(m)" />
          }
        </header>
        <div class="overflow-x-auto">
          <table class="text-sm border-separate border-spacing-1">
            <caption class="sr-only">Variantes de {{ m.name }} por color y talla</caption>
            <thead>
              <tr>
                <th scope="col" class="text-left px-2 text-xs text-muted font-medium">{{ m.colors.length > 0 ? 'Color' : '' }}</th>
                @for (size of grid().sizes; track size) {
                  <th scope="col" class="px-2 text-center font-medium">{{ size }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (color of grid().colors; track color) {
                <tr>
                  <th scope="row" class="text-left px-2 font-medium whitespace-nowrap">{{ color ?? 'Talla' }}</th>
                  @for (size of grid().sizes; track size) {
                    <td class="align-top">
                      @if (grid().at(color, size); as v) {
                        <button type="button" [disabled]="!canEdit()" (click)="openVariant(m, v)"
                                class="w-full min-w-28 rounded-md border border-line px-2 py-1.5 text-left transition-colors hover:bg-surface-alt disabled:cursor-default"
                                [class.opacity-50]="!v.active"
                                [attr.aria-label]="'Talla ' + size + (color ? ' ' + color : '') + ', código ' + (v.barcode ?? 'sin código') + (v.active ? '' : ', inactiva')">
                          <span class="block font-mono text-xs">{{ v.barcode ?? 'Sin código' }}</span>
                          <span class="block text-xs text-muted truncate">{{ v.active ? v.sku : 'Inactiva' }}</span>
                        </button>
                      } @else {
                        <span class="block text-center text-muted" aria-label="No existe">—</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    <app-form-dialog [(visible)]="variantOpen" width="26rem" [header]="variantTitle()"
                     [dirty]="variantDirty()" [invalidMessage]="variantProblem()" [save]="saveVariant"
                     successMessage="Talla actualizada">
      @if (variant(); as v) {
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">SKU</span>
            <span class="font-mono text-sm">{{ v.sku }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <label for="variant-barcode" class="text-sm font-medium">Código de barras</label>
            <input pInputText id="variant-barcode" class="font-mono" [(ngModel)]="variantBarcode" maxlength="48"
                   autocomplete="off" />
            <small class="text-xs text-muted">Escanea aquí el código que trae el producto del proveedor; reemplaza al interno.</small>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" [(ngModel)]="variantActive" [disabled]="model()?.active === false" />
            Se vende (activa)
          </label>
        </div>
      }
    </app-form-dialog>

    <app-form-dialog [(visible)]="addOpen" width="36rem" header="Agregar tallas o colores"
                     [dirty]="addSizes().length > 0 || addColorsText().trim() !== ''" [invalidMessage]="addProblem()"
                     [save]="saveAdd" submitLabel="Agregar" successMessage="Variantes agregadas">
      @if (model(); as m) {
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">Tallas</span>
            <app-size-picker [sizes]="modelScaleSizes()" [locked]="m.sizes" [(selected)]="addSizes" />
          </div>
          @if (m.colors.length > 0) {
            <div class="flex flex-col gap-1">
              <label for="add-colors" class="text-sm font-medium">Colores nuevos</label>
              <input pInputText id="add-colors" [(ngModel)]="addColorsTextValue" placeholder="Rojo, Gris"
                     autocomplete="off" />
              <small class="text-xs text-muted">Ya tiene: {{ m.colors.join(', ') }}. Los colores nuevos se crean en todas las tallas.</small>
            </div>
          }
          <p class="text-sm" role="status">
            Se crearán <strong>{{ addCount() }}</strong> {{ addCount() === 1 ? 'variante nueva' : 'variantes nuevas' }}.
          </p>
        </div>
      }
    </app-form-dialog>
  `,
})
export class ProductModelEditorComponent implements OnInit, HasUnsavedChanges {
  /** Parámetro de ruta :id (ausente en /nuevo). */
  readonly id = input<string>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmService);
  protected readonly canEdit = permissionFlag('products:manage');
  protected readonly formatCop = formatCop;
  protected readonly Number = Number;

  protected readonly form = this.fb.nonNullable.group({
    skuPrefix: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/)]],
    name: ['', [Validators.required, Validators.maxLength(140)]],
    description: ['', Validators.maxLength(500)],
    categoryId: [''],
    taxId: ['', Validators.required],
    cost: [0, [Validators.required, Validators.min(0)]],
    // Precio en 0 = se vendería gratis: no se deja guardar (fase 8d, la confusión costo/precio).
    salePrice: [0, [Validators.required, Validators.min(1)]],
    sizeScaleId: ['', Validators.required],
  });

  protected readonly model = signal<ProductModel | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly scales = signal<SizeScale[]>([]);
  protected readonly saving = signal(false);
  protected readonly isNew = computed(() => !this.id());
  protected readonly activeCategories = computed(() => this.categories().filter((c) => c.active));
  protected readonly activeTaxes = computed(() => this.taxes().filter((t) => t.active));
  protected readonly activeScales = computed(() => this.scales().filter((s) => s.active));
  protected readonly grid = computed(() => {
    const model = this.model();
    return model ? modelGrid(model) : modelGrid(EMPTY_MODEL);
  });

  // ------------------------------------------------------------ creación
  private readonly scaleId = toSignal(this.form.controls.sizeScaleId.valueChanges, { initialValue: '' });
  private readonly prefixValue = toSignal(this.form.controls.skuPrefix.valueChanges, { initialValue: '' });
  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });
  private readonly prices = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly costAbovePrice = computed(() => {
    const { cost, salePrice } = this.prices();
    return Number(cost) > 0 && Number(salePrice) > 0 && Number(cost) > Number(salePrice);
  });
  protected readonly newSizes = signal<string[]>([]);
  protected readonly colorsText = signal('');
  protected readonly scaleSizes = computed(() => this.scales().find((s) => s.id === this.scaleId())?.sizes ?? []);
  protected readonly preview = computed(() => {
    const sizes = this.newSizes();
    const colors = parseColors(this.colorsText());
    const count = newVariantCount(null, sizes, colors);
    let problem: string | null = null;
    if (sizes.length === 0) {
      problem = 'Elige al menos una talla.';
    } else if (colors.length > MAX_COLORS) {
      problem = `Máximo ${MAX_COLORS} colores por modelo.`;
    } else if (count > MAX_VARIANTS) {
      problem = `Son ${count} combinaciones: máximo ${MAX_VARIANTS} por vez.`;
    }
    const example = sizes.length > 0
      ? variantExample(this.prefixValue() || 'PREFIJO', this.nameValue() || 'Modelo', sizes[0], colors[0] ?? null)
      : { sku: '', name: '' };
    return { count, problem, ...example };
  });

  // ------------------------------------------------------------ variante
  protected variantOpen = false;
  protected variantBarcode = '';
  protected variantActive = true;
  protected readonly variant = signal<ProductVariant | null>(null);
  protected readonly variantTitle = computed(() => {
    const v = this.variant();
    return v ? `Talla ${v.size}${v.color ? ' · ' + v.color : ''}` : 'Talla';
  });

  // ------------------------------------------------------------ agregar tallas o colores
  protected addOpen = false;
  protected readonly addSizes = signal<string[]>([]);
  protected readonly addColorsText = signal('');
  protected readonly modelScaleSizes = computed(() => {
    const model = this.model();
    return this.scales().find((s) => s.id === model?.sizeScaleId)?.sizes
      ?? (model?.sizes ?? []).map((label) => ({ label, equivalent: null }));
  });
  protected readonly addCount = computed(() => {
    const model = this.model();
    if (!model) {
      return 0;
    }
    return newVariantCount(model, [...model.sizes, ...this.addSizes()], this.addColors(model));
  });

  /** Ya se guardó: salir no debe preguntar. */
  private saved = false;

  ngOnInit(): void {
    forkJoin({
      categories: this.api.categories(),
      taxes: this.api.taxes(),
      scales: this.api.sizeScales(),
    }).subscribe((refs) => {
      this.categories.set(refs.categories);
      this.taxes.set(refs.taxes);
      this.scales.set(refs.scales);
      const id = this.id();
      if (id) {
        this.form.controls.skuPrefix.disable();
        this.form.controls.sizeScaleId.disable();
        this.api.productModel(id).subscribe((m) => this.setModel(m));
      } else {
        const iva = refs.taxes.find((t) => t.code === 'IVA19' && t.active);
        const scale = refs.scales.find((s) => s.active);
        this.form.patchValue({ taxId: iva?.id ?? '', sizeScaleId: scale?.id ?? '' });
      }
    });
  }

  hasUnsavedChanges(): boolean {
    if (!this.canEdit() || this.saved) {
      return false;
    }
    return this.form.dirty || (this.isNew() && (this.newSizes().length > 0 || this.colorsText().trim() !== ''));
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  /** Enter en un campo no guarda (el lector de códigos termina cada lectura con Enter). */
  protected ignoreEnter(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      event.preventDefault();
    }
  }

  protected setColors(event: Event): void {
    this.colorsText.set((event.target as HTMLInputElement).value);
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const v = this.form.getRawValue();
    const data = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      categoryId: v.categoryId || null,
      taxId: v.taxId,
      cost: Number(v.cost),
      salePrice: Number(v.salePrice),
    };
    const current = this.model();
    if (current) {
      this.saving.set(true);
      this.api.updateProductModel(current.id, data).subscribe({
        next: (m) => {
          this.saving.set(false);
          this.setModel(m);
          this.messages.add({ severity: 'success', summary: 'Modelo guardado', detail: 'Se actualizaron todas sus tallas.' });
        },
        error: () => this.saving.set(false),
      });
      return;
    }
    if (this.preview().problem) {
      return;
    }
    this.saving.set(true);
    this.api.createProductModel({
      ...data,
      skuPrefix: v.skuPrefix.trim().toUpperCase(),
      sizeScaleId: v.sizeScaleId,
      sizes: this.newSizes(),
      colors: parseColors(this.colorsText()),
    }).subscribe({
      next: (m) => {
        this.saving.set(false);
        this.saved = true;
        this.messages.add({
          severity: 'success', summary: 'Modelo creado',
          detail: `${m.variants.length} ${m.variants.length === 1 ? 'variante' : 'variantes'} con su código de barras.`,
        });
        void this.router.navigate(['/app/productos/modelos', m.id], { replaceUrl: true });
      },
      error: () => this.saving.set(false),
    });
  }

  toggleModel(model: ProductModel): void {
    this.confirm.toggleActive({
      active: model.active,
      noun: 'modelo',
      name: model.name,
      consequence: 'Se desactivan también todas sus tallas: no se podrán vender hasta que lo actives de nuevo.',
      accept: () => this.api.setProductModelActive(model.id, !model.active).subscribe((m) => this.setModel(m, false)),
    });
  }

  // ------------------------------------------------------------ variante

  openVariant(model: ProductModel, variant: ProductVariant): void {
    if (!this.canEdit()) {
      return;
    }
    this.model.set(model);
    this.variant.set(variant);
    this.variantBarcode = variant.barcode ?? '';
    this.variantActive = variant.active;
    this.variantOpen = true;
  }

  protected variantDirty(): boolean {
    const v = this.variant();
    return !!v && (this.variantBarcode.trim() !== (v.barcode ?? '') || this.variantActive !== v.active);
  }

  protected variantProblem(): string | null {
    const v = this.variant();
    if (!v) {
      return null;
    }
    const barcode = this.variantBarcode.trim();
    if (barcode !== (v.barcode ?? '') && !BARCODE.test(barcode)) {
      return barcode ? 'El código usa letras, números, «.» o «-» (máximo 48).' : 'Escribe el código de barras.';
    }
    if (!this.variantDirty()) {
      return 'No hay cambios.';
    }
    return null;
  }

  protected readonly saveVariant = (): Observable<unknown> => {
    const model = this.model();
    const v = this.variant();
    if (!model || !v) {
      throw new Error('Sin variante');
    }
    const barcode = this.variantBarcode.trim();
    return this.api.updateVariant(model.id, v.productId, barcode !== (v.barcode ?? '') ? barcode : null,
      this.variantActive !== v.active ? this.variantActive : null)
      .pipe(tap((m) => this.setModel(m, false)));
  };

  // ------------------------------------------------------------ agregar tallas o colores

  /** El campo de colores del diálogo usa ngModel; la señal alimenta el conteo. */
  protected get addColorsTextValue(): string {
    return this.addColorsText();
  }

  protected set addColorsTextValue(value: string) {
    this.addColorsText.set(value);
  }

  openAdd(model: ProductModel): void {
    this.model.set(model);
    this.addSizes.set([]);
    this.addColorsText.set('');
    this.addOpen = true;
  }

  protected addProblem(): string | null {
    const model = this.model();
    if (!model) {
      return null;
    }
    const colors = this.addColors(model);
    if (colors.length > MAX_COLORS) {
      return `Máximo ${MAX_COLORS} colores por modelo.`;
    }
    if (this.addCount() === 0) {
      return model.colors.length > 0 ? 'Elige tallas nuevas o escribe colores nuevos.' : 'Elige tallas nuevas.';
    }
    if ((model.sizes.length + this.addSizes().length) * Math.max(1, colors.length) > MAX_VARIANTS) {
      return `Son demasiadas combinaciones: máximo ${MAX_VARIANTS} por vez.`;
    }
    return null;
  }

  protected readonly saveAdd = (): Observable<unknown> => {
    const model = this.model();
    if (!model) {
      throw new Error('Sin modelo');
    }
    return this.api.addVariants(model.id, [...model.sizes, ...this.addSizes()], this.addColors(model))
      .pipe(tap((m) => this.setModel(m, false)));
  };

  /** Colores del modelo más los nuevos escritos (sin repetir). */
  private addColors(model: ProductModel): string[] {
    if (model.colors.length === 0) {
      return [];
    }
    return parseColors([...model.colors, this.addColorsText()].join(','));
  }

  /** Muestra el modelo; con {@code resetForm} también recarga el formulario (no al cambiar solo una variante). */
  private setModel(model: ProductModel, resetForm = true): void {
    this.model.set(model);
    if (resetForm || this.form.pristine) {
      this.form.reset({
        skuPrefix: model.skuPrefix,
        name: model.name,
        description: model.description ?? '',
        categoryId: model.categoryId ?? '',
        taxId: model.taxId,
        cost: model.cost,
        salePrice: model.salePrice,
        sizeScaleId: model.sizeScaleId,
      });
    }
  }
}

const EMPTY_MODEL: ProductModel = {
  id: '', skuPrefix: '', name: '', description: null, categoryId: null, categoryName: null, taxId: '', taxCode: null,
  cost: 0, salePrice: 0, sizeScaleId: '', sizeScaleName: '', active: true, sizes: [], colors: [], variants: [],
};
