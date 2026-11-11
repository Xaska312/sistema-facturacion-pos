import {
  certificateBadge,
  proportionalBases,
  rateText,
  resolveForPayment,
  resolveForSale,
  toWithholdingLines,
  usualText,
  withholdingProblem,
} from './withholding-text';

describe('withholding-text (decisión 322)', () => {
  const bases = { base: 1000000, iva: 190000 };

  it('calcula retefuente y reteICA sobre la base y reteIVA sobre el IVA, al peso', () => {
    const r = resolveForSale([
      { type: 'RETEFUENTE', rate: 6, base: null, amount: null },
      { type: 'RETEICA', rate: 0.966, base: null, amount: null },
      { type: 'RETEIVA', rate: 15, base: null, amount: null },
    ], bases);
    expect(r.lines.map((l) => l.amount)).toEqual([60000, 9660, 28500]);
    expect(r.lines.map((l) => l.base)).toEqual([1000000, 1000000, 190000]);
    expect(r.total).toBe(98160);
  });

  it('respeta la base y el valor que escribe quien maneja las finanzas', () => {
    const r = resolveForSale([{ type: 'RETEFUENTE', rate: 6, base: 500000, amount: null },
      { type: 'RETEICA', rate: null, base: null, amount: 1234 }], bases);
    expect(r.lines.map((l) => l.amount)).toEqual([30000, 1234]);
    expect(toWithholdingLines(r)[1]).toEqual({ type: 'RETEICA', base: 1000000, rate: null, amount: 1234 });
  });

  it('en un abono despeja el valor completo: paga 1.130.000 y retiene 6 % de la base', () => {
    // Pedido de $2.380.000 con base $2.000.000.
    const r = resolveForPayment([{ type: 'RETEFUENTE', rate: 6, base: null, amount: null }], 1130000,
      (gross) => proportionalBases(gross, 2380000, 2000000, 380000));
    expect(r.total).toBe(60000);
    expect(r.gross).toBe(1190000);
    expect(r.lines[0].base).toBe(1000000);
  });

  it('reparte la base en proporción', () => {
    expect(proportionalBases(595000, 1190000, 1000000, 190000)).toEqual({ base: 500000, iva: 95000 });
    expect(proportionalBases(10, 0, 5, 5)).toEqual({ base: 0, iva: 0 });
  });

  it('avisa lo que falla', () => {
    expect(withholdingProblem(resolveForSale([{ type: 'RETEIVA', rate: 15, base: null, amount: null }],
      { base: 100, iva: 0 }))).toContain('no tiene IVA');
    expect(withholdingProblem(resolveForSale([{ type: 'RETEFUENTE', rate: null, base: null, amount: null }], bases)))
      .toContain('tarifa o el valor');
    expect(withholdingProblem(resolveForSale([{ type: 'RETEFUENTE', rate: null, base: 10, amount: 20 }], bases)))
      .toContain('mayor que su base');
    expect(withholdingProblem(resolveForSale([{ type: 'RETEFUENTE', rate: 6, base: null, amount: null }], bases)))
      .toBeNull();
  });

  it('escribe las tarifas y las habituales del cliente', () => {
    expect(rateText(6)).toBe('6 %');
    expect(rateText(0.966)).toBe('0,966 %');
    expect(usualText([{ type: 'RETEFUENTE', rate: 6 }, { type: 'RETEICA', rate: 0.966 }]))
      .toBe('Retefuente 6 % · ReteICA 0,966 %');
  });
});

describe('certificateBadge', () => {
  it('distingue anulada, reversada, recibido y pendiente', () => {
    expect(certificateBadge({ voided: true, reversal: false, certificateReceived: false }).label).toBe('Venta anulada');
    expect(certificateBadge({ voided: false, reversal: true, certificateReceived: false }).label).toBe('Reversada');
    expect(certificateBadge({ voided: false, reversal: false, certificateReceived: true }).key).toBe('completed');
    expect(certificateBadge({ voided: false, reversal: false, certificateReceived: false }).key).toBe('pending');
  });
});
