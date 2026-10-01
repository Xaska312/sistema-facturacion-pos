import { DocumentType, Party, PartyInput, PersonType } from '../../core/api/api.models';
import { nitVerificationDigit } from '../../shared/nit';

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASSPORT', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'PEP', label: 'Permiso especial de permanencia' },
];

/** Estado editable del formulario de tercero. */
export interface PartyDraft {
  personType: PersonType;
  documentType: DocumentType;
  documentNumber: string;
  firstNames: string;
  lastNames: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  departmentCode: string;
  cityCode: string;
  priceListId: string;
  creditLimit: number;
}

export function emptyDraft(): PartyDraft {
  return {
    personType: 'NATURAL',
    documentType: 'CC',
    documentNumber: '',
    firstNames: '',
    lastNames: '',
    businessName: '',
    email: '',
    phone: '',
    address: '',
    departmentCode: '',
    cityCode: '',
    priceListId: '',
    creditLimit: 0,
  };
}

export function draftOf(p: Party): PartyDraft {
  return {
    personType: p.personType,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    firstNames: p.firstNames ?? '',
    lastNames: p.lastNames ?? '',
    businessName: p.businessName ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    address: p.address ?? '',
    departmentCode: p.cityCode ? p.cityCode.slice(0, 2) : '',
    cityCode: p.cityCode ?? '',
    priceListId: p.priceListId ?? '',
    creditLimit: p.creditLimit ?? 0,
  };
}

/** Dígito de verificación a mostrar (solo NIT). */
export function draftDv(d: PartyDraft): number | null {
  return d.documentType === 'NIT' ? nitVerificationDigit(d.documentNumber) : null;
}

/** Validación mínima en el cliente; el backend aplica todas las reglas. */
export function draftProblem(d: PartyDraft): string | null {
  if (!d.documentNumber.trim()) {
    return 'Escribe el número de documento.';
  }
  if (d.personType === 'LEGAL' && d.documentType !== 'NIT') {
    return 'Una persona jurídica se identifica con NIT.';
  }
  if (d.documentType === 'NIT' && draftDv(d) === null) {
    return 'El NIT solo lleva números (sin el dígito de verificación).';
  }
  if (d.personType === 'NATURAL' && (!d.firstNames.trim() || !d.lastNames.trim())) {
    return 'Escribe nombres y apellidos.';
  }
  if (d.personType === 'LEGAL' && !d.businessName.trim()) {
    return 'Escribe la razón social.';
  }
  return null;
}

export function toPartyInput(d: PartyDraft, withCustomerFields: boolean): PartyInput {
  const blank = (v: string): string | null => (v.trim() ? v.trim() : null);
  const input: PartyInput = {
    personType: d.personType,
    documentType: d.documentType,
    documentNumber: d.documentNumber.trim(),
    verificationDigit: draftDv(d),
    firstNames: d.personType === 'NATURAL' ? blank(d.firstNames) : null,
    lastNames: d.personType === 'NATURAL' ? blank(d.lastNames) : null,
    businessName: d.personType === 'LEGAL' ? blank(d.businessName) : null,
    email: blank(d.email),
    phone: blank(d.phone),
    address: blank(d.address),
    cityCode: blank(d.cityCode),
  };
  if (withCustomerFields) {
    input.priceListId = d.priceListId || null;
    input.creditLimit = Number(d.creditLimit) || 0;
  }
  return input;
}
