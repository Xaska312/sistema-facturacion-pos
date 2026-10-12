import { parseSizeList, scaleProblem } from './size-scale-form';

describe('size-scale-form (fase 8d)', () => {
  it('lee rangos de números y listas separadas por comas', () => {
    expect(parseSizeList('34-37')).toEqual(['34', '35', '36', '37']);
    expect(parseSizeList(' s, m ,,L ')).toEqual(['S', 'M', 'L']);
    expect(parseSizeList('5, 5.5, 6')).toEqual(['5', '5.5', '6']);
    expect(parseSizeList('40-34')).toEqual(['40-34']);
  });

  it('valida nombre, tallas vacías, repetidas e inválidas', () => {
    const sizes = (...labels: string[]) => labels.map((label) => ({ label, equivalent: null }));
    expect(scaleProblem('', sizes('S'))).toContain('nombre');
    expect(scaleProblem('Ropa', [])).toContain('al menos');
    expect(scaleProblem('Ropa', sizes('S', 's'))).toContain('repetida');
    expect(scaleProblem('Ropa', sizes('---'))).toContain('inválida');
    expect(scaleProblem('Ropa', sizes('XS', '2-4', '7.5'))).toBeNull();
  });
});
