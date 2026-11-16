import { HttpErrorResponse } from '@angular/common/http';
import { OfflineCatalogItem } from '../api/api.models';
import { findByCode, findByProduct, gridProducts, lookupFromItem, searchItems } from './offline-catalog';
import { isNetworkError, provisionalNumber } from './offline-sales.service';

function item(over: Partial<OfflineCatalogItem>): OfflineCatalogItem {
  return {
    productId: 'p1', sku: 'GAS', name: 'Gaseosa Colombiana 400 ml', unitId: 'und', unitCode: 'UND', factor: 1,
    price: 2500, taxId: 'iva19', taxType: 'IVA', taxRate: 19, trackInventory: true, openPrice: false,
    allowsDecimals: false, codes: ['GAS', '7702090000001'], ...over,
  };
}

const ITEMS = [
  item({}),
  item({ unitId: 'cja', unitCode: 'CJ', factor: 12, price: 27000, codes: ['7702090000012'] }),
  item({ productId: 'p2', sku: 'AGUA', name: 'Agua Cielo Manzana 620 ml', price: 4000, codes: ['AGUA'] }),
];

describe('Copia del catálogo sin conexión (decisión 332)', () => {
  it('encuentra por código de barras o SKU sin importar mayúsculas, con su presentación', () => {
    expect(findByCode(ITEMS, '7702090000012')?.unitCode).toBe('CJ');
    expect(findByCode(ITEMS, 'gas')?.unitCode).toBe('UND');
    expect(findByCode(ITEMS, 'NO-EXISTE')).toBeNull();
    expect(findByCode(ITEMS, '  ')).toBeNull();
  });

  it('da el precio de la presentación o de la unidad base', () => {
    expect(findByProduct(ITEMS, 'p1', 'cja')?.price).toBe(27000);
    expect(findByProduct(ITEMS, 'p1', null)?.price).toBe(2500);
    expect(lookupFromItem(ITEMS[1])).toEqual(jasmine.objectContaining({ productId: 'p1', factor: 12, price: 27000,
      priceListId: null, fromList: false }));
  });

  it('busca por palabras en el nombre o el SKU, sin tildes y solo en la unidad base', () => {
    expect(searchItems(ITEMS, 'cielo manzána').map((i) => i.productId)).toEqual(['p2']);
    expect(searchItems(ITEMS, 'gas').length).toBe(1);
    expect(searchItems(ITEMS, '')).toEqual([]);
  });

  it('número provisional y errores de red', () => {
    expect(provisionalNumber('CAJA-1', 7)).toBe('CAJA-1-SC0007');
    expect(isNetworkError(new HttpErrorResponse({ status: 0 }))).toBeTrue();
    expect(isNetworkError(new HttpErrorResponse({ status: 503 }))).toBeTrue();
    expect(isNetworkError(new HttpErrorResponse({ status: 422 }))).toBeFalse();
    expect(isNetworkError(new Error('x'))).toBeFalse();
  });

  it('la cuadrícula sin internet: un producto por tarjeta, por categoría con sus subcategorías (decisión 353)', () => {
    const items = [
      item({ categoryId: 'bebidas' }),
      item({ unitId: 'cja', unitCode: 'CJ', factor: 12, price: 27000, codes: [], categoryId: 'bebidas' }),
      item({ productId: 'p2', sku: 'AGUA', name: 'Agua Cielo', categoryId: 'aguas' }),
      item({ productId: 'p3', sku: 'PAN', name: 'Pan', categoryId: null }),
    ];
    const cats = [{ id: 'bebidas', parentId: null, name: 'Bebidas' }, { id: 'aguas', parentId: 'bebidas', name: 'Aguas' }];
    expect(gridProducts(items, cats, null).map((p) => p.name)).toEqual(['Agua Cielo', 'Gaseosa Colombiana 400 ml', 'Pan']);
    expect(gridProducts(items, cats, 'bebidas').map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(gridProducts(items, cats, 'aguas').map((p) => p.id)).toEqual(['p2']);
    expect(gridProducts(items, cats, null)[1].salePrice).toBe(2500);
  });
});
