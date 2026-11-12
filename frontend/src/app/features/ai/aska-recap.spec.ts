import { AskaRecap } from '../../core/api/ai.api';
import { recapLines } from './aska-recap';

describe('Lo que hiciste con Aska (decisión 309)', () => {
  const base: AskaRecap = { title: 'Tu octubre con Aska', from: '2026-10-01', to: '2026-10-31', invoices: 0,
    invoiceLines: 0, products: 0, questions: 0, reviews: 0, digests: 0, minutesSaved: 0, savedLabel: '' };

  it('cuenta solo lo que pasó, en singular o plural', () => {
    const lines = recapLines({ ...base, invoices: 1, invoiceLines: 18, questions: 3, digests: 1 });
    expect(lines.map((l) => l.text)).toEqual([
      'Leí 1 factura de tus proveedores: 18 líneas que no digitaste.',
      'Respondí 3 preguntas sobre tu negocio.',
      'Te conté cómo te fue 1 día en el Resumen del día.',
    ]);
    expect(recapLines(base)).toEqual([]);
  });

  it('cuenta los recibos de gastos leídos (decisión 325)', () => {
    expect(recapLines({ ...base, receipts: 2 }).map((l) => l.text))
      .toEqual(['Leí 2 recibos de tus gastos y llené el formulario por ti.']);
  });
});
