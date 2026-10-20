import { CashReport } from '../../core/api/api.models';
import { cashRows, cashSummaryText, cashSummaryWhatsApp, reportTitle, ticketDateTime } from './cash-ticket-text';

const report = (overrides: Partial<CashReport> = {}, cash: Partial<CashReport['cash']> = {}): CashReport => ({
  session: {
    id: 's1', cashRegisterId: 'r1', registerCode: 'CAJA-1', registerName: 'Caja 1', branchId: 'b1',
    branchName: 'Principal', status: 'CLOSED', openedBy: 'u1', openedByName: 'Ana', openedAt: '2026-10-20T13:00:00Z',
    openingAmount: 100000, openingNotes: null, closedAt: '2026-10-21T02:00:00Z', closedBy: 'u1', closedByName: 'Ana',
    countedAmount: 395000, expectedAmount: 400000, difference: -5000, closingNotes: 'Faltó un billete', mine: true,
    shared: true,
  },
  salesCount: 12, salesTotal: 320000, voidedCount: 1, voidedTotal: 20000, netSales: 300000,
  byMethod: [
    { paymentMethodId: 'm1', code: 'CASH', name: 'Efectivo', amount: 250000, count: 10 },
    { paymentMethodId: 'm2', code: 'TRANSFER', name: 'Transferencia', amount: 50000, count: 2 },
  ],
  voidsHereCount: 0, voidedAfterCloseCount: 0, voidedAfterCloseTotal: 0,
  cash: {
    opening: 100000, sales: 250000, voidRefunds: 0, incomes: 0, expenses: -30000, withdrawals: 0,
    creditPayments: null, orderPayments: 80000, expected: 400000, counted: 395000, difference: -5000, ...cash,
  },
  auditView: true,
  ...overrides,
}) as CashReport;

describe('cash-ticket-text', () => {
  it('titula el cierre y el parcial', () => {
    expect(reportTitle(report())).toBe('Cierre de caja (Z)');
    expect(reportTitle(report({ session: { ...report().session, status: 'OPEN' } }))).toBe('Informe parcial (X)');
  });

  it('muestra fiado y pedidos solo si el negocio los usa', () => {
    const labels = cashRows(report()).map(([label]) => label);
    expect(labels).toContain('Anticipos de pedidos');
    expect(labels).not.toContain('Abonos de fiado');
  });

  it('arma el resumen con ventas, medios, efectivo y diferencia', () => {
    const text = cashSummaryText(report(), 'Granizados Ana', 'America/Bogota');
    expect(text).toContain('*Cierre de caja (Z)* · Granizados Ana');
    expect(text).toContain('Ventas netas: $ 300.000');
    expect(text).toContain('• Transferencia (2): $ 50.000');
    expect(text).toContain('Esperado: $ 400.000');
    expect(text).toContain('Faltante: -$ 5.000');
    expect(text).toContain('Notas: Faltó un billete');
  });

  it('respeta el cierre ciego: sin esperado ni diferencia', () => {
    const text = cashSummaryText(report({ auditView: false }), 'X');
    expect(text).not.toContain('Esperado');
    expect(text).not.toContain('Faltante');
    expect(text).toContain('Contado: $ 395.000');
  });

  it('usa la zona horaria del negocio y abre WhatsApp sin número', () => {
    expect(ticketDateTime('2026-10-21T02:00:00Z', 'America/Bogota')).toContain('20/10/26');
    expect(ticketDateTime(null)).toBe('');
    expect(cashSummaryWhatsApp(report(), 'X')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
