/**
 * Costo con o sin IVA (decisión 348). El costo que guarda la app siempre es SIN IVA (así lo restan los reportes de la
 * venta sin IVA), pero los proveedores casi siempre dan el precio con el IVA incluido: en los campos de costo la
 * persona escribe el número como lo tiene y la app le quita el IVA del producto.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Costo sin IVA a partir del número escrito (con IVA si {@code withTax} y el producto lo lleva). */
export function netCost(typed: number, rate: number, withTax = true): number {
  if (!Number.isFinite(typed)) {
    return typed;
  }
  return withTax && rate > 0 ? round2(typed / (1 + rate / 100)) : round2(typed);
}

/**
 * El número que se muestra en el campo para un costo guardado sin IVA. Con IVA se redondea al peso cuando la diferencia
 * es de centavos (5.650 se guarda 4.747,90 y vuelve a verse 5.650).
 */
export function shownCost(net: number, rate: number, withTax = true): number {
  if (!Number.isFinite(net) || !(withTax && rate > 0)) {
    return net;
  }
  const gross = net * (1 + rate / 100);
  const pesos = Math.round(gross);
  return Math.abs(gross - pesos) < 0.06 ? pesos : round2(gross);
}

export interface Profit {
  /** Lo que se gana por unidad, sin IVA. */
  gain: number;
  /** Ganancia sobre el costo (%), la cuenta del tendero: (precio − costo) ÷ costo. */
  overCost: number;
  /** Margen sobre el precio (%): (precio − costo) ÷ precio. */
  margin: number;
}

/**
 * Ganancia de un producto con su precio de venta y su costo sin IVA. El precio se lleva a sin IVA si el negocio vende
 * con IVA incluido; así se compara lo mismo con lo mismo. Null si falta el precio o el costo.
 */
export function profitOf(price: number, net: number, rate: number, pricesIncludeTax: boolean): Profit | null {
  if (!(price > 0) || !(net > 0)) {
    return null;
  }
  const netPrice = pricesIncludeTax && rate > 0 ? price / (1 + rate / 100) : price;
  const gain = netPrice - net;
  return {
    gain: Math.round(gain),
    overCost: Math.round((gain / net) * 1000) / 10,
    margin: Math.round((gain / netPrice) * 1000) / 10,
  };
}
