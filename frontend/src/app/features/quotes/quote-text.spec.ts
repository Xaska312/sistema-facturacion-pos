import { Quote } from '../../core/api/api.models';
import {
  QuoteDraft,
  addDays,
  itemDetail,
  partyName,
  partyPhone,
  quoteBadge,
  quoteDraftProblem,
  quoteDraftTotal,
  quoteMessage,
  quoteWhatsAppLink,
  validLabel,
} from './quote-text';

const draft = (overrides: Partial<QuoteDraft> = {}): QuoteDraft => ({
  key: 1, productId: 'p1', sku: 'GRA', productName: 'Granito', unitCode: 'M2', allowsDecimals: true, taxRate: 19,
  description: '', bySize: true, width: 2.4, length: 0.6, quantity: null, unitPrice: 300000, discountPercent: 10,
  ...overrides,
});

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 'q1', number: 'COT-7', status: 'OPEN', expired: false, customerId: null, customerName: null,
  customerDocument: null, customerPhone: null, prospectName: 'Marta Gómez', prospectPhone: '300 123 4567',
  validUntil: '2026-11-04', notes: null, terms: 'Anticipo del 50 %.', total: 538800, createdByName: 'Ana',
  createdAt: '2026-10-20T15:00:00Z', convertedType: null, convertedId: null, convertedNumber: null, convertedAt: null,
  rejectedAt: null, rejectReason: null,
  items: [
    { id: 'i1', lineNo: 1, productId: 'p1', sku: 'GRA', productName: 'Granito', unitCode: 'M2',
      description: 'Mesón cocina', width: 2.4, length: 0.6, quantity: 1.44, unitPrice: 300000, discountPercent: 10,
      total: 388800 },
    { id: 'i2', lineNo: 2, productId: 'p2', sku: 'INST', productName: 'Instalación', unitCode: 'UND',
      description: null, width: null, length: null, quantity: 1, unitPrice: 150000, discountPercent: 0, total: 150000 },
  ],
  ...overrides,
});

describe('quote-text (decisión 260)', () => {
  it('pinta el estado de la cotización', () => {
    expect(quoteBadge({ status: 'OPEN', expired: false }).label).toBe('Vigente');
    expect(quoteBadge({ status: 'OPEN', expired: true })).toEqual({ key: 'expired', label: 'Vencida' });
    expect(quoteBadge({ status: 'ACCEPTED', expired: false, convertedType: 'ORDER' }).label).toBe('En pedido');
    expect(quoteBadge({ status: 'ACCEPTED', expired: true, convertedType: 'SALE' }).label).toBe('Vendida');
    expect(quoteBadge({ status: 'REJECTED', expired: true }).label).toBe('Rechazada');
  });

  it('dice cuánto falta para que venza', () => {
    const now = new Date(2026, 9, 20, 22, 0);
    expect(validLabel('2026-10-20', now)).toBe('Vence hoy');
    expect(validLabel('2026-10-21', now)).toBe('Vence mañana');
    expect(validLabel('2026-10-30', now)).toBe('Vence en 10 días');
    expect(validLabel('2026-10-19', now)).toBe('Venció hace 1 día');
    expect(validLabel('2026-10-15', now)).toBe('Venció hace 5 días');
    // Manda la fecha del negocio
    expect(validLabel('2026-10-21', now, true)).toBe('Vencida');
    expect(validLabel('2026-10-19', now, false)).toBe('Vence hoy');
  });

  it('suma días sin correrse por la zona horaria', () => {
    expect(addDays('2026-10-20', 15)).toBe('2026-11-04');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('calcula la línea con descuento', () => {
    // 1,44 m² × 300.000 = 432.000 − 10 % = 388.800 (precio con IVA incluido)
    expect(quoteDraftTotal(draft(), true)).toBe(388800);
    expect(quoteDraftTotal(draft({ discountPercent: null }), true)).toBe(432000);
    expect(quoteDraftTotal(draft({ bySize: false, quantity: 2, discountPercent: 0, taxRate: 0 }), false)).toBe(600000);
  });

  it('valida el descuento además de lo del pedido', () => {
    expect(quoteDraftProblem([draft()])).toBeNull();
    expect(quoteDraftProblem([draft({ discountPercent: 100 })])).toContain('descuento');
    expect(quoteDraftProblem([draft({ discountPercent: -1 })])).toContain('descuento');
    expect(quoteDraftProblem([draft({ width: null })])).toContain('ancho');
    expect(quoteDraftProblem([])).toContain('al menos');
  });

  it('muestra medidas y descuento', () => {
    expect(itemDetail(quote().items[0])).toBe('2,4 × 0,6 m = 1,44 M2 · −10 %');
    expect(itemDetail(quote().items[1])).toBe('1 UND');
  });

  it('usa el cliente registrado o el prospecto', () => {
    expect(partyName(quote())).toBe('Marta Gómez');
    expect(partyPhone(quote())).toBe('300 123 4567');
    const registered = quote({ customerId: 'c1', customerName: 'Lucía Pardo', customerPhone: '3109876543' });
    expect(partyName(registered)).toBe('Lucía Pardo');
    expect(partyPhone(registered)).toBe('3109876543');
  });

  it('arma el mensaje de WhatsApp con total, vigencia y condiciones', () => {
    const text = quoteMessage(quote(), 'Mármoles Pardo');
    expect(text).toContain('Hola Marta, te saludamos de Mármoles Pardo. Esta es la cotización COT-7:');
    expect(text).toContain('• Granito · Mesón cocina (2,4 × 0,6 m = 1,44 M2 · −10 %): $ 388.800');
    expect(text).toContain('Total: $ 538.800');
    expect(text).toContain('Válida hasta: ');
    expect(text).toContain('Anticipo del 50 %.');
    expect(quoteWhatsAppLink(quote(), 'X')).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
    expect(quoteWhatsAppLink(quote({ prospectPhone: null }), 'X')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
