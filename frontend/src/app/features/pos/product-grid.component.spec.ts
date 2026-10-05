import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { Category, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { ProductGridComponent } from './product-grid.component';

const product = (id: string, name: string, over: Partial<Product> = {}): Product => ({
  id, sku: id.toUpperCase(), name, description: null, categoryId: null, categoryName: null, baseUnitId: 'u',
  baseUnitCode: 'UND', taxId: 't', taxCode: 'IVA19', taxType: 'IVA', taxRate: 19, cost: 0, costLocked: false,
  salePrice: 2500, trackInventory: true, tracksLots: false, active: true, conversions: [], barcodes: [],
  listPrices: [], ...over,
});

const page = (content: Product[]): PageResponse<Product> =>
  ({ content, page: 0, size: 48, totalElements: content.length, totalPages: 1 });

describe('ProductGridComponent', () => {
  let fixture: ComponentFixture<ProductGridComponent>;
  let catalog: jasmine.SpyObj<CatalogApi>;
  const categories: Category[] = [
    { id: 'c1', parentId: null, name: 'Bebidas', active: true },
    { id: 'c2', parentId: null, name: 'Vieja', active: false },
  ];

  const create = (favoriteIds: string[] = []): void => {
    fixture = TestBed.createComponent(ProductGridComponent);
    fixture.componentRef.setInput('favoriteIds', favoriteIds);
    fixture.componentRef.setInput('stock', new Map([['a', 12], ['b', 0]]));
    fixture.detectChanges();
  };
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    catalog = jasmine.createSpyObj<CatalogApi>('CatalogApi', ['categories', 'products', 'product']);
    catalog.categories.and.returnValue(of(categories));
    catalog.products.and.returnValue(of(page([
      product('a', 'Gaseosa'),
      product('b', 'Agua'),
      product('c', 'Bolsa', { trackInventory: false }),
      product('d', 'Inactivo', { active: false }),
    ])));
    TestBed.configureTestingModule({
      imports: [ProductGridComponent],
      providers: [provideNoopAnimations(), { provide: CatalogApi, useValue: catalog }],
    });
  });

  it('sin favoritos abre "Todos" con existencia y solo productos y categorías activos', () => {
    create();
    expect(catalog.products).toHaveBeenCalledWith(jasmine.objectContaining({ page: 0, sort: 'name,asc' }));
    const text = element().textContent ?? '';
    expect(text).toContain('Bebidas');
    expect(text).not.toContain('Vieja');
    expect(text).toContain('12 disp.');
    expect(text).toContain('Agotado');
    expect(text).not.toContain('Inactivo');
    expect(element().querySelectorAll('.product-card').length).toBe(3);
  });

  it('tocar una tarjeta la agrega y la estrella la marca como favorita', () => {
    create();
    const picked: Product[] = [];
    const starred: Product[] = [];
    fixture.componentInstance.pick.subscribe((p) => picked.push(p));
    fixture.componentInstance.favoriteToggle.subscribe((p) => starred.push(p));
    (element().querySelector('button[aria-label^="Agregar Gaseosa"]') as HTMLButtonElement).click();
    (element().querySelector('button[aria-label="Agregar a favoritos: Gaseosa"]') as HTMLButtonElement).click();
    expect(picked.map((p) => p.id)).toEqual(['a']);
    expect(starred.map((p) => p.id)).toEqual(['a']);
  });

  it('filtra por categoría', () => {
    create();
    const chip = Array.from(element().querySelectorAll('nav button')).find((b) => b.textContent?.trim() === 'Bebidas');
    (chip as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(catalog.products).toHaveBeenCalledWith(jasmine.objectContaining({ categoryId: 'c1' }));
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('con favoritos abre esa pestaña, en su orden y sin los que ya no existen', () => {
    catalog.product.and.callFake((id: string) =>
      id === 'x' ? throwError(() => new Error('404')) : of(product(id, id === 'a' ? 'Gaseosa' : 'Agua')));
    create(['b', 'x', 'a']);
    expect(catalog.product).toHaveBeenCalledWith('x', true);
    const names = Array.from(element().querySelectorAll('.product-card .line-clamp-2')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Agua', 'Gaseosa']);
    expect(element().querySelector('button[aria-label="Quitar de favoritos: Agua"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('sin favoritos en la pestaña Favoritos explica cómo agregarlos', () => {
    create();
    const chip = Array.from(element().querySelectorAll('nav button')).find((b) => b.textContent?.includes('Favoritos'));
    (chip as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element().textContent).toContain('Aún no tienes favoritos');
  });
});
