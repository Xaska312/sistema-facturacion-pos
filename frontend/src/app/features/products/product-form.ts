import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Product, ProductInput } from '../../core/api/api.models';

export type ConversionGroup = FormGroup<{
  unitId: FormControl<string>;
  factor: FormControl<number>;
  salePrice: FormControl<number | null>;
}>;

export type BarcodeGroup = FormGroup<{
  barcode: FormControl<string>;
  /** '' = unidad base. */
  unitId: FormControl<string>;
  internal: FormControl<boolean>;
}>;

export type ListPriceGroup = FormGroup<{
  priceListId: FormControl<string>;
  unitId: FormControl<string>;
  price: FormControl<number>;
}>;

export function productForm(fb: FormBuilder) {
  const nn = fb.nonNullable;
  return nn.group({
    sku: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._\-/]{1,40}$/)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(500)],
    categoryId: [''],
    baseUnitId: ['', Validators.required],
    taxId: ['', Validators.required],
    cost: [0, [Validators.required, Validators.min(0)]],
    salePrice: [0, [Validators.required, Validators.min(0)]],
    trackInventory: [true],
    conversions: nn.array<ConversionGroup>([]),
    barcodes: nn.array<BarcodeGroup>([]),
    listPrices: nn.array<ListPriceGroup>([]),
  });
}

export type ProductForm = ReturnType<typeof productForm>;

export function conversionGroup(fb: FormBuilder, unitId = '', factor = 1, salePrice: number | null = null): ConversionGroup {
  return fb.nonNullable.group({
    unitId: [unitId, Validators.required],
    factor: [factor, [Validators.required, Validators.min(0.0001)]],
    salePrice: new FormControl<number | null>(salePrice, Validators.min(0)),
  });
}

export function barcodeGroup(fb: FormBuilder, barcode = '', unitId = '', internal = false): BarcodeGroup {
  return fb.nonNullable.group({
    barcode: [barcode, [Validators.required, Validators.pattern(/^[A-Za-z0-9.-]{1,48}$/)]],
    unitId: [unitId],
    internal: [internal],
  });
}

export function listPriceGroup(fb: FormBuilder, priceListId = '', unitId = '', price = 0): ListPriceGroup {
  return fb.nonNullable.group({
    priceListId: [priceListId, Validators.required],
    unitId: [unitId, Validators.required],
    price: [price, [Validators.required, Validators.min(0)]],
  });
}

/** Carga un producto existente en el formulario. */
export function fillForm(fb: FormBuilder, form: ProductForm, p: Product): void {
  form.reset({
    sku: p.sku,
    name: p.name,
    description: p.description ?? '',
    categoryId: p.categoryId ?? '',
    baseUnitId: p.baseUnitId,
    taxId: p.taxId,
    cost: p.cost,
    salePrice: p.salePrice,
    trackInventory: p.trackInventory,
  });
  form.controls.conversions.clear();
  p.conversions.forEach((c) => form.controls.conversions.push(conversionGroup(fb, c.unitId, c.factor, c.salePrice)));
  form.controls.barcodes.clear();
  p.barcodes.forEach((b) => form.controls.barcodes.push(barcodeGroup(fb, b.barcode, b.unitId ?? '', b.internal)));
  form.controls.listPrices.clear();
  p.listPrices.forEach((l) => form.controls.listPrices.push(listPriceGroup(fb, l.priceListId, l.unitId, l.price)));
}

/** Convierte el formulario en el cuerpo que espera la API. */
export function toInput(form: ProductForm): ProductInput {
  const v = form.getRawValue();
  return {
    sku: v.sku.trim(),
    name: v.name.trim(),
    description: v.description.trim() || null,
    categoryId: v.categoryId || null,
    baseUnitId: v.baseUnitId,
    taxId: v.taxId,
    cost: Number(v.cost),
    salePrice: Number(v.salePrice),
    trackInventory: v.trackInventory,
    conversions: v.conversions.map((c) => ({
      unitId: c.unitId,
      factor: Number(c.factor),
      salePrice: c.salePrice === null || String(c.salePrice) === '' ? null : Number(c.salePrice),
    })),
    barcodes: v.barcodes.map((b) => ({ barcode: b.barcode.trim(), unitId: b.unitId || null, internal: b.internal })),
    listPrices: v.listPrices.map((l) => ({ priceListId: l.priceListId, unitId: l.unitId, price: Number(l.price) })),
  };
}
