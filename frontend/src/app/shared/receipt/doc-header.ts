import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Encabezado libre de los documentos (decisión 331): lo que el dueño escribe en Ajustes (NIT, dirección, celular…),
 * un dato por renglón y en su orden. Si está vacío, los documentos siguen con la dirección y el teléfono de la sede.
 */
export function headerLines(text: string | null | undefined): string[] {
  return (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

/**
 * Renglones bajo el nombre del negocio: el nombre de la sede (si se pide) y el encabezado del dueño o, sin él, la
 * dirección y el teléfono de la sede.
 */
export function businessLines(o: {
  header?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
}, withBranchName = true): string[] {
  const lines: string[] = [];
  if (withBranchName && o.branchName) {
    lines.push(o.branchName);
  }
  const custom = headerLines(o.header);
  if (custom.length > 0) {
    return [...lines, ...custom];
  }
  if (o.branchAddress) {
    lines.push(o.branchAddress);
  }
  if (o.branchPhone) {
    lines.push(`Tel. ${o.branchPhone}`);
  }
  return lines;
}

/** Valida que el texto no pase de {@code max} renglones con contenido. */
export function maxLines(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    headerLines(control.value as string | null).length > max ? { tooManyLines: { max } } : null;
}
