import { DispensingInfo } from '../../core/api/pharmacy.api';
import { dispensationProblem, emptyDispensation, needsDetails, professionLabel, toDispensationInput } from './dispensation';

const TODAY = '2026-11-02';
const rx: DispensingInfo = { productId: 'a', saleCondition: 'PRESCRIPTION', antibiotic: false, strict: false };
const abx: DispensingInfo = { productId: 'b', saleCondition: 'PRESCRIPTION', antibiotic: true, strict: true };

describe('dispensación en el POS (Fase 13-4)', () => {
  it('sin nada bajo fórmula no pide nada', () => {
    expect(dispensationProblem([], emptyDispensation(), false, TODAY)).toBeNull();
    expect(toDispensationInput([], emptyDispensation())).toBeNull();
  });

  it('bajo fórmula: permiso y confirmar que se vio', () => {
    const d = emptyDispensation();
    expect(dispensationProblem([rx], d, false, TODAY)).toContain('no puede dispensar');
    expect(dispensationProblem([rx], d, true, TODAY)).toContain('Confirma');
    d.seen = true;
    expect(dispensationProblem([rx], d, true, TODAY)).toBeNull();
    expect(toDispensationInput([rx], d)).toEqual({ prescriptionSeen: true, prescriberName: null, prescriberLicense: null,
      prescriptionDate: null, patientDocument: null, patientName: null });
  });

  it('antibiótico: médico, fecha no futura, documento y nombre del paciente', () => {
    expect(needsDetails([rx, abx])).toBeTrue();
    const d = { ...emptyDispensation(), seen: true };
    expect(dispensationProblem([abx], d, true, TODAY)).toContain('firmó');
    d.prescriberName = 'Dra. Gómez';
    d.prescriptionDate = '2026-11-03';
    expect(dispensationProblem([abx], d, true, TODAY)).toContain('futura');
    d.prescriptionDate = '2026-11-01';
    d.patientDocument = '1.020.304';
    expect(dispensationProblem([abx], d, true, TODAY)).toContain('nombre');
    d.patientName = 'Juan Ruiz';
    expect(dispensationProblem([abx], d, true, TODAY)).toBeNull();
    expect(toDispensationInput([abx], d)?.patientDocument).toBe('1020304');
    expect(professionLabel('PHARMACY_REGENT')).toContain('regencia');
  });
});
