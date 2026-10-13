import { skuFromName } from './product-form';

describe('skuFromName', () => {
  it('arma un código interno con el nombre, sin tildes', () => {
    expect(skuFromName('Gaseosa cola 400 ml')).toBe('GASE-COLA-400-ML');
    expect(skuFromName('Café molido  "Águila" x 500g')).toBe('CAFE-MOLI-AGUI-X');
    expect(skuFromName('  ')).toBe('');
  });
});
