import { CumRowInput } from '../../core/api/platform.api';

/**
 * Lee el CSV "CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES" de datos.gov.co (Fase 13-1, decisión 279) en el navegador: el
 * archivo pesa ~75 MB y trae una fila por principio activo y por fabricante o importador de cada presentación. Se
 * queda con las presentaciones activas que no son muestra médica, una fila por CUM (expediente-consecutivo) con sus
 * principios activos juntos ("ACETAMINOFEN 500 mg + CAFEINA 65 mg"). El resultado se envía en tandas al servidor.
 */
export interface CumParseResult {
  rows: CumRowInput[];
  /** Filas de datos leídas (sin el encabezado). */
  lines: number;
  inactive: number;
  samples: number;
  invalid: number;
}

const REQUIRED = ['expedientecum', 'consecutivocum', 'producto', 'estadocum', 'principioactivo'] as const;

/** Campos de un CSV con comillas (RFC 4180): comas y saltos de línea dentro de comillas, "" para una comilla. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let row: string[] = [];
  while (pos < n) {
    let field: string;
    if (text[pos] === '"') {
      // Campo entre comillas: se copia por pedazos hasta la comilla que cierra.
      let value = '';
      let from = pos + 1;
      for (;;) {
        const quote = text.indexOf('"', from);
        if (quote < 0) {
          value += text.slice(from);
          pos = n;
          break;
        }
        value += text.slice(from, quote);
        if (text[quote + 1] === '"') {
          value += '"';
          from = quote + 2;
        } else {
          pos = quote + 1;
          break;
        }
      }
      field = value;
    } else {
      let end = pos;
      while (end < n && text[end] !== ',' && text[end] !== '\n' && text[end] !== '\r') {
        end++;
      }
      field = text.slice(pos, end);
      pos = end;
    }
    row.push(field);
    const c = text[pos];
    if (c === ',') {
      pos++;
      if (pos === n) {
        row.push('');
      }
    } else {
      if (c === '\r' && text[pos + 1] === '\n') {
        pos++;
      }
      pos++;
      if (row.length > 1 || row[0] !== '') {
        rows.push(row);
      }
      row = [];
    }
  }
  if (row.length > 0) {
    rows.push(row);
  }
  return rows;
}

function clean(value: string | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}

/** "ACETAMINOFEN 500 mg", con la referencia si no es la misma forma ("TRAMADOL 50 mg / 1 ML"). */
function ingredient(get: (name: string) => string | null): string | null {
  const name = get('principioactivo');
  if (!name) {
    return null;
  }
  const amount = [get('cantidad'), get('unidadmedida')].filter(Boolean).join(' ');
  const reference = get('unidadreferencia');
  const form = get('formafarmaceutica');
  const per = reference && reference !== form && /\d/.test(reference) ? ` / ${reference}` : '';
  return [name, amount].filter(Boolean).join(' ') + per;
}

export function parseCumCsv(text: string): CumParseResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    throw new Error('El archivo está vacío.');
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    throw new Error(`No parece el CSV del CUM de datos.gov.co: faltan las columnas ${missing.join(', ')}.`);
  }
  const index = new Map(header.map((h, i) => [h, i] as const));
  const byCum = new Map<string, CumRowInput & { parts: string[] }>();
  let inactive = 0;
  let samples = 0;
  let invalid = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (name: string): string | null => {
      const i = index.get(name);
      return i === undefined ? null : clean(cells[i]);
    };
    if ((get('estadocum') ?? '').toLowerCase() !== 'activo') {
      inactive++;
      continue;
    }
    if (['si', 'sí'].includes((get('muestramedica') ?? '').toLowerCase())) {
      samples++;
      continue;
    }
    const expediente = get('expedientecum');
    const consecutivo = get('consecutivocum');
    const name = get('producto');
    if (!expediente || !consecutivo || !/^\d{1,15}$/.test(expediente) || !/^\d{1,6}$/.test(consecutivo) || !name) {
      invalid++;
      continue;
    }
    const cum = `${expediente}-${Number(consecutivo)}`;
    let entry = byCum.get(cum);
    if (!entry) {
      entry = {
        cum, productName: name, holder: get('titular'), sanitaryRegistration: get('registrosanitario'),
        presentation: get('descripcioncomercial'), atc: get('atc'), atcDescription: get('descripcionatc'),
        route: get('viaadministracion'), dosageForm: get('formafarmaceutica'), activeIngredients: '',
        ium: get('ium'), parts: [],
      };
      byCum.set(cum, entry);
    }
    const part = ingredient(get);
    if (part && !entry.parts.includes(part)) {
      entry.parts.push(part);
    }
  }
  const rows: CumRowInput[] = [];
  for (const { parts, ...entry } of byCum.values()) {
    const activeIngredients = parts.join(' + ').slice(0, 1000);
    if (!activeIngredients) {
      invalid++;
      continue;
    }
    rows.push({ ...entry, activeIngredients });
  }
  return { rows, lines: table.length - 1, inactive, samples, invalid };
}

/** Tandas de {@code size} filas para enviar al servidor. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
