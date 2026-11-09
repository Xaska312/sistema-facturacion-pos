import { AskaRecap } from '../../core/api/ai.api';

/** Lo hecho con Aska en el periodo, en su voz y solo lo que pasó (decisión 309; las mismas frases del correo). */
export function recapLines(r: AskaRecap): { emoji: string; text: string }[] {
  const out: { emoji: string; text: string }[] = [];
  if (r.invoices > 0) {
    out.push({ emoji: '🧾', text: `Leí ${plural(r.invoices, 'factura', 'facturas')} de tus proveedores`
      + (r.invoiceLines > 0 ? `: ${plural(r.invoiceLines, 'línea', 'líneas')} que no digitaste.` : '.') });
  }
  if (r.products > 0) {
    out.push({ emoji: '📦', text: `Pasé ${plural(r.products, 'producto', 'productos')} de tus listas y cuadernos a XASKA.` });
  }
  if (r.questions > 0) {
    out.push({ emoji: '💬', text: `Respondí ${plural(r.questions, 'pregunta', 'preguntas')} sobre tu negocio.` });
  }
  if (r.reviews > 0) {
    out.push({ emoji: '🛒', text: `Revisé ${plural(r.reviews, 'pedido', 'pedidos')} antes de que compraras.` });
  }
  if (r.digests > 0) {
    out.push({ emoji: '☀️', text: `Te conté cómo te fue ${plural(r.digests, 'día', 'días')} en el Resumen del día.` });
  }
  return out;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
