import { nitVerificationDigit } from './nit';

describe('nitVerificationDigit', () => {
  it('calcula el DV de NIT conocidos', () => {
    expect(nitVerificationDigit('800197268')).toBe(4);
    expect(nitVerificationDigit('890.903.938')).toBe(8);
    expect(nitVerificationDigit('899999068')).toBe(1);
  });

  it('devuelve null con texto inválido', () => {
    expect(nitVerificationDigit('abc')).toBeNull();
    expect(nitVerificationDigit('')).toBeNull();
  });
});
