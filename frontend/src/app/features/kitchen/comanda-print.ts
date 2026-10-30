import { KitchenTicket, TicketItem } from '../../core/api/kitchen.api';
import { formatQuantity } from '../../shared/money';
import { ReceiptWidth } from '../../shared/receipt/receipt-prefs';

/**
 * Comanda impresa (Fase 12b-3, decisión 270) para impresora térmica de 58 u 80 mm: letra grande, en blanco y negro,
 * el término (o cualquier elección obligatoria de una sola opción) destacado en negativo para que la cocina no lo pase
 * por alto. Se arma como HTML con estilos en línea para poder imprimirla desde cualquier pantalla (también la impresora
 * automática, que no tiene plantilla propia).
 */

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function time(at: string): string {
  return new Date(at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function itemHtml(item: TicketItem): string {
  const qty = formatQuantity(item.quantity);
  if (item.voided) {
    return `<div style="margin:6px 0;font-size:16px"><b>ANULADO:</b> <s>${esc(qty)} ${esc(item.name)}</s></div>`;
  }
  const lines = [`<div style="font-size:20px;font-weight:800;line-height:1.2">${esc(qty)} &nbsp;${esc(item.name.toUpperCase())}</div>`];
  for (const m of item.modifiers) {
    const times = m.quantity > 1 ? ` ×${m.quantity}` : '';
    lines.push(m.highlight
      ? `<div style="display:inline-block;margin:3px 0 0 18px;padding:1px 6px;background:#000;color:#fff;font-size:18px;font-weight:800">${esc(m.groupName.toUpperCase())}: ${esc(m.name.toUpperCase())}${times}</div>`
      : `<div style="margin-left:18px;font-size:17px;font-weight:700">+ ${esc(m.name)}${times}</div>`);
  }
  if (item.note) {
    lines.push(`<div style="margin-left:18px;font-size:17px;font-weight:700">* ${esc(item.note)}</div>`);
  }
  return `<div style="margin:8px 0">${lines.join('')}</div>`;
}

/** HTML de una comanda (una página). */
export function comandaHtml(ticket: KitchenTicket, width: ReceiptWidth = 80): string {
  const copy = ticket.printCount > 1 ? `<div style="text-align:center;font-weight:800">*** COPIA ${ticket.printCount} ***</div>` : '';
  const who = [time(ticket.sentAt), ticket.sentByName].filter(Boolean).join(' · ');
  const guests = ticket.guests ? ` · ${ticket.guests} pers.` : '';
  const notes = ticket.notes
    ? `<div style="border-top:2px dashed #000;margin-top:6px;padding-top:4px;font-size:16px;font-weight:700">Nota: ${esc(ticket.notes)}</div>`
    : '';
  return `<div style="width:${width}mm;padding:2mm 3mm;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#000;`
    + `background:#fff;page-break-after:always;break-after:page">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:22px;font-weight:800">`
    + `<span>${esc(ticket.stationName.toUpperCase())}</span><span>#${ticket.number}</span></div>`
    + `<div style="font-size:24px;font-weight:800;line-height:1.15;margin-top:2px">${esc(ticket.tabLabel)}${guests}</div>`
    + `<div style="font-size:14px">${esc(who)}</div>`
    + copy
    + `<div style="border-top:2px dashed #000;margin-top:6px">${ticket.items.map(itemHtml).join('')}</div>`
    + notes
    + `</div>`;
}

/**
 * Imprime una o varias comandas en un solo trabajo (una página cada una): las agrega como hijo directo de
 * {@code <body>} con la clase {@code receipt-print-copy} (styles.css oculta lo demás al imprimir) y las quita al
 * terminar. Devuelve una promesa que se cumple cuando el navegador terminó de imprimir.
 */
export function printComandas(tickets: readonly KitchenTicket[], width: ReceiptWidth = 80): Promise<void> {
  if (tickets.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const holder = document.createElement('div');
    holder.className = 'receipt-print-copy';
    holder.innerHTML = tickets.map((t) => comandaHtml(t, width)).join('');
    document.body.appendChild(holder);
    let done = false;
    const cleanup = (): void => {
      if (!done) {
        done = true;
        holder.remove();
        window.removeEventListener('afterprint', cleanup);
        resolve();
      }
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      // Algunos navegadores no emiten afterprint: se limpia de todos modos.
      setTimeout(cleanup, 60_000);
    }, 50);
  });
}
