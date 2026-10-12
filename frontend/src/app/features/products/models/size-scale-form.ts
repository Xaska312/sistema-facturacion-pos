import { SizeEntry } from '../../../core/api/api.models';

export const MAX_SIZES = 40;
const LABEL = /^(?=.*[A-Za-z0-9])[A-Za-z0-9.,/ -]{1,10}$/;

/**
 * Entrada rápida de tallas: "34-38" → 34, 35, 36, 37, 38 (rango de enteros, hasta {@link MAX_SIZES}); "S, m, L" → S, M,
 * L. En mayúsculas y sin vacías. Una talla con guion como "2-4" (años) se agrega con "Agregar una talla".
 */
export function parseSizeList(text: string): string[] {
  const result: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const part = raw.trim().toUpperCase();
    const range = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to >= from && to - from < MAX_SIZES) {
        for (let n = from; n <= to; n++) {
          result.push(String(n));
        }
        continue;
      }
    }
    if (part) {
      result.push(part);
    }
  }
  return result;
}

/** Motivo por el que una escala aún no se puede guardar (null = se puede). */
export function scaleProblem(name: string, sizes: readonly SizeEntry[]): string | null {
  if (!name.trim()) {
    return 'Escribe el nombre de la escala.';
  }
  if (sizes.length === 0) {
    return 'Agrega al menos una talla.';
  }
  if (sizes.length > MAX_SIZES) {
    return `Una escala tiene como máximo ${MAX_SIZES} tallas.`;
  }
  const seen = new Set<string>();
  for (const size of sizes) {
    const label = size.label.trim().toUpperCase();
    if (!LABEL.test(label)) {
      return `Talla inválida: «${label}». Usa hasta 10 letras, números, espacios, «.», «,», «/» o «-».`;
    }
    if (seen.has(label)) {
      return `La talla ${label} está repetida.`;
    }
    if ((size.equivalent ?? '').trim().length > 40) {
      return `La equivalencia de la talla ${label} es muy larga (máximo 40).`;
    }
    seen.add(label);
  }
  return null;
}
