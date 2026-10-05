/** Términos que confunden a quien empieza, explicados en una o dos frases (se muestran con app-term). */
export interface GlossaryEntry {
  title: string;
  text: string;
}

export const GLOSSARY = {
  'base-efectivo': {
    title: 'Base de efectivo',
    text: 'El dinero que hay en el cajón al abrir la caja, antes de la primera venta (para dar cambio).',
  },
  'cierre-ciego': {
    title: 'Cierre ciego',
    text: 'Al cerrar, cuentas el efectivo sin ver cuánto debería haber. Así el arqueo es honesto; '
      + 'la diferencia la ve quien supervisa la caja.',
  },
  arqueo: {
    title: 'Arqueo',
    text: 'La comparación entre el efectivo contado y el que debería haber (base + ventas en efectivo + ingresos − '
      + 'egresos y retiros). Si coinciden, la caja está cuadrada; si no, hay faltante o sobrante.',
  },
  kardex: {
    title: 'Kardex',
    text: 'La historia de un producto: cada entrada y salida de inventario, con la existencia y el costo después de '
      + 'cada movimiento.',
  },
  'stock-minimo': {
    title: 'Existencia mínima',
    text: 'La cantidad a partir de la cual quieres reponer. Cuando la existencia llega a ese valor, aparece una alerta '
      + 'en el inicio y en Existencias.',
  },
  'medios-pago': {
    title: 'Medios de pago',
    text: 'Cómo te pagan: efectivo, tarjeta o transferencia (Nequi, Daviplata, bancos). Solo el efectivo entra al '
      + 'cajón y da cambio; para tarjeta y transferencia se anota la referencia.',
  },
  'costo-promedio': {
    title: 'Costo promedio',
    text: 'El costo de cada unidad, promediando lo que pagaste en cada entrada. Con él se calculan la utilidad y el '
      + 'valor del inventario.',
  },
  'saldo-inicial': {
    title: 'Saldo inicial',
    text: 'Las existencias que ya tienes al empezar a usar el sistema, con su costo. Se registra una sola vez por '
      + 'producto y sucursal.',
  },
  'lista-precios': {
    title: 'Lista de precios',
    text: 'Precios especiales para algunos clientes (por ejemplo, mayoristas). Al elegir el cliente en la venta, el '
      + 'POS usa su lista.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTerm = keyof typeof GLOSSARY;
