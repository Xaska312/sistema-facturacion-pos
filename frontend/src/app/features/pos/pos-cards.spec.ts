import { Product, ProductModelRow } from '../../core/api/api.models';
import { firstName, gridCards, groupSearchResults, modelNameOf, searchRows } from './pos-cards';

const product = (id: string, name: string, over: Partial<Product> = {}): Product => ({
  id, sku: id.toUpperCase(), name, description: null, categoryId: null, categoryName: null, baseUnitId: 'u',
  baseUnitCode: 'UND', taxId: 't', taxCode: 'IVA19', taxType: 'IVA', taxRate: 19, cost: 0, costLocked: false,
  salePrice: 2500, trackInventory: true, tracksLots: false, active: true, conversions: [], barcodes: [],
  listPrices: [], ...over,
});

const model = (id: string, name: string): ProductModelRow => ({
  id, skuPrefix: id.toUpperCase(), name, categoryName: null, salePrice: 120000, sizeScaleName: 'Calzado Colombia',
  variants: 5, active: true,
});

describe('pos-cards (fase 8d)', () => {
  it('une productos y modelos por nombre, sin tallas sueltas', () => {
    const cards = gridCards(
      [product('a', 'Zapato suelto'), product('b', 'arroz'), product('v', 'Tenis Runner T38', { modelId: 'm' })],
      [model('m', 'Tenis Runner')],
    );
    expect(cards.map((c) => `${c.kind}:${c.name}`)).toEqual(['product:arroz', 'model:Tenis Runner', 'product:Zapato suelto']);
  });

  it('saca el nombre del modelo del de la talla', () => {
    expect(modelNameOf({ name: 'Tenis Runner T38 Negro', variantSize: '38', variantColor: 'Negro' })).toBe('Tenis Runner');
    expect(modelNameOf({ name: 'Camiseta XL', variantSize: 'XL', variantColor: null })).toBe('Camiseta');
    expect(modelNameOf({ name: 'Arroz', variantSize: null, variantColor: null })).toBe('Arroz');
    expect(modelNameOf({ name: 'Renombrado a mano', variantSize: '40', variantColor: null })).toBe('Renombrado a mano');
  });

  it('en la búsqueda junta las tallas de un modelo en una fila', () => {
    const rows = groupSearchResults([
      product('v38', 'Tenis Runner T38', { modelId: 'm', variantSize: '38' }),
      product('x', 'Tenis de mesa'),
      product('v39', 'Tenis Runner T39', { modelId: 'm', variantSize: '39' }),
    ]);
    expect(rows.map((r) => (r.kind === 'model' ? `model:${r.name}:${r.matches}` : `product:${r.product.name}`)))
      .toEqual(['model:Tenis Runner:2', 'product:Tenis de mesa']);
  });

  it('mientras falten páginas, muestra solo hasta el último nombre cargado', () => {
    const products = [product('a', 'Arroz'), product('z', 'Zapato')];
    const models = [model('m', 'Botas'), model('t', 'Tenis Runner')];
    const cutoff = firstName(['Botas', null]);
    expect(gridCards(products, models, cutoff).map((c) => c.name)).toEqual(['Arroz', 'Botas']);
    expect(firstName([null, null])).toBeNull();
  });

  it('la búsqueda por nombre une productos y modelos', () => {
    const rows = searchRows([product('x', 'Tenis de mesa')], [model('m', 'Tenis Runner')]);
    expect(rows.map((r) => `${r.kind}:${r.kind === 'model' ? r.name : r.product.name}`))
      .toEqual(['product:Tenis de mesa', 'model:Tenis Runner']);
  });
});
