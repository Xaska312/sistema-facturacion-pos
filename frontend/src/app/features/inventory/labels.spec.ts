import { DOCUMENT_ROUTE, documentNumber, documentTypeFromRoute } from './labels';

describe('inventory labels', () => {
  it('formatea el número de documento', () => {
    expect(documentNumber(12)).toBe('INV-000012');
    expect(documentNumber(null)).toBe('—');
  });

  it('convierte la ruta del editor en tipo de documento y viceversa', () => {
    expect(documentTypeFromRoute('conteo')).toBe('COUNT');
    expect(documentTypeFromRoute('traslado')).toBe('TRANSFER');
    expect(documentTypeFromRoute('otro')).toBeNull();
    expect(DOCUMENT_ROUTE.INITIAL).toBe('saldo-inicial');
  });
});
