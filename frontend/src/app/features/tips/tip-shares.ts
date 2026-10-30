/** Reparto en partes iguales y en pesos enteros; los pesos que sobran van a los primeros (igual que el servidor). */
export function shareTips(amount: number, people: number): number[] {
  if (people <= 0 || !(amount > 0)) {
    return Array.from({ length: Math.max(0, people) }, () => 0);
  }
  const pesos = Math.floor(amount);
  const each = Math.floor(pesos / people);
  const extra = pesos - each * people;
  return Array.from({ length: people }, (_, i) => (i < extra ? each + 1 : each));
}
