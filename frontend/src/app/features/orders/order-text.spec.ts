import { Order } from '../../core/api/api.models';
import {
  DraftItem,
  daysUntil,
  deliveryAmounts,
  draftProblem,
  draftQuantity,
  draftTotal,
  dueLabel,
  isoDay,
  orderBadge,
  orderMessage,
  orderWhatsAppLink,
  parseDay,
  sizeText,
} from './order-text';

const draft = (overrides: Partial<DraftItem> = {}): DraftItem => ({
  key: 1, productId: 'p1', sku: 'GRA', productName: 'Granito', unitCode: 'M2', allowsDecimals: true, taxRate: 19,
  description: '', bySize: true, width: 1.2, length: 0.6, quantity: null, unitPrice: 300000, ...overrides,
});

describe('order-text (decisión 258)', () => {
  it('lee las fechas de entrega como fecha local, sin correrse un día', () => {
    const day = parseDay('2026-10-20')!;
    expect(day.getDate()).toBe(20);
    expect(day.getMonth()).toBe(9);
    expect(isoDay(day)).toBe('2026-10-20');
    expect(parseDay('20/10/2026')).toBeNull();
  });

  it('cuenta los días hasta la entrega', () => {
    const now = new Date(2026, 9, 19, 23, 30);
    expect(daysUntil('2026-10-19', now)).toBe(0);
    expect(dueLabel('2026-10-19', now)).toBe('Para hoy');
    expect(dueLabel('2026-10-20', now)).toBe('Para mañana');
    expect(dueLabel('2026-10-25', now)).toBe('En 6 días');
    expect(dueLabel('2026-10-18', now)).toBe('Atrasado 1 día');
    expect(dueLabel('2026-10-16', now)).toBe('Atrasado 3 días');
    // El servidor (fecha del negocio) dice que ya pasó aunque el equipo aún esté en el día anterior
    expect(dueLabel('2026-10-19', now, true)).toBe('Atrasado');
    expect(dueLabel('2026-10-18', now, false)).toBe('Para hoy');
  });

  it('pinta el estado del pedido', () => {
    expect(orderBadge({ status: 'OPEN', overdue: false }).label).toBe('Por entregar');
    expect(orderBadge({ status: 'OPEN', overdue: true }).key).toBe('expired');
    expect(orderBadge({ status: 'DELIVERED', overdue: false }).label).toBe('Entregado');
    expect(orderBadge({ status: 'CANCELLED', overdue: true }).label).toBe('Cancelado');
  });

  it('calcula la cantidad por medidas o la escrita', () => {
    expect(draftQuantity(draft())).toBe(0.72);
    expect(draftQuantity(draft({ width: 1.25, length: 2 }))).toBe(2.5);
    expect(draftQuantity(draft({ length: null }))).toBeNull();
    expect(draftQuantity(draft({ bySize: false, quantity: 3 }))).toBe(3);
    expect(draftQuantity(draft({ bySize: false, quantity: 0 }))).toBeNull();
  });

  it('estima el total como el servidor', () => {
    expect(draftTotal(draft(), true)).toBe(216000);
    expect(draftTotal(draft(), false)).toBe(257040);
    expect(draftTotal(draft({ unitPrice: null }), true)).toBe(0);
  });

  it('avisa el primer problema de las líneas', () => {
    expect(draftProblem([])).toContain('al menos un producto');
    expect(draftProblem([draft({ width: null })])).toContain('ancho y el largo');
    expect(draftProblem([draft({ width: 120 })])).toContain('metros');
    expect(draftProblem([draft({ bySize: false, quantity: 1.5, allowsDecimals: false, unitCode: 'UND' })]))
      .toContain('unidades enteras');
    expect(draftProblem([draft({ unitPrice: 0 })])).toContain('precio');
    expect(draftProblem([draft()])).toBeNull();
  });

  it('al entregar, el anticipo cubre primero y el resto lo paga el cliente', () => {
    const order = {
      depositAvailable: 300000,
      items: [
        { id: 'a', total: 432000, delivered: false },
        { id: 'b', total: 150000, delivered: false },
        { id: 'c', total: 180000, delivered: true },
      ],
    } as unknown as Order;
    expect(deliveryAmounts(order, new Set(['a']))).toEqual(
      { total: 432000, applied: 300000, remaining: 132000, leftover: 0, completes: false });
    expect(deliveryAmounts(order, new Set(['b']))).toEqual(
      { total: 150000, applied: 150000, remaining: 0, leftover: 0, completes: false });
    // Completa el pedido y sobra anticipo: el servidor lo rechaza, la pantalla lo avisa antes.
    expect(deliveryAmounts({ ...order, items: order.items.slice(1) }, new Set(['b'])).leftover).toBe(150000);
    expect(deliveryAmounts(order, new Set()).completes).toBe(false);
  });

  it('describe las medidas', () => {
    expect(sizeText({ width: 1.2, length: 0.6, quantity: 0.72, unitCode: 'M2' })).toBe('1,2 × 0,6 m = 0,72 M2');
    expect(sizeText({ width: null, length: null, quantity: 3, unitCode: 'UND' })).toBe('3 UND');
  });

  it('arma el comprobante para WhatsApp', () => {
    const order = {
      number: 'PED-7', status: 'OPEN', customerName: 'Ana María Ruiz', customerPhone: '300 123 4567',
      dueDate: '2026-10-20', total: 366000, deposited: 100000, balanceDue: 266000,
      items: [
        { productName: 'Granito', description: 'Mesón cocina', width: 1.2, length: 0.6, quantity: 0.72,
          unitCode: 'M2', total: 216000, delivered: false },
        { productName: 'Instalación', description: null, width: null, length: null, quantity: 1, unitCode: 'UND',
          total: 150000, delivered: true },
      ],
    } as unknown as Order;
    const text = orderMessage(order, 'Mármoles Ruiz');
    expect(text).toContain('Hola Ana');
    expect(text).toContain('pedido PED-7');
    expect(text).toContain('Granito · Mesón cocina (1,2 × 0,6 m = 0,72 M2)');
    expect(text).toContain('✓ entregado');
    expect(text).toContain('Falta por pagar: $ 266.000');
    expect(orderWhatsAppLink(order, 'X')).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
  });
});
