import { DispensationInput, DispensingInfo, Profession } from '../../core/api/pharmacy.api';

/** Lo que se pide al cobrar algo bajo fórmula (Fase 13-4, decisión 282). */
export interface DispensationDraft {
  seen: boolean;
  prescriberName: string;
  prescriberLicense: string;
  prescriptionDate: string;
  patientDocument: string;
  patientName: string;
}

export function emptyDispensation(): DispensationDraft {
  return { seen: false, prescriberName: '', prescriberLicense: '', prescriptionDate: '', patientDocument: '',
    patientName: '' };
}

/** Necesita los datos de la fórmula: hay un antibiótico o algo de control especial. */
export function needsDetails(info: readonly DispensingInfo[]): boolean {
  return info.some((i) => i.strict);
}

/** Lo que falta para cobrar, o null. {@code today} en AAAA-MM-DD. */
export function dispensationProblem(info: readonly DispensingInfo[], d: DispensationDraft, canDispense: boolean,
                                    today: string): string | null {
  if (info.length === 0) {
    return null;
  }
  if (!canDispense) {
    return 'Hay medicamentos bajo fórmula y tu usuario no puede dispensar: llama al director técnico o al auxiliar.';
  }
  if (!d.seen) {
    return 'Confirma que viste la fórmula médica.';
  }
  if (!needsDetails(info)) {
    return null;
  }
  if (!d.prescriberName.trim()) {
    return 'Escribe quién firmó la fórmula.';
  }
  if (!d.prescriptionDate || d.prescriptionDate > today) {
    return 'Escribe la fecha de la fórmula (no puede ser futura).';
  }
  if (!/^[A-Za-z0-9-]{3,20}$/.test(d.patientDocument.trim().replace(/\./g, ''))) {
    return 'Escribe el documento del paciente.';
  }
  return d.patientName.trim() ? null : 'Escribe el nombre del paciente.';
}

export function toDispensationInput(info: readonly DispensingInfo[], d: DispensationDraft): DispensationInput | null {
  if (info.length === 0) {
    return null;
  }
  const details = needsDetails(info);
  const text = (v: string) => (details && v.trim() ? v.trim() : null);
  return {
    prescriptionSeen: d.seen,
    prescriberName: text(d.prescriberName),
    prescriberLicense: text(d.prescriberLicense),
    prescriptionDate: details && d.prescriptionDate ? d.prescriptionDate : null,
    patientDocument: details ? d.patientDocument.trim().replace(/\./g, '') || null : null,
    patientName: text(d.patientName),
  };
}

export const PROFESSION_OPTIONS: readonly { code: Profession; label: string }[] = [
  { code: 'PHARMACIST', label: 'Químico farmacéutico' },
  { code: 'PHARMACY_REGENT', label: 'Tecnólogo en regencia de farmacia' },
  { code: 'PHARMACY_TECHNICIAN', label: 'Técnico o auxiliar en servicios farmacéuticos' },
];

export function professionLabel(code: string | null | undefined): string {
  return PROFESSION_OPTIONS.find((p) => p.code === code)?.label ?? '';
}
