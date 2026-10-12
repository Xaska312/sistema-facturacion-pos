import { TestBed } from '@angular/core/testing';
import { ProductModel, ProductVariant } from '../../core/api/api.models';
import { VariantPickerComponent } from './variant-picker.component';

const variant = (id: string, size: string, color: string | null, active = true): ProductVariant => ({
  productId: id, sku: `RUN-${size}`, name: `Tenis Runner T${size}`, size, color, barcode: null, baseUnitId: 'u',
  baseUnitCode: 'UND', active,
});

const model: ProductModel = {
  id: 'm', skuPrefix: 'RUN', name: 'Tenis Runner', description: null, categoryId: null, categoryName: null,
  taxId: 't', taxCode: 'IVA19', cost: 60000, salePrice: 120000, sizeScaleId: 's', sizeScaleName: 'Calzado Colombia',
  active: true, sizes: ['38', '39', '40'], colors: ['Negro'],
  variants: [variant('n38', '38', 'Negro'), variant('n39', '39', 'Negro'), variant('n40', '40', 'Negro', false)],
};

describe('VariantPickerComponent (fase 8d)', () => {
  it('muestra cada talla con su existencia y entrega la elegida', () => {
    TestBed.configureTestingModule({ imports: [VariantPickerComponent] });
    const fixture = TestBed.createComponent(VariantPickerComponent);
    fixture.componentRef.setInput('model', model);
    fixture.componentRef.setInput('stockMap', new Map([['n38', 3], ['n39', 0]]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Talla 38 Negro, 3 disp.',
      'Talla 39 Negro, Agotado',
    ]);
    expect(element.textContent).toContain('3 unidades disponibles');
    expect(element.textContent).toContain('no disponible');

    const picked: string[] = [];
    fixture.componentInstance.pick.subscribe((v) => picked.push(v.productId));
    buttons[0].click();
    expect(picked).toEqual(['n38']);
  });
});
