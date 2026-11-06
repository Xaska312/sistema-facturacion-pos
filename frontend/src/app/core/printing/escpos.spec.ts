import { Sale } from '../api/api.models';
import { DRAWER_KICK, EscPos, columns, encodeText, monoFromGray, paperDots, plainText, receiptBytes, row, testPageBytes, wrap }
  from './escpos';
import { logoSize } from './printable-logo';
import { loadPrinterPrefs, toBase64 } from './print-agent.service';

function text(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f) || b === 0x0a ? String.fromCharCode(b) : '·').join('');
}

function indexOf(bytes: Uint8Array, seq: readonly number[]): number {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

const sale = {
  documentNumber: 'POS-15', status: 'COMPLETED', createdAt: '2026-11-04T18:00:00Z', createdByName: 'Ana',
  customerName: 'Consumidor final', customerDocumentType: 'CC', customerDocumentNumber: '222222222222',
  customerVerificationDigit: null, voidReason: null, discountTotal: 0, subtotal: 15126.05, total: 18000,
  changeAmount: 2000, tip: null,
  receipt: { businessName: 'Restaurante La Ñapa', branchName: 'Piso 2', branchAddress: null, branchPhone: null,
    registerCode: 'C2', footer: '¡Gracias!', timezone: 'America/Bogota' },
  items: [{ lineNo: 1, name: 'Hamburguesa doble con queso y tocineta crocante', modifiers: [{ optionName: 'Sin cebolla', quantity: 1 }],
    note: null, quantity: 1, unitCode: 'UND', unitPrice: 18000, grossAmount: 18000, discountAmount: 0, discountPercent: 0 }],
  taxes: [{ taxId: 't', taxType: 'INC', taxRate: 8, taxAmount: 1333 }],
  payments: [{ lineNo: 1, paymentMethodId: 'cash', methodCode: 'CASH', methodName: 'Efectivo', amount: 18000, tendered: 20000 }],
} as unknown as Sale;

describe('tiquete ESC/POS (decisión 286)', () => {
  it('tildes y eñe en la página 850, o sin tildes; lo demás como "?"', () => {
    expect(encodeText('Ñapa á', false)).toEqual([0xa5, 0x61, 0x70, 0x61, 0x20, 0xa0]);
    expect(encodeText('Ñapa á', true)).toEqual([...'Napa a'].map((c) => c.charCodeAt(0)));
    expect(plainText('¿Mañana?')).toBe('Manana?');
    expect(encodeText('€', false)).toEqual([63]);
  });

  it('renglones del ancho del papel, con el valor a la derecha', () => {
    expect(columns(80)).toBe(48);
    expect(columns(58)).toBe(32);
    expect(wrap('Hamburguesa doble con queso', 12)).toEqual(['Hamburguesa', 'doble con', 'queso']);
    expect(row('TOTAL', '$ 18.000', 20)).toEqual(['TOTAL       $ 18.000']);
    expect(row('Propina voluntaria (Efectivo)', '$ 2.000', 20)).toEqual(['Propina voluntaria', '(Efectivo)', '             $ 2.000']);
  });

  it('el tiquete trae lo mismo que el de pantalla, corta y abre el cajón solo si se pide', () => {
    const bytes = receiptBytes(sale, { width: 58, date: '4/11/26 1:00 p. m.' });
    const t = text(bytes);
    expect(t).toContain('Tiquete POS-15');
    expect(t).toContain('Caja C2');
    expect(t).toContain('+ Sin cebolla');
    expect(t).toContain('Cambio');
    expect(t).toContain('Hamburguesa doble con queso y\ntocineta crocante');
    expect(indexOf(bytes, [0x1d, 0x56, 0x42, 0x00])).toBeGreaterThan(0);
    expect(indexOf(bytes, DRAWER_KICK)).toBe(-1);
    const withDrawer = receiptBytes(sale, { width: 80, date: 'x', openDrawer: true });
    expect(indexOf(withDrawer, DRAWER_KICK)).toBe(5);
    expect(text(testPageBytes(80, false, 'POS-80'))).toContain('Impresora: POS-80');
    expect(new EscPos().build()).toEqual(Uint8Array.from([0x1b, 0x40, 0x1b, 0x74, 0x02]));
  });

  it('logo: gris a puntos centrado en el ancho del papel (decisión 292)', () => {
    // 4 × 2: negro, blanco, gris casi blanco, negro; segunda fila toda negra.
    const img = monoFromGray([0, 255, 240, 0, 0, 0, 0, 0], 4, 2, 16);
    expect(img.width).toBe(16);
    expect(img.height).toBe(2);
    // Centrado: 6 puntos libres a la izquierda (columnas 6 a 9).
    expect(Array.from(img.data)).toEqual([0b00000010, 0b01000000, 0b00000011, 0b11000000]);
    expect(paperDots(80)).toBe(576);
    expect(paperDots(58)).toBe(384);
  });

  it('logo: hasta la mitad del papel y 18 mm de alto, sin deformarlo', () => {
    expect(logoSize(1000, 500, 80)).toEqual({ width: 288, height: 144 });
    expect(logoSize(1000, 200, 80)).toEqual({ width: 288, height: 58 });
    expect(logoSize(100, 100, 58)).toEqual({ width: 144, height: 144 });
    expect(logoSize(2000, 100, 58)).toEqual({ width: 192, height: 10 });
    expect(logoSize(0, 100, 80)).toEqual({ width: 0, height: 0 });
  });

  it('el tiquete lleva el logo arriba en franjas GS v 0, antes del nombre', () => {
    const logo = monoFromGray(new Array(8 * 200).fill(0), 8, 200, paperDots(58));
    const bytes = receiptBytes(sale, { width: 58, date: 'x', logo });
    const first = indexOf(bytes, [0x1d, 0x76, 0x30, 0x00, 48, 0, 128, 0]);
    expect(first).toBeGreaterThan(0);
    expect(indexOf(bytes, [0x1d, 0x76, 0x30, 0x00, 48, 0, 72, 0])).toBe(first + 8 + 48 * 128);
    expect(text(bytes).indexOf('Tiquete POS-15')).toBeGreaterThan(0);
    expect(indexOf(receiptBytes(sale, { width: 58, date: 'x' }), [0x1d, 0x76, 0x30])).toBe(-1);
    expect(indexOf(testPageBytes(58, false, 'POS-58', logo), [0x1d, 0x76, 0x30, 0x00])).toBeGreaterThan(0);
  });

  it('base64 para el programa y preferencias por defecto', () => {
    expect(toBase64(Uint8Array.from([0x1b, 0x70, 0x00]))).toBe('G3AA');
    localStorage.removeItem('xaska.printer');
    expect(loadPrinterPrefs()).toEqual({ enabled: false, printer: null, autoPrint: false, drawerOnCash: true, plain: false });
  });
});
