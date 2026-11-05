/** Ancho del papel de la impresora térmica de este equipo (preferencia local, no es un dato del negocio). */
export type ReceiptWidth = 58 | 80;

const KEY = 'pos.receiptWidth';

/**
 * Ancho que de verdad imprime la cabeza térmica: 72 mm en papel de 80 mm y 48 mm en papel de 58 mm (decisión 289).
 * Algunos drivers (p. ej. DigitalPOS "80(76) mm") no reducen la página y cortan lo que pase de su área imprimible.
 */
export function printableMm(width: ReceiptWidth): number {
  return width === 58 ? 48 : 72;
}

export function loadReceiptWidth(): ReceiptWidth {
  try {
    return globalThis.localStorage?.getItem(KEY) === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

export function saveReceiptWidth(width: ReceiptWidth): void {
  try {
    globalThis.localStorage?.setItem(KEY, String(width));
  } catch {
    // Sin almacenamiento (modo privado): se usa el valor por defecto la próxima vez.
  }
}

/**
 * Imprime el tiquete marcado como {@code .receipt-print-root}: lo copia como hijo directo de {@code <body>} y
 * styles.css oculta todo lo demás al imprimir (así no se imprime el espacio de la página). Con {@code selector} se
 * imprime otro documento de la pantalla, que también lleva la clase {@code receipt-print-root} (por ejemplo, la
 * hoja carta de un pedido).
 */
export function printReceipt(selector = '.receipt-print-root'): void {
  setTimeout(() => {
    const source = document.querySelector(selector);
    if (!source) {
      window.print();
      return;
    }
    const copy = source.cloneNode(true) as HTMLElement;
    copy.classList.add('receipt-print-copy');
    document.body.appendChild(copy);
    let removed = false;
    const cleanup = (): void => {
      if (!removed) {
        removed = true;
        copy.remove();
        window.removeEventListener('afterprint', cleanup);
      }
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Algunos navegadores no emiten afterprint: se limpia de todos modos.
    setTimeout(cleanup, 60_000);
  }, 50);
}
