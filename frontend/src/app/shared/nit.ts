const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación del NIT (algoritmo DIAN). Devuelve null si el número no es válido. */
export function nitVerificationDigit(nit: string): number | null {
  const digits = nit.replace(/[\s.-]/g, '');
  if (!/^\d{1,15}$/.test(digits)) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? remainder : 11 - remainder;
}
