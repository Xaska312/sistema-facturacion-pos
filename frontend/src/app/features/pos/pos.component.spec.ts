import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { CashSession, PageResponse, Party, PosConfig, ProductLookup } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { PartiesApi } from '../../core/api/parties.api';
import { SalesApi } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { BrandingService } from '../../core/theme/branding.service';
import { ConfirmOptions, ConfirmService } from '../../shared/confirm';
import { TourService } from '../../shared/tour/tour.service';
import { heldKey } from './held-sales';
import { PosComponent } from './pos.component';

const config: PosConfig = {
  pricesIncludeTax: true, maxDiscountPercent: 0, allowNegativeStock: false, currency: 'COP', receiptFooter: null,
  businessName: 'Tienda demo', finalConsumerId: 'cf',
};

const session = {
  id: 's1', cashRegisterId: 'r1', registerCode: 'CAJA-1', registerName: 'Caja 1', branchId: 'b1', branchName: 'Principal',
  status: 'OPEN', openedBy: 'u1', openedByName: 'Ana', openedAt: '2026-10-16T13:00:00Z', openingAmount: 50000,
  openingNotes: null, closedAt: null, closedBy: null,
} as unknown as CashSession;

const lookup = (productId: string, price = 2500): ProductLookup => ({
  productId, sku: productId.toUpperCase(), name: `Producto ${productId}`, unitId: 'u', unitCode: 'UND', factor: 1,
  price, priceListId: null, fromList: false, taxId: 't', taxType: 'IVA', taxRate: 19, trackInventory: true,
});

const page = <T>(content: T[]): PageResponse<T> => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });

describe('PosComponent: celular, pausar venta y cliente nuevo', () => {
  const KEY = heldKey('t1', 'u1');
  let fixture: ComponentFixture<PosComponent>;
  let component: PosComponent;
  let sales: jasmine.SpyObj<SalesApi>;

  beforeEach(() => {
    localStorage.removeItem(KEY);
    sales = jasmine.createSpyObj<SalesApi>('SalesApi', ['config', 'lookup', 'price', 'create']);
    sales.config.and.returnValue(of(config));
    sales.price.and.callFake((productId: string) => of(lookup(productId, 3000)));
    const cash = jasmine.createSpyObj<CashApi>('CashApi', ['current', 'paymentMethods']);
    cash.current.and.returnValue(of(session));
    cash.paymentMethods.and.returnValue(of([]));
    const catalog = jasmine.createSpyObj<CatalogApi>('CatalogApi',
      ['units', 'categories', 'products', 'productModels', 'productModel', 'product']);
    catalog.units.and.returnValue(of([]));
    catalog.categories.and.returnValue(of([]));
    catalog.products.and.returnValue(of(page([])));
    catalog.productModels.and.returnValue(of(page([])));
    const inventory = jasmine.createSpyObj<InventoryApi>('InventoryApi', ['stock']);
    inventory.stock.and.returnValue(of(page([])));
    const parties = jasmine.createSpyObj<PartiesApi>('PartiesApi', ['search', 'save']);
    parties.search.and.returnValue(of(page<Party>([])));
    const confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['ask']);
    confirm.ask.and.callFake((options: ConfirmOptions) => options.accept());

    TestBed.configureTestingModule({
      imports: [PosComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: SalesApi, useValue: sales },
        { provide: CashApi, useValue: cash },
        { provide: CatalogApi, useValue: catalog },
        { provide: InventoryApi, useValue: inventory },
        { provide: PartiesApi, useValue: parties },
        { provide: ConfirmService, useValue: confirm },
        { provide: MessageService, useValue: jasmine.createSpyObj<MessageService>('MessageService', ['add']) },
        { provide: TourService, useValue: jasmine.createSpyObj<TourService>('TourService', ['offer', 'start']) },
        { provide: BrandingService, useValue: { logo: signal<string | null>(null) } },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'u1', email: 'ana@demo.test', fullName: 'Ana', platformAdmin: false, emailVerified: true }),
            tenantId: signal('t1'),
            hasPermission: () => true,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(async () => {
    localStorage.removeItem(KEY);
    component.holdOpen = false;
    component.heldOpen = false;
    component.newCustomerOpen = false;
    component.openPriceOpen = false;
    component['searchOpen'] = false;
    component['customerOpen'] = false;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const lines = () => component['lines']();

  it('en el celular hay un campo grande para buscar por nombre (no hace falta F2)', () => {
    const search = Array.from(element().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Buscar producto por nombre o código'));
    expect(search).toBeTruthy();
    search?.click();
    expect(component['searchOpen']).toBeTrue();
  });

  it('con productos muestra la barra fija con el total y Cobrar', () => {
    expect(element().querySelector('.phone-bar')).toBeNull();
    component.addLine(lookup('a'), 2);
    fixture.detectChanges();
    const bar = element().querySelector('.phone-bar');
    expect(bar?.textContent).toContain('Cobrar');
    expect(bar?.textContent).toContain('2 art.');
  });

  it('"Pausar venta" guarda el carrito en este equipo y deja la venta vacía', () => {
    component.addLine(lookup('a'), 2);
    component.openHold();
    expect(component.holdOpen).toBeTrue();
    expect(component.holdLabel).toBe('Venta en espera 1');

    component.holdLabel = 'Señora Marta';
    component.confirmHold();

    expect(lines().length).toBe(0);
    expect(component.held().map((h) => h.label)).toEqual(['Señora Marta']);
    expect((JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]).length).toBe(1);
    fixture.detectChanges();
    expect(element().querySelector('button[aria-label="Ventas en espera: 1"]')).toBeTruthy();
  });

  it('retomar devuelve los productos con precios vigentes y pausa la venta que estaba en curso', () => {
    component.addLine(lookup('a'), 2);
    component.openHold();
    component.confirmHold();
    component.addLine(lookup('b'), 1);
    sales.price.calls.reset();

    component.resumeHeld(component.held()[0]);

    expect(lines().map((l) => [l.productId, l.quantity, l.unitPrice])).toEqual([['a', 2, 3000]]);
    expect(sales.price).toHaveBeenCalledWith('a', 'u', 'cf');
    expect(component.held().length).toBe(1);
    expect(component.held()[0].lines.map((l) => l.productId)).toEqual(['b']);
  });

  it('si un producto ya no se puede vender, retomar conserva su línea y avisa', () => {
    component.addLine(lookup('a'), 1);
    component.openHold();
    component.confirmHold();
    sales.price.and.returnValue(throwError(() => new Error('producto inactivo')));
    const messages = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
    messages.add.calls.reset();

    component.resumeHeld(component.held()[0]);

    expect(lines().map((l) => [l.productId, l.unitPrice])).toEqual([['a', 2500]]);
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'No se pudo actualizar el precio' }));
  });

  it('otra pestaña retomó la venta: no se duplica', () => {
    component.addLine(lookup('a'), 1);
    component.openHold();
    component.confirmHold();
    const stale = component.held()[0];
    localStorage.removeItem(KEY);

    component.resumeHeld(stale);

    expect(lines().length).toBe(0);
    expect(component.held()).toEqual([]);
  });

  it('precio libre: pide el precio, cada impresión va en su línea y cambiar de cliente no lo pisa', () => {
    const printing = { ...lookup('imp', 1000), name: 'Impresión color', openPrice: true };
    component.addLine(printing, 3);
    expect(component.openPriceOpen).toBeTrue();
    expect(component.openPriceValue).toBe(1000);
    expect(lines().length).toBe(0);

    component.openPriceValue = 1500;
    component.confirmOpenPrice();
    component.addLine(printing, 1);
    component.openPriceValue = 800;
    component.confirmOpenPrice();

    expect(lines().map((l) => [l.productId, l.quantity, l.unitPrice, l.openPrice])).toEqual([
      ['imp', 3, 1500, true],
      ['imp', 1, 800, true],
    ]);
    expect(new Set(lines().map((l) => l.key)).size).toBe(2);

    component.customerCreated({ id: 'p1', displayName: 'Marta Gómez', documentType: 'CC', formattedDocument: '1',
      priceListId: null } as Party);
    expect(lines().map((l) => l.unitPrice)).toEqual([1500, 800]);
  });

  it('precio libre: sin precio no agrega nada', () => {
    component.addLine({ ...lookup('imp', 0), openPrice: true }, 1);
    expect(component.openPriceValue).toBeNull();
    component.confirmOpenPrice();
    expect(lines().length).toBe(0);
  });

  it('descartar una venta en espera la borra del equipo', () => {
    component.addLine(lookup('a'), 1);
    component.openHold();
    component.confirmHold();
    component.discardHeld(component.held()[0]);
    expect(component.held()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('registrar un cliente nuevo no borra la venta y lo deja como cliente', () => {
    component.addLine(lookup('a'), 1);
    component.openCustomers();
    component['customerText'] = 'Marta Gómez';
    component.openNewCustomer();
    expect(component.newCustomerOpen).toBeTrue();
    expect(component['customerOpen']).toBeFalse();
    expect(lines().length).toBe(1);

    component.customerCreated({ id: 'p1', displayName: 'Marta Gómez', documentType: 'CC', formattedDocument: '1.020.304',
      priceListId: null } as Party);

    expect(component['customer']().name).toBe('Marta Gómez');
    expect(lines().length).toBe(1);
    expect(sales.price).toHaveBeenCalledWith('a', 'u', 'p1');
  });
});
