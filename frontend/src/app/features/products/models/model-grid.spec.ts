import { ProductModel } from '../../../core/api/api.models';
import { gridQuantities, modelGrid, newVariantCount, parseColors, variantExample } from './model-grid';

function model(colors: string[], sizes: string[]): ProductModel {
  const variants = (colors.length > 0 ? colors : [null]).flatMap((color) => sizes.map((size) => ({
    productId: `${color ?? 'x'}-${size}`, sku: `M-${size}`, name: `Modelo T${size}`, size, color, barcode: null,
    baseUnitId: 'und', baseUnitCode: 'UND', active: true,
  })));
  return {
    id: 'm', skuPrefix: 'M', name: 'Modelo', description: null, categoryId: null, categoryName: null, taxId: 't',
    taxCode: 'IVA19', cost: 0, salePrice: 1000, sizeScaleId: 's', sizeScaleName: 'Calzado Colombia', active: true,
    sizes, colors, variants,
  };
}

describe('model-grid (fase 8d)', () => {
  it('arma la cuadrícula talla × color y encuentra cada variante', () => {
    const grid = modelGrid(model(['Negro', 'Blanco'], ['38', '39']));
    expect(grid.colors).toEqual(['Negro', 'Blanco']);
    expect(grid.sizes).toEqual(['38', '39']);
    expect(grid.at('negro', '39')?.productId).toBe('Negro-39');
    expect(grid.at('Rojo', '39')).toBeUndefined();
  });

  it('un modelo sin colores tiene una sola fila', () => {
    const grid = modelGrid(model([], ['S', 'M']));
    expect(grid.colors).toEqual([null]);
    expect(grid.at(null, 'M')?.productId).toBe('x-M');
  });

  it('lee los colores escritos con comas, sin vacíos ni repetidos y con mayúscula inicial', () => {
    expect(parseColors(' negro, blanco ,,  Azul   cielo, Negro')).toEqual(['Negro', 'Blanco', 'Azul cielo']);
    expect(parseColors('')).toEqual([]);
  });

  it('cuenta solo las combinaciones nuevas', () => {
    const m = model(['Negro'], ['38', '39']);
    expect(newVariantCount(null, ['38', '39', '40'], ['Negro', 'Blanco'])).toBe(6);
    expect(newVariantCount(m, ['39', '40'], ['Negro', 'Blanco'])).toBe(3);
    expect(newVariantCount(model([], ['S']), ['S', 'M'], [])).toBe(1);
  });

  it('muestra el SKU y el nombre como los arma el servidor', () => {
    expect(variantExample('run', 'Tenis Runner ', '38', 'Azul cielo')).toEqual({ sku: 'RUN-38-AZULCI', name: 'Tenis Runner T38 Azul cielo' });
    expect(variantExample('CAM', 'Camiseta', 'XL', null)).toEqual({ sku: 'CAM-XL', name: 'Camiseta XL' });
    expect(variantExample('B', 'Bota', '7.5', 'Café')).toEqual({ sku: 'B-7.5-CAFE', name: 'Bota T7.5 Café' });
  });

  it('convierte las cantidades de la cuadrícula en líneas', () => {
    const m = model(['Negro'], ['38', '39', '40']);
    const lines = gridQuantities(m, { 'Negro-38': 3, 'Negro-39': null, 'Negro-40': 0 });
    expect(lines.map((l) => [l.variant.size, l.quantity])).toEqual([['38', 3], ['40', 0]]);
  });
});
