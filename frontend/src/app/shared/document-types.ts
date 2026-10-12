import { DocumentType, PersonType } from '../core/api/api.models';

export interface DocumentTypeOption {
  value: DocumentType;
  label: string;
  /** Abreviatura para el tiquete, las listas y el POS. */
  short: string;
}

/** Tipos de documento en el orden del formulario (los más usados primero). Igual que DocumentType del backend. */
export const DOCUMENT_TYPES: readonly DocumentTypeOption[] = [
  { value: 'CC', label: 'Cédula de ciudadanía', short: 'CC' },
  { value: 'NIT', label: 'NIT', short: 'NIT' },
  { value: 'CE', label: 'Cédula de extranjería', short: 'CE' },
  { value: 'PPT', label: 'Permiso por protección temporal', short: 'PPT' },
  { value: 'PASSPORT', label: 'Pasaporte', short: 'PA' },
  { value: 'TI', label: 'Tarjeta de identidad', short: 'TI' },
  { value: 'RC', label: 'Registro civil', short: 'RC' },
  { value: 'NUIP', label: 'NUIP', short: 'NUIP' },
  { value: 'TE', label: 'Tarjeta de extranjería', short: 'TE' },
  { value: 'PEP', label: 'Permiso especial de permanencia', short: 'PEP' },
  { value: 'FOREIGN_ID', label: 'Documento de identificación extranjero', short: 'DIE' },
  { value: 'FOREIGN_NIT', label: 'NIT de otro país', short: 'NIT ext.' },
];

const SHORT = new Map<string, string>(DOCUMENT_TYPES.map((t) => [t.value, t.short]));

/** "PASSPORT" → "PA". Un código desconocido se muestra tal cual. */
export function documentShortLabel(type: string): string {
  return SHORT.get(type) ?? type;
}

/** Documentos con los que se identifica una persona jurídica (NIT o NIT de otro país). */
export function isLegalPersonDocument(type: DocumentType): boolean {
  return type === 'NIT' || type === 'FOREIGN_NIT';
}

/** Opciones del formulario según el tipo de persona (mismas reglas que el backend). */
export function documentTypesFor(personType: PersonType): readonly DocumentTypeOption[] {
  return personType === 'LEGAL'
    ? DOCUMENT_TYPES.filter((t) => isLegalPersonDocument(t.value))
    : DOCUMENT_TYPES.filter((t) => t.value !== 'FOREIGN_NIT');
}
