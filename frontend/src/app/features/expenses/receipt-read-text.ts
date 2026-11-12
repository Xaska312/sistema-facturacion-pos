import { ExpenseReceiptRead } from '../../core/api/ai.api';

/** Lo que el formulario del gasto sabe al momento de leer el recibo. */
export interface ReceiptContext {
  /** Gasto en efectivo desde la caja: la fecha es hoy y no lleva proveedor ni referencia. */
  fromCash: boolean;
  /** Lleva sede, fecha y referencia (pagado con otro medio). */
  outside: boolean;
  /** Proveedores que se pueden elegir en el formulario. */
  supplierIds: string[];
  /** La nota que ya escribió la persona: no se reemplaza. */
  note: string;
  today: string;
}

/** Lo que se llena con el recibo; lo que no viene no se toca. */
export interface ReceiptFill {
  amount?: number;
  categoryId?: string;
  date?: string;
  supplierId?: string;
  reference?: string;
  note?: string;
  /** Avisos de Aska y del formulario, para revisar antes de guardar. */
  notices: string[];
}

/**
 * Pasa lo leído por Aska al formulario del gasto (decisión 325). Si el proveedor no está creado, su nombre queda al
 * comienzo de la nota; en la caja el gasto queda con la fecha de hoy aunque el recibo diga otra.
 */
export function receiptFill(read: ExpenseReceiptRead, ctx: ReceiptContext): ReceiptFill {
  const fill: ReceiptFill = { notices: [...read.warnings] };
  if (read.amount !== null && read.amount > 0) {
    fill.amount = read.amount;
  }
  if (read.categoryId) {
    fill.categoryId = read.categoryId;
  }
  if (read.date) {
    if (ctx.outside) {
      fill.date = read.date;
    } else if (ctx.fromCash && read.date !== ctx.today) {
      fill.notices.push(`El recibo es del ${read.date}: en la caja el gasto queda con la fecha de hoy.`);
    }
  }
  const linked = !ctx.fromCash && !!read.supplierId && ctx.supplierIds.includes(read.supplierId);
  if (linked) {
    fill.supplierId = read.supplierId!;
  }
  if (ctx.outside && read.reference) {
    fill.reference = read.reference;
  }
  if (!ctx.note.trim()) {
    const who = !linked && read.supplierName ? read.supplierName : null;
    const text = [who, read.note].filter((t): t is string => !!t && t.trim() !== '').join(' · ');
    if (text) {
      fill.note = text.slice(0, 255);
    }
  }
  return fill;
}

/** "Te quedan 98 recibos este mes." */
export function receiptsLeft(limit: number, used: number): string {
  const left = Math.max(0, limit - used);
  return left === 1 ? 'Te queda 1 recibo por leer este mes.' : `Te quedan ${left} recibos por leer este mes.`;
}
