import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CartPanelComponent, LineQuantityChange, RemovedLine } from './cart-panel.component';
import { CartLine, cartTotals } from './sale-math';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  key: 'p|u', productId: 'p', sku: 'P', name: 'Gaseosa', unitId: 'u', unitCode: 'UND', quantity: 2,
  unitPrice: 2500, discountPercent: 0, taxRate: 19, trackInventory: true, ...over,
});

describe('CartPanelComponent', () => {
  let fixture: ComponentFixture<CartPanelComponent>;
  let component: CartPanelComponent;

  const setLines = (lines: CartLine[]): void => {
    fixture.componentRef.setInput('lines', lines);
    fixture.componentRef.setInput('totals', cartTotals(lines, true));
    fixture.detectChanges();
  };
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement =>
    element().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CartPanelComponent], providers: [provideNoopAnimations()] });
    fixture = TestBed.createComponent(CartPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('customerName', 'Consumidor final');
    fixture.componentRef.setInput('canCharge', true);
    setLines([line()]);
  });

  afterEach(async () => {
    component.closeEditor();
    component.clearUndo();
    await fixture.whenStable();
  });

  it('es la región "Venta actual" con la línea, el total y botones táctiles', () => {
    const aside = element().querySelector('aside');
    expect(aside?.getAttribute('aria-label')).toBe('Venta actual');
    expect(element().textContent).toContain('Gaseosa');
    expect(element().textContent).toContain('Consumidor final');
    expect(element().textContent).toContain('Cobrar (F4)');
    expect(button('Uno más de Gaseosa')).toBeTruthy();
    expect(button('Uno menos de Gaseosa')).toBeTruthy();
    expect(button('Quitar Gaseosa')).toBeTruthy();
  });

  it('+ y − emiten la nueva cantidad', () => {
    const changes: LineQuantityChange[] = [];
    component.quantityChange.subscribe((c) => changes.push(c));
    button('Uno más de Gaseosa').click();
    button('Uno menos de Gaseosa').click();
    expect(changes).toEqual([{ key: 'p|u', quantity: 3 }, { key: 'p|u', quantity: 1 }]);
  });

  it('al quitar ofrece "Deshacer", que devuelve la línea a su lugar', fakeAsync(() => {
    const removed: string[] = [];
    const restored: RemovedLine[] = [];
    component.removeLine.subscribe((key) => removed.push(key));
    component.restoreLine.subscribe((r) => restored.push(r));

    button('Quitar Gaseosa').click();
    expect(removed).toEqual(['p|u']);
    setLines([]);
    expect(element().textContent).toContain('Se quitó Gaseosa');

    const undo = Array.from(element().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Deshacer');
    undo?.click();
    fixture.detectChanges();
    expect(restored).toEqual([{ line: line(), index: 0 }]);
    expect(element().textContent).not.toContain('Se quitó');
    tick(10000);
  }));

  it('"Deshacer" desaparece solo después de unos segundos', fakeAsync(() => {
    button('Quitar Gaseosa').click();
    fixture.detectChanges();
    expect(element().textContent).toContain('Se quitó Gaseosa');
    tick(10000);
    fixture.detectChanges();
    expect(element().textContent).not.toContain('Se quitó');
  }));

  it('− con una unidad quita la línea (con deshacer)', () => {
    const removed: string[] = [];
    component.removeLine.subscribe((key) => removed.push(key));
    setLines([line({ quantity: 1 })]);
    button('Uno menos de Gaseosa').click();
    expect(removed).toEqual(['p|u']);
  });

  it('avisa cuando no alcanza la existencia', () => {
    fixture.componentRef.setInput('shortages', new Map([['p|u', 1]]));
    fixture.detectChanges();
    expect(element().textContent).toContain('Solo hay 1 en existencia');
  });

  it('tocar la línea abre el editor de cantidad y descuento; Esc lo cierra sin cancelar la venta', () => {
    expect(component.closeEditor()).toBeFalse();
    const row = element().querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    row.click();
    fixture.detectChanges();
    expect(component.closeEditor()).toBeTrue();
  });

  it('sin líneas invita a escanear', () => {
    setLines([]);
    expect(element().textContent).toContain('Escanea un producto');
  });
});
