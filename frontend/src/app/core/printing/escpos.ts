import { Sale } from '../api/api.models';
import { documentShortLabel } from '../../shared/document-types';
import { formatCop, formatQuantity } from '../../shared/money';

/**
 * Tiquete en comandos ESC/POS para la impresora térmica (decisión 286): lo arma la app y XASKA Impresora lo manda tal
 * cual a la impresora. Sirve para casi todas las térmicas (Epson, Xprinter, 3nStar, genéricas "POS-80").
 */

/** Pulso al cajón conectado a la impresora: ESC p 0 25 250 (pin 2, 50 ms). */
export const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa] as const;

/** Columnas de la letra normal: 48 en 80 mm, 32 en 58 mm. */
export function columns(width: 58 | 80): number {
  return width === 58 ? 32 : 48;
}

// Página de códigos 850 (ESC t 2): tildes, eñe y signos del español.
const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8, '·': 0xfa, '×': 0x9e,
};

/** Sin tildes (para impresoras que no tienen la página 850): "Mañana" → "Manana". */
export function plainText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿¡]/g, '').replace(/×/g, 'x')
    .replace(/·/g, '-');
}

/** Texto a bytes: ASCII tal cual, el español en la página 850 (o sin tildes) y lo demás como "?". */
export function encodeText(text: string, plain: boolean): number[] {
  const source = plain ? plainText(text) : text;
  const out: number[] = [];
  for (const ch of source.replace(/\u00a0/g, ' ')) {
    const code = ch.codePointAt(0) ?? 63;
    if (code >= 0x20 && code < 0x7f) {
      out.push(code);
    } else if (!plain && CP850[ch] !== undefined) {
      out.push(CP850[ch]);
    } else {
      const bare = plainText(ch);
      out.push(...[...bare].map((c) => {
        const k = c.codePointAt(0) ?? 63;
        return k >= 0x20 && k < 0x7f ? k : 63;
      }));
    }
  }
  return out;
}

/** Parte un texto en renglones de {@code width} columnas (por palabras; una palabra larga se corta). */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

/** Izquierda y derecha en un renglón ("Subtotal ........ $ 10.000"); si no caben, la izquierda va arriba. */
export function row(left: string, right: string, width: number): string[] {
  if (left.length + 1 + right.length <= width) {
    return [left + ' '.repeat(width - left.length - right.length) + right];
  }
  const lines = wrap(left, width);
  return [...lines, ' '.repeat(Math.max(0, width - right.length)) + right];
}

/** Constructor de un trabajo ESC/POS. */
export class EscPos {
  private readonly bytes: number[] = [];

  constructor(private readonly plain = false) {
    // ESC @ (reiniciar) y ESC t 2 (página 850).
    this.bytes.push(0x1b, 0x40, 0x1b, 0x74, 0x02);
  }

  align(where: 'left' | 'center'): this {
    this.bytes.push(0x1b, 0x61, where === 'center' ? 1 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(0x1b, 0x45, on ? 1 : 0);
    return this;
  }

  /** Letra doble de alto (y de ancho con {@code wide}). */
  big(on: boolean, wide = false): this {
    this.bytes.push(0x1d, 0x21, on ? (wide ? 0x11 : 0x01) : 0x00);
    return this;
  }

  line(text = ''): this {
    this.bytes.push(...encodeText(text, this.plain), 0x0a);
    return this;
  }

  lines(texts: readonly string[]): this {
    texts.forEach((t) => this.line(t));
    return this;
  }

  rule(width: number): this {
    return this.line('-'.repeat(width));
  }

  drawer(): this {
    this.bytes.push(...DRAWER_KICK);
    return this;
  }

  /** Avanza el papel y corta (corte parcial; las que no cortan solo avanzan). */
  cut(): this {
    this.bytes.push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface ReceiptOptions {
  width: 58 | 80;
  /** Sin tildes (impresoras sin la página 850). */
  plain?: boolean;
  /** Abre el cajón antes de imprimir (venta con efectivo y "Abrir el cajón al cobrar en efectivo"). */
  openDrawer?: boolean;
  /** Fecha ya formateada (la del tiquete en pantalla). */
  date: string;
}

/** Fecha y hora de la venta como en el tiquete de la pantalla (zona horaria del negocio). */
export function saleDate(s: Sale): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: s.receipt.timezone ?? undefined })
      .format(new Date(s.createdAt));
  } catch {
    return new Date(s.createdAt).toLocaleString('es-CO');
  }
}

/** El mismo tiquete de la pantalla (shared/receipt), sin el logo. */
export function receiptBytes(s: Sale, o: ReceiptOptions): Uint8Array {
  const w = columns(o.width);
  const cop = formatCop;
  const q = formatQuantity;
  const p = new EscPos(o.plain ?? false);
  if (o.openDrawer) {
    p.drawer();
  }
  p.align('center').bold(true).big(true).lines(wrap(s.receipt.businessName ?? '', w)).big(false).bold(false);
  for (const extra of [s.receipt.branchName, s.receipt.branchAddress, s.receipt.branchPhone ? 'Tel. ' + s.receipt.branchPhone : null]) {
    if (extra) {
      p.lines(wrap(extra, w));
    }
  }
  p.line().bold(true).line('Tiquete ' + s.documentNumber).bold(false).align('left');
  p.line(o.date);
  p.lines(wrap(`Caja ${s.receipt.registerCode ?? ''} · ${s.createdByName ?? ''}`, w));
  p.lines(wrap('Cliente: ' + s.customerName, w));
  const doc = s.customerVerificationDigit === null ? s.customerDocumentNumber
    : `${s.customerDocumentNumber}-${s.customerVerificationDigit}`;
  p.line(`${documentShortLabel(s.customerDocumentType)} ${doc}`);
  if (s.status === 'VOIDED') {
    p.align('center').bold(true).line('*** VENTA ANULADA ***').bold(false).lines(wrap(s.voidReason ?? '', w)).align('left');
  }
  p.rule(w);
  for (const item of s.items) {
    p.lines(wrap(item.name, w));
    for (const m of item.modifiers ?? []) {
      p.lines(wrap(`  + ${m.optionName}${m.quantity > 1 ? ' x' + m.quantity : ''}`, w));
    }
    if (item.note) {
      p.lines(wrap('  * ' + item.note, w));
    }
    p.lines(row(`  ${q(item.quantity)} ${item.unitCode} x ${cop(item.unitPrice)}`, cop(item.grossAmount), w));
    if (item.discountAmount > 0) {
      p.lines(row(`  Desc. ${q(item.discountPercent)} %`, '-' + cop(item.discountAmount), w));
    }
  }
  p.rule(w);
  if (s.discountTotal > 0) {
    p.lines(row('Descuentos', '-' + cop(s.discountTotal), w));
  }
  p.lines(row('Subtotal (base)', cop(s.subtotal), w));
  for (const t of s.taxes) {
    if (t.taxAmount > 0) {
      p.lines(row(`${t.taxType} ${q(t.taxRate)} %`, cop(t.taxAmount), w));
    }
  }
  // TOTAL en doble alto (el ancho de columnas no cambia).
  p.bold(true).big(true).lines(row('TOTAL', cop(s.total), w)).big(false).bold(false);
  if (s.tip) {
    const tip = s.tip;
    p.lines(row(`Propina voluntaria (${tip.methodName})${tip.voided ? ' ANULADA' : ''}`, cop(tip.amount), w));
    p.bold(true).lines(row('Total con propina', cop(s.total + (tip.voided ? 0 : tip.amount)), w)).bold(false);
  }
  p.rule(w);
  for (const pay of s.payments) {
    p.lines(row(pay.methodName, cop(pay.tendered), w));
  }
  if (s.changeAmount > 0) {
    p.bold(true).lines(row('Cambio', cop(s.changeAmount), w)).bold(false);
  }
  p.rule(w).align('center');
  if (s.receipt.footer) {
    p.lines(wrap(s.receipt.footer, w));
  }
  p.line('Comprobante interno de venta');
  return p.cut().build();
}

/** Hoja de prueba: para saber si la impresora imprime bien las tildes y si corta. */
export function testPageBytes(width: 58 | 80, plain: boolean, printerName: string): Uint8Array {
  const w = columns(width);
  return new EscPos(plain).align('center').bold(true).big(true).line('XASKA').big(false).line('Prueba de impresión')
    .bold(false).line().align('left').lines(wrap('Impresora: ' + printerName, w)).line(`Papel: ${width} mm (${w} letras)`)
    .rule(w).line('Tildes: á é í ó ú ñ Ñ ¿? ¡!').lines(row('Total', '$ 18.000', w))
    .line('Si las tildes salen raras, activa').line('"Imprimir sin tildes" en Ajustes.').rule(w).cut().build();
}
