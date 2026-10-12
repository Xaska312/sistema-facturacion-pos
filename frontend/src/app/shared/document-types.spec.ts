import { documentShortLabel, documentTypesFor } from './document-types';

describe('document-types (fase 8a)', () => {
  it('abrevia el tipo de documento para el tiquete', () => {
    expect(documentShortLabel('PASSPORT')).toBe('PA');
    expect(documentShortLabel('FOREIGN_NIT')).toBe('NIT ext.');
    expect(documentShortLabel('CC')).toBe('CC');
    expect(documentShortLabel('OTRO')).toBe('OTRO');
  });

  it('ofrece a cada tipo de persona solo sus documentos', () => {
    expect(documentTypesFor('LEGAL').map((t) => t.value)).toEqual(['NIT', 'FOREIGN_NIT']);
    const natural = documentTypesFor('NATURAL').map((t) => t.value);
    expect(natural).toContain('PPT');
    expect(natural).not.toContain('FOREIGN_NIT');
  });
});
