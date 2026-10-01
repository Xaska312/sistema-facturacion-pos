import { IMPORT_HEADERS, importTemplateCsv } from './import-template';

describe('importTemplateCsv', () => {
  it('empieza con BOM y los encabezados separados por punto y coma', () => {
    const csv = importTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(IMPORT_HEADERS.join(';'));
  });
});
