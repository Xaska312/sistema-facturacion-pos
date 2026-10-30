import { Sale } from '../../core/api/api.models';
import { saleMessage, saleWhatsAppLink } from './sale-text';

const sale = (overrides: Partial<Sale> = {}): Sale => ({
  id: 's1', documentNumber: 'POS-15', prefix: 'POS', number: 15, status: 'COMPLETED', createdAt: '2026-10-26T20:30:00Z',
  branchId: 'b', cashRegisterId: 'r', cashSessionId: 'c', customerId: 'cu', customerDocumentType: 'CC',
  customerDocumentNumber: '222222222222', customerVerificationDigit: null, customerName: 'Consumidor final',
  pricesIncludeTax: true, grossTotal: 33600, discountTotal: 0, subtotal: 33600, taxTotal: 0, total: 33600,
  paidTotal: 40000, changeAmount: 6400, notes: null, createdBy: 'u', createdByName: 'Ana', voidedAt: null,
  voidedBy: null, voidedByName: null, voidReason: null,
  items: [
    { lineNo: 1, productId: 'p1', sku: 'HC-COCO', name: 'Helado casero Coco', unitId: 'u1', unitCode: 'PAQ', quantity: 1,
      unitPrice: 28000, grossAmount: 28000, discountPercent: 0, discountAmount: 0, taxType: 'EXCLUDED', taxRate: 0,
      taxableBase: 28000, taxAmount: 0, total: 28000 },
    { lineNo: 2, productId: 'p2', sku: 'VASO-G', name: 'Vaso grande de helado', unitId: 'u2', unitCode: 'UND', quantity: 2,
      unitPrice: 2800, grossAmount: 5600, discountPercent: 0, discountAmount: 0, taxType: 'EXCLUDED', taxRate: 0,
      taxableBase: 5600, taxAmount: 0, total: 5600 },
  ],
  payments: [{ lineNo: 1, paymentMethodId: 'm', methodCode: 'CASH', methodName: 'Efectivo', amount: 40000, tendered: 40000,
    reference: null }],
  taxes: [],
  receipt: { businessName: 'Dinael Helados', branchName: null, branchAddress: null, branchPhone: null, registerCode: null,
    registerName: null, footer: 'Vuelva pronto', timezone: null },
  ...overrides,
} as Sale);

describe('sale-text (decisión 261)', () => {
  it('pone las adiciones y la nota junto al producto (Fase 12b-1)', () => {
    const base = sale();
    const granizado = { ...base.items[1], name: 'Granizado', note: 'sin azúcar',
      modifiers: [{ groupName: 'Tamaño', optionName: 'Grande', quantity: 1, unitPrice: 4000 },
        { groupName: 'Extras', optionName: 'Shot extra', quantity: 2, unitPrice: 3000 }] };
    const text = saleMessage(sale({ items: [granizado] }));
    expect(text).toContain('• Granizado (Grande, Shot extra x2, sin azúcar) (2 UND): $ 5.600');
  });

  it('arma el recibo de la venta para WhatsApp', () => {
    const text = saleMessage(sale());
    expect(text).toContain('Gracias por tu compra en Dinael Helados.');
    expect(text).toContain('Tiquete POS-15');
    expect(text).toContain('• Helado casero Coco (1 PAQ): $ 28.000');
    expect(text).toContain('• Vaso grande de helado (2 UND): $ 5.600');
    expect(text).toContain('Total: $ 33.600');
    expect(text).toContain('Pagó: Efectivo $ 40.000');
    expect(text).toContain('Cambio: $ 6.400');
    expect(text).toContain('Vuelva pronto');
    expect(text).not.toContain('ANULADA');
  });

  it('marca la venta anulada y no muestra cambio en cero', () => {
    const text = saleMessage(sale({ status: 'VOIDED', changeAmount: 0 }));
    expect(text).toContain('*** VENTA ANULADA ***');
    expect(text).not.toContain('Cambio');
    expect(saleWhatsAppLink(sale())).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
