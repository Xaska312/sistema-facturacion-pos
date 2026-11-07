import { BillingAddon, BillingPlan } from '../../core/api/billing.api';
import { addonsForSale, annualSaving, checkLines, orderTotal } from './billing-text';

const negocio: BillingPlan = { code: 'NEGOCIO', name: 'Negocio', monthlyPrice: 69900, annualPrice: 699000, maxBranches: 1,
  maxUsers: 6, maxRegisters: 3, modules: ['TABLES'], features: ['PURCHASES'] };
const addon = (code: string, kind: BillingAddon['kind'], ref: string | null, price: number | null): BillingAddon =>
  ({ code, kind, ref, name: code, description: '', monthlyPrice: price, active: true, sortOrder: 1 });
const addons = [addon('AI', 'FEATURE', 'AI', 39900), addon('TABLES', 'MODULE', 'TABLES', 14900),
  addon('EXTRA_USER', 'USER', null, 4900), addon('SCALE', 'MODULE', 'SCALE', null)];

describe('billing-text (decisión 302)', () => {
  it('no ofrece lo que trae el plan ni lo que no tiene precio', () => {
    expect(addonsForSale(addons, [...negocio.modules, ...negocio.features]).map((a) => a.code)).toEqual(['AI', 'EXTRA_USER']);
  });

  it('suma plan, XASKA IA y usuarios igual que el servidor', () => {
    expect(orderTotal(negocio, 'MONTHLY', 2, addons, { AI: 1, EXTRA_USER: 2 })).toBe(239200);
    expect(orderTotal(null, 'ANNUAL', 1, addons, { AI: 1 })).toBe(478800);
  });

  it('ahorro del anual', () => {
    expect(annualSaving(negocio)).toBe(17);
  });

  it('explica la revisión de Aska', () => {
    const lines = checkLines({ readable: true, amount: 1, reference: '', date: '', destination: '', successful: true,
      amountOk: false, referenceOk: true, destinationOk: true, note: '' }, 'XK123456');
    expect(lines.filter((l) => !l.ok).map((l) => l.text)).toEqual(['El valor no coincide']);
  });
});
