import { ticketPng, wrap } from './ticket-image';
import { receiptRows } from './receipt/receipt-rows';
import { Sale } from '../core/api/api.models';

const SALE = {
  documentNumber: 'POS-60',
  status: 'COMPLETED',
  createdAt: '2026-11-11T21:01:00Z',
  createdByName: 'Daniel Mejía',
  customerName: 'Consumidor Final',
  customerDocumentType: 'CC',
  customerDocumentNumber: '222222222222',
  customerVerificationDigit: null,
  notes: null,
  subtotal: 3361,
  discountTotal: 0,
  total: 4000,
  changeAmount: 6000,
  tip: null,
  together: null,
  voidReason: null,
  taxes: [{ taxId: 1, taxType: 'IVA', taxRate: 19, taxAmount: 639 }],
  payments: [{ lineNo: 1, methodName: 'Efectivo', tendered: 10000 }],
  items: [{ lineNo: 1, name: 'Agua Cielo Manzana 620 ml', quantity: 1, unitCode: 'UND', unitPrice: 4000, grossAmount: 4000,
    discountAmount: 0, discountPercent: 0, modifiers: [], note: null }],
  receipt: { businessName: 'XASKA', branchName: 'Sede principal', branchAddress: null, branchPhone: null,
    registerCode: 'CAJA-1', footer: 'Gracias por su compra', timezone: 'America/Bogota' },
} as unknown as Sale;

describe('Tiquete como imagen (decisiones 315 y 326)', () => {
  it('parte las líneas largas sin cortar palabras', () => {
    const fits = (s: string) => s.length <= 12;
    expect(wrap('Lápida tradicional grande de mármol', fits)).toEqual(['Lápida', 'tradicional', 'grande de', 'mármol']);
    expect(wrap('', fits)).toEqual(['']);
  });

  it('arma los renglones como el tiquete impreso', () => {
    const rows = receiptRows(SALE);
    const texts = rows.map((r) => (r.kind === 'text' ? r.text : r.kind === 'pair' ? `${r.left}|${r.right}` : '---'));
    expect(texts[0]).toBe('XASKA');
    expect(texts).toContain('Tiquete POS-60');
    expect(texts).toContain('Caja CAJA-1 · Daniel Mejía');
    expect(texts).toContain('Agua Cielo Manzana 620 ml');
    expect(texts.some((t) => t.startsWith('1 UND × ') && t.endsWith('4.000'))).toBeTrue();
    expect(texts.some((t) => t.startsWith('IVA 19 %|'))).toBeTrue();
    expect(rows.find((r) => r.kind === 'pair' && r.left === 'TOTAL')).toEqual(jasmine.objectContaining({ big: true, bold: true }));
    expect(texts.some((t) => t.startsWith('Cambio|'))).toBeTrue();
    expect(texts.at(-1)).toBe('Comprobante interno de venta');
  });

  it('usa el encabezado del dueño en lugar de la dirección de la sede (decisión 331)', () => {
    const sale = { ...SALE, receipt: { ...SALE.receipt, branchAddress: 'Calle 10', header: 'NIT: 1006122824-9\nCel: 3155145472' } } as Sale;
    const texts = receiptRows(sale).slice(0, 5).map((r) => (r.kind === 'text' ? r.text : ''));
    expect(texts).toEqual(['XASKA', 'Sede principal', 'NIT: 1006122824-9', 'Cel: 3155145472', 'Tiquete POS-60']);
  });

  it('marca la venta anulada', () => {
    const rows = receiptRows({ ...SALE, status: 'VOIDED', voidReason: 'Devolución' } as Sale);
    expect(rows.some((r) => r.kind === 'text' && r.text === '*** VENTA ANULADA ***')).toBeTrue();
  });

  it('dibuja un PNG', async () => {
    const blob = await ticketPng(receiptRows(SALE));
    expect(blob?.type).toBe('image/png');
    expect(blob!.size).toBeGreaterThan(500);
  });
});
