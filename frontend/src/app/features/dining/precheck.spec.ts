import { Precheck } from '../../core/api/dining.api';
import { headerLines, precheckBytes, precheckTitle } from './precheck';

const P: Precheck = {
  tabId: 't1', label: 'B1', tableName: 'B1', zoneName: 'Barra', guests: 2, openedByName: 'Carlos',
  openedAt: '2026-11-27T02:00:00Z', printedAt: '2026-11-27T04:10:00Z',
  lines: [{ name: 'Cerveza Póker', quantity: 2, unitPrice: 11900, total: 23800, details: 'Bien frías' }],
  subtotal: 20000, tax: 3800, total: 23800, chargedTotal: 0, tipPercent: 10, suggestedTip: 2000,
};

function text(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0x0a ? '\n' : '')).join('');
}

describe('precuenta (decisión 380)', () => {
  it('se titula con la mesa y su zona, o con el nombre de la cuenta', () => {
    expect(precheckTitle(P)).toBe('Mesa B1 · Barra');
    expect(precheckTitle({ ...P, tableName: null, zoneName: null, label: 'Juan · camisa azul' })).toBe('Juan · camisa azul');
    expect(headerLines(' NIT 1\n\n Cra 10 ')).toEqual(['NIT 1', 'Cra 10']);
  });

  it('en la térmica dice PRECUENTA, el total, la propina sugerida y que no es un tiquete de venta', () => {
    const out = text(precheckBytes(P, { name: 'Bar La 38', header: 'NIT 123' }, 80, true));
    expect(out).toContain('PRECUENTA');
    expect(out).toContain('Mesa B1');
    expect(out).toContain('Bien frias');
    expect(out).toMatch(/TOTAL\s+\$\s?23\.800/);
    expect(out).toContain('Propina voluntaria sugerida (10 %)');
    expect(out).toMatch(/Total con propina\s+\$\s?25\.800/);
    expect(out).toContain('no es un tiquete de venta');
  });

  it('sin propina sugerida no la menciona', () => {
    const out = text(precheckBytes({ ...P, tipPercent: 0, suggestedTip: 0 }, { name: 'Bar', header: null }, 58, true));
    expect(out).not.toContain('Propina');
  });
});
