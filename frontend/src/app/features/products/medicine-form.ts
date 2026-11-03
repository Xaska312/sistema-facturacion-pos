import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { MedicineBadge, MedicineKind, SaleCondition } from '../../core/api/api.models';
import { CumEntry, MedicineSheet, MedicineSheetInput } from '../../core/api/medicines.api';

/**
 * Ficha del medicamento en el editor de productos (Fase 13-1, decisión 279). Mismas reglas que el servidor
 * (MedicineService): medicamento y fitoterapéutico llevan condición de venta; un ATC J01 es antibiótico; un antibiótico
 * nunca es de venta libre; por unidad solo si se marca, nunca antibióticos ni control especial.
 */
export const KIND_OPTIONS: readonly { code: MedicineKind; label: string }[] = [
  { code: 'MEDICINE', label: 'Medicamento' },
  { code: 'PHYTOTHERAPEUTIC', label: 'Fitoterapéutico (natural)' },
  { code: 'MEDICAL_DEVICE', label: 'Dispositivo médico' },
  { code: 'COSMETIC', label: 'Cosmético o aseo' },
  { code: 'SUPPLEMENT', label: 'Suplemento dietario' },
  { code: 'OTHER', label: 'Otro' },
];

export const CONDITION_OPTIONS: readonly { code: SaleCondition; label: string; hint: string }[] = [
  { code: 'PRESCRIPTION', label: 'Bajo fórmula médica', hint: 'Al venderlo el POS pide confirmar que viste la fórmula.' },
  { code: 'OTC', label: 'Venta libre', hint: 'Está en el listado de venta libre del INVIMA.' },
  { code: 'CONTROLLED', label: 'Control especial', hint: 'Con recetario oficial y libro de control (Resolución 1478 de 2006).' },
  { code: 'STATE_MONOPOLY', label: 'Monopolio del Estado', hint: 'Solo se compra al Fondo Rotatorio de Estupefacientes.' },
];

export type MedicineForm = FormGroup<{
  kind: FormControl<MedicineKind | ''>;
  sanitaryRegistration: FormControl<string>;
  cum: FormControl<string>;
  activeIngredients: FormControl<string>;
  dosageForm: FormControl<string>;
  route: FormControl<string>;
  atc: FormControl<string>;
  holder: FormControl<string>;
  saleCondition: FormControl<SaleCondition | ''>;
  antibiotic: FormControl<boolean>;
  coldChain: FormControl<boolean>;
  unitSale: FormControl<boolean>;
  tracksLots: FormControl<boolean>;
}>;

export function medicineForm(fb: FormBuilder): MedicineForm {
  const c = fb.nonNullable;
  return fb.group({
    kind: c.control<MedicineKind | ''>(''),
    sanitaryRegistration: c.control(''),
    cum: c.control(''),
    activeIngredients: c.control(''),
    dosageForm: c.control(''),
    route: c.control(''),
    atc: c.control(''),
    holder: c.control(''),
    saleCondition: c.control<SaleCondition | ''>(''),
    antibiotic: c.control(false),
    coldChain: c.control(false),
    unitSale: c.control(false),
    tracksLots: c.control(false),
  });
}

/** Llevan lote y vencimiento siempre (igual que MedicineService.LOT_KINDS); los demás tipos, si se marca. */
export const LOT_KINDS: ReadonlySet<MedicineKind> = new Set<MedicineKind>(['MEDICINE', 'PHYTOTHERAPEUTIC', 'MEDICAL_DEVICE']);

export function lotsForced(kind: MedicineKind | ''): boolean {
  return kind !== '' && LOT_KINDS.has(kind);
}

export function needsCondition(kind: MedicineKind | ''): boolean {
  return kind === 'MEDICINE' || kind === 'PHYTOTHERAPEUTIC';
}

/** Antibacterianos de uso sistémico (ATC J01). */
export function isAntibioticAtc(atc: string | null | undefined): boolean {
  return (atc ?? '').trim().toUpperCase().startsWith('J01');
}

/** Por qué no se puede vender por unidad, o null si se puede. */
export function unitSaleBlock(kind: MedicineKind | '', condition: SaleCondition | '', antibiotic: boolean): string | null {
  if (kind === 'MEDICINE' && antibiotic) {
    return 'Los antibióticos se entregan en su envase completo.';
  }
  if (condition === 'CONTROLLED' || condition === 'STATE_MONOPOLY') {
    return 'Los medicamentos de control especial no se venden por unidad.';
  }
  return null;
}

/** Lo que falta o no cuadra antes de guardar, o null. */
export function medicineProblem(form: MedicineForm): string | null {
  const v = form.getRawValue();
  if (!v.kind) {
    return null;
  }
  if (needsCondition(v.kind) && !v.saleCondition) {
    return 'Elige la condición de venta del medicamento.';
  }
  const antibiotic = v.kind === 'MEDICINE' && (v.antibiotic || isAntibioticAtc(v.atc));
  if (antibiotic && v.saleCondition === 'OTC') {
    return 'Un antibiótico no es de venta libre.';
  }
  if (v.cum.trim() && !/^\d{1,15}-\d{1,6}$/.test(v.cum.trim())) {
    return 'El CUM es el expediente y el consecutivo con guion (p. ej. 19943544-1).';
  }
  return null;
}

/** Lo que se envía; null si no se eligió el tipo (el producto queda sin ficha). */
export function toMedicineInput(form: MedicineForm): MedicineSheetInput | null {
  const v = form.getRawValue();
  if (!v.kind) {
    return null;
  }
  const withCondition = needsCondition(v.kind);
  const antibiotic = v.kind === 'MEDICINE' && (v.antibiotic || isAntibioticAtc(v.atc));
  const condition = withCondition ? (v.saleCondition || null) : null;
  const blank = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    kind: v.kind,
    sanitaryRegistration: blank(v.sanitaryRegistration),
    cum: blank(v.cum),
    activeIngredients: blank(v.activeIngredients),
    dosageForm: blank(v.dosageForm),
    route: blank(v.route),
    atc: blank(v.atc)?.toUpperCase() ?? null,
    holder: blank(v.holder),
    saleCondition: condition,
    antibiotic,
    coldChain: v.coldChain,
    unitSale: v.unitSale && unitSaleBlock(v.kind, condition ?? '', antibiotic) === null,
    tracksLots: lotsForced(v.kind) || v.tracksLots,
  };
}

export function fillMedicine(form: MedicineForm, sheet: MedicineSheet): void {
  form.reset({
    kind: sheet.kind,
    sanitaryRegistration: sheet.sanitaryRegistration ?? '',
    cum: sheet.cum ?? '',
    activeIngredients: sheet.activeIngredients ?? '',
    dosageForm: sheet.dosageForm ?? '',
    route: sheet.route ?? '',
    atc: sheet.atc ?? '',
    holder: sheet.holder ?? '',
    saleCondition: sheet.saleCondition ?? '',
    antibiotic: sheet.antibiotic,
    coldChain: sheet.coldChain,
    unitSale: sheet.unitSale,
    tracksLots: sheet.tracksLots,
  });
}

/**
 * Llena la ficha con una presentación del catálogo CUM. La condición de venta no viene en el catálogo: si no se ha
 * elegido, queda "bajo fórmula" (lo prudente); un antibiótico siempre queda bajo fórmula.
 */
export function applyCum(form: MedicineForm, entry: CumEntry): void {
  const antibiotic = isAntibioticAtc(entry.atc);
  const current = form.controls.saleCondition.value;
  form.patchValue({
    kind: 'MEDICINE',
    sanitaryRegistration: entry.sanitaryRegistration ?? '',
    cum: entry.cum,
    activeIngredients: entry.activeIngredients,
    dosageForm: entry.dosageForm ?? '',
    route: entry.route ?? '',
    atc: entry.atc ?? '',
    holder: entry.holder ?? '',
    saleCondition: !current || (antibiotic && current === 'OTC') ? 'PRESCRIPTION' : current,
    antibiotic,
    unitSale: antibiotic ? false : form.controls.unitSale.value,
  });
  form.markAsDirty();
}

/** Nombre sugerido para un producto nuevo: el del registro, sin marcas ® ni ™. */
export function suggestedName(entry: CumEntry): string {
  return entry.productName.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
}

/**
 * Categoría sugerida por el código ATC (grupo anatómico de la OMS, con nombres de mostrador). Es solo una sugerencia:
 * el negocio organiza sus categorías como quiera. Los antibióticos (J01) y los analgésicos (N02) van aparte porque así
 * se buscan en una droguería.
 */
export function atcCategory(atc: string | null | undefined): string | null {
  const code = (atc ?? '').trim().toUpperCase();
  if (code.startsWith('J01')) {
    return 'Antibióticos';
  }
  if (code.startsWith('N02')) {
    return 'Analgésicos';
  }
  return ATC_GROUPS[code.charAt(0)] ?? null;
}

const ATC_GROUPS: Readonly<Record<string, string>> = {
  A: 'Digestivo y metabolismo',
  B: 'Sangre',
  C: 'Cardiovascular',
  D: 'Dermatológicos',
  G: 'Genitourinario y hormonas sexuales',
  H: 'Hormonas',
  J: 'Antiinfecciosos',
  L: 'Oncológicos e inmunomoduladores',
  M: 'Músculo y articulaciones',
  N: 'Sistema nervioso',
  P: 'Antiparasitarios',
  R: 'Respiratorio',
  S: 'Ojos y oídos',
  V: 'Varios',
};

/** Compara nombres de categoría sin tildes ni mayúsculas. */
export function sameCategoryName(a: string, b: string): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return fold(a) === fold(b);
}

/** Etiquetas cortas para la lista de productos y el POS. */
export function medicineTags(badge: MedicineBadge | null | undefined): { label: string; tone: 'warn' | 'danger' | 'info' }[] {
  if (!badge) {
    return [];
  }
  const tags: { label: string; tone: 'warn' | 'danger' | 'info' }[] = [];
  if (badge.saleCondition === 'PRESCRIPTION') {
    tags.push({ label: 'Fórmula', tone: 'warn' });
  } else if (badge.saleCondition === 'CONTROLLED' || badge.saleCondition === 'STATE_MONOPOLY') {
    tags.push({ label: 'Control especial', tone: 'danger' });
  }
  if (badge.antibiotic) {
    tags.push({ label: 'Antibiótico', tone: 'warn' });
  }
  if (badge.coldChain) {
    tags.push({ label: 'Nevera', tone: 'info' });
  }
  if (badge.expiringSoon) {
    tags.push({ label: 'Vence pronto', tone: 'warn' });
  }
  return tags;
}
