/** Encabezados de la plantilla de importación (el backend acepta también variantes con tildes). */
export const IMPORT_HEADERS = [
  'sku',
  'nombre',
  'codigo_barras',
  'categoria',
  'unidad',
  'impuesto',
  'costo',
  'precio',
  'controla_inventario',
  'descripcion',
];

const EXAMPLE_ROWS = [
  ['GAS-400', 'Gaseosa cola 400 ml', '7701234567890', 'Bebidas', 'UND', 'IVA19', '1200', '2500', 'si', ''],
  ['ARR-1K', 'Arroz 1 kg', '', 'Granos', 'UND', 'IVA5', '3100', '4200', 'si', 'Bolsa de 1 kg'],
];

/** Plantilla CSV con BOM y punto y coma (abre bien en Excel en español). */
export function importTemplateCsv(): string {
  const lines = [IMPORT_HEADERS, ...EXAMPLE_ROWS].map((row) => row.map(csvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
