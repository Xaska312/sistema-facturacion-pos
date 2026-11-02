import { FormBuilder } from '@angular/forms';
import { CumEntry } from '../../core/api/medicines.api';
import {
  applyCum,
  atcCategory,
  isAntibioticAtc,
  lotsForced,
  medicineForm,
  medicineProblem,
  medicineTags,
  sameCategoryName,
  suggestedName,
  toMedicineInput,
  unitSaleBlock,
} from './medicine-form';

const AMOX: CumEntry = {
  cum: '20012345-2', productName: 'AMOXICILINA® 500 MG', holder: 'GENFAR', sanitaryRegistration: 'INVIMA 2020M-0002',
  presentation: 'CAJA X 50', atc: 'J01CA04', atcDescription: 'AMOXICILINA', route: 'ORAL', dosageForm: 'CAPSULA',
  activeIngredients: 'AMOXICILINA 500 mg', ium: null,
};

describe('ficha del medicamento (Fase 13-1, decisión 279)', () => {
  const form = () => medicineForm(new FormBuilder());

  it('sin tipo no hay ficha; un medicamento necesita condición de venta', () => {
    const f = form();
    expect(toMedicineInput(f)).toBeNull();
    f.patchValue({ kind: 'MEDICINE' });
    expect(medicineProblem(f)).toContain('condición de venta');
    f.patchValue({ saleCondition: 'OTC' });
    expect(medicineProblem(f)).toBeNull();
  });

  it('elegir del catálogo llena la ficha; un J01 queda antibiótico y bajo fórmula', () => {
    const f = form();
    f.patchValue({ saleCondition: 'OTC', unitSale: true });
    applyCum(f, AMOX);
    const input = toMedicineInput(f)!;
    expect(input.cum).toBe('20012345-2');
    expect(input.antibiotic).toBeTrue();
    expect(input.saleCondition).toBe('PRESCRIPTION');
    expect(input.unitSale).toBeFalse();
    expect(isAntibioticAtc(' j01xx ')).toBeTrue();
    expect(suggestedName(AMOX)).toBe('AMOXICILINA 500 MG');
  });

  it('venta por unidad: nunca antibióticos ni control especial', () => {
    expect(unitSaleBlock('MEDICINE', 'PRESCRIPTION', true)).toContain('antibióticos');
    expect(unitSaleBlock('MEDICINE', 'CONTROLLED', false)).toContain('control especial');
    expect(unitSaleBlock('MEDICINE', 'OTC', false)).toBeNull();
    const f = form();
    f.patchValue({ kind: 'MEDICINE', saleCondition: 'CONTROLLED', unitSale: true });
    expect(toMedicineInput(f)!.unitSale).toBeFalse();
  });

  it('un cosmético no lleva condición de venta ni antibiótico; un CUM mal escrito se avisa', () => {
    const f = form();
    f.patchValue({ kind: 'COSMETIC', saleCondition: 'PRESCRIPTION', antibiotic: true, cum: '12-ab' });
    expect(medicineProblem(f)).toContain('CUM');
    f.patchValue({ cum: '' });
    const input = toMedicineInput(f)!;
    expect(input.saleCondition).toBeNull();
    expect(input.antibiotic).toBeFalse();
  });

  it('etiquetas para la lista', () => {
    expect(medicineTags(null)).toEqual([]);
    expect(medicineTags({ kind: 'MEDICINE', saleCondition: 'PRESCRIPTION', activeIngredients: null, antibiotic: true,
      coldChain: true, unitSale: false }).map((t) => t.label)).toEqual(['Fórmula', 'Antibiótico', 'Nevera']);
    expect(medicineTags({ kind: 'MEDICINE', saleCondition: 'CONTROLLED', activeIngredients: null, antibiotic: false,
      coldChain: false, unitSale: false }).map((t) => t.label)).toEqual(['Control especial']);
  });

  it('medicamento, fitoterapéutico y dispositivo llevan lotes siempre; los demás, si se marca (Fase 13-2)', () => {
    const f = form();
    f.patchValue({ kind: 'COSMETIC' });
    expect(lotsForced('COSMETIC')).toBeFalse();
    expect(toMedicineInput(f)!.tracksLots).toBeFalse();
    f.patchValue({ tracksLots: true });
    expect(toMedicineInput(f)!.tracksLots).toBeTrue();
    f.patchValue({ kind: 'MEDICAL_DEVICE', tracksLots: false });
    expect(lotsForced('MEDICAL_DEVICE')).toBeTrue();
    expect(toMedicineInput(f)!.tracksLots).toBeTrue();
  });

  it('sugiere la categoría por el ATC, con antibióticos y analgésicos aparte', () => {
    expect(atcCategory('J01CA04')).toBe('Antibióticos');
    expect(atcCategory('J05AB01')).toBe('Antiinfecciosos');
    expect(atcCategory('n02be01')).toBe('Analgésicos');
    expect(atcCategory('C09AA02')).toBe('Cardiovascular');
    expect(atcCategory('')).toBeNull();
    expect(atcCategory('X99')).toBeNull();
    expect(sameCategoryName('ANTIBIOTICOS ', 'Antibióticos')).toBeTrue();
    expect(sameCategoryName('Analgésicos', 'Antibióticos')).toBeFalse();
  });
});
