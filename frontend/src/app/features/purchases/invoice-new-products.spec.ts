import { SizeScale, Tax } from '../../core/api/api.models';
import { InvoiceDraftLine } from '../../core/api/purchases.api';
import { rowProblem, scaleFor, sizesNotice, skuFor, taxFor, toItems, toRows } from './invoice-new-products';

const taxes: Tax[] = [
  { id: 't1', code: 'IVA19', name: 'IVA 19 %', type: 'IVA', rate: 19, active: true },
  { id: 't2', code: 'EXCLUIDO', name: 'Excluido', type: 'EXCLUDED', rate: 0, active: true },
  { id: 't3', code: 'EXENTO', name: 'Exento', type: 'EXEMPT', rate: 0, active: true },
];
const sizes = (labels: string[]) => labels.map((label) => ({ label, equivalent: null }));
const scales: SizeScale[] = [
  { id: 'ropa', code: 'ROPA_LETRAS', name: 'Ropa (letras)', active: true, sizes: sizes(['S', 'M', 'L']) },
  { id: 'co', code: 'CALZADO_CO', name: 'Calzado Colombia', active: true, sizes: sizes(['35', '36', '37', '38', '39', '40']) },
];

function line(over: Partial<InvoiceDraftLine>): InvoiceDraftLine {
  return {
    lineNo: 1, description: 'Tenis Urban negro', supplierCode: 'REF123', barcode: null, unitCode: 'PAR',
    packageUnit: false, quantity: 6, unitCost: 60000, taxRate: 19, discount: 0, lotNumber: null, expirationDate: null,
    match: null, candidates: [], color: 'Negro', sizes: [], ...over,
  };
}

describe('invoice-new-products (decisión 301)', () => {
  const ctx = { taxes, scales, margin: 30, pricesIncludeTax: true, variants: true };

  it('elige la escala que tiene todas las tallas leídas', () => {
    expect(scaleFor(['36', '38'], scales)?.id).toBe('co');
    expect(scaleFor(['M'], scales)?.id).toBe('ropa');
    expect(scaleFor([], scales)?.id).toBe('ropa');
  });

  it('arma la fila con la curva de tallas, el SKU del proveedor y el precio con margen', () => {
    const [row] = toRows([line({ sizes: [{ size: '36', quantity: 1 }, { size: '37', quantity: 2 },
      { size: '38', quantity: 2 }, { size: '39', quantity: 1 }] })], ctx);
    expect(row.withSizes).toBeTrue();
    expect(row.sizeScaleId).toBe('co');
    expect(row.sku).toBe('REF123');
    expect(row.unitCode).toBe('UND');
    expect(row.price).toBe(102000);
    expect(rowProblem(row, scales)).toBeNull();
    expect(sizesNotice(row, scales)).toBeNull();
    const [item] = toItems([row], scales);
    expect(item.sizes).toEqual([{ size: '36', quantity: 1 }, { size: '37', quantity: 2 }, { size: '38', quantity: 2 },
      { size: '39', quantity: 1 }]);
    expect(item.unitCode).toBeNull();
  });

  it('sin curva en la factura pide repartir los pares y avisa si no da la cantidad', () => {
    const [row] = toRows([line({ sizes: [] })], ctx);
    expect(row.withSizes).toBeFalse();
    row.withSizes = true;
    row.sizeScaleId = 'co';
    expect(rowProblem(row, scales)).toBe('Reparte las cantidades por talla.');
    row.sizeQty['38'] = 4;
    expect(sizesNotice(row, scales)).toBe('Repartiste 4 y la factura dice 6: se recibe lo repartido.');
  });

  it('sin el módulo de tallas todo se crea como producto simple', () => {
    const [row] = toRows([line({ sizes: [{ size: '38', quantity: 6 }] })], { ...ctx, variants: false });
    expect(row.withSizes).toBeFalse();
    expect(toItems([row], scales)[0].sizes).toEqual([]);
  });

  it('SKU e impuesto para lo que no trae código', () => {
    const taken = new Set<string>(['CAMSPO-01']);
    expect(skuFor('Camiseta sport', null, taken)).toBe('CAMSPO-02');
    expect(taxFor(0, taxes)).toBe('EXENTO');
  });
});
