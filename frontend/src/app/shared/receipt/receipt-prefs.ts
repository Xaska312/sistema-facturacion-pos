/** Ancho del papel de la impresora térmica de este equipo (preferencia local, no es un dato del negocio). */
export type ReceiptWidth = 58 | 80;

const KEY = 'pos.receiptWidth';

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
 * styles.css oculta todo lo demás al imprimir (así no se imprime el espacio de la página).
 */
export function printReceipt(): void {
  setTimeout(() => {
    const source = document.querySelector('.receipt-print-root');
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
