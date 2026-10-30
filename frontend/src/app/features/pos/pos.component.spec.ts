import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { CashSession, CreditAccount, PageResponse, Party, PaymentMethod, PosConfig, ProductLookup } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { CreditApi } from '../../core/api/credit.api';
import { DiningApi } from '../../core/api/dining.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { ModifiersApi, PosModifierCatalog } from '../../core/api/modifiers.api';
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

/** Adiciones del granizado "g" (Fase 12b-1): tamaño obligatorio. */
const modifierCatalog: PosModifierCatalog = {
  groups: [{ id: 'size', name: 'Tamaño', minSelect: 1, maxSelect: 1,
    options: [{ id: 'm', name: 'Mediano', priceDelta: 0, maxQuantity: 1 }, { id: 'l', name: 'Grande', priceDelta: 4000, maxQuantity: 1 }] }],
  products: { g: ['size'] },
};

const page = <T>(content: T[]): PageResponse<T> => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });

describe('PosComponent: celular, pausar venta y cliente nuevo', () => {
  const KEY = heldKey('t1', 'u1');
  let fixture: ComponentFixture<PosComponent>;
  let component: PosComponent;
  let sales: jasmine.SpyObj<SalesApi>;
  let credit: jasmine.SpyObj<CreditApi>;

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
    credit = jasmine.createSpyObj<CreditApi>('CreditApi', ['account']);
    // Por defecto los clientes no tienen fiado (sin cuenta = sin "Fiado" al cobrar).
    credit.account.and.returnValue(throwError(() => new Error('sin cuenta')));
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
        { provide: CreditApi, useValue: credit },
        { provide: ModifiersApi, useValue: { pos: () => of(modifierCatalog) } },
        { provide: DiningApi, useValue: jasmine.createSpyObj<DiningApi>('DiningApi', ['tab', 'charge']) },
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
    component['modifierOpen'] = false;
    component['searchOpen'] = false;
    component['customerOpen'] = false;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const lines = () => component['lines']();

  it('un producto con adiciones las pide antes de entrar al carrito y cada combinación va en su línea (Fase 12b-1)', () => {
    component.addLine(lookup('g', 12000), 1);
    expect(component['modifierOpen']).toBeTrue();
    expect(lines().length).toBe(0);
    const large = { optionId: 'l', groupName: 'Tamaño', name: 'Grande', quantity: 1, price: 4000 };
    component.modifiersPicked({ modifiers: [large], note: 'sin azúcar' });
    component.addLine(lookup('g', 12000), 1);
    component.modifiersPicked({ modifiers: [large], note: 'sin azúcar' });
    component.addLine(lookup('g', 12000), 1);
    component.modifiersPicked({ modifiers: [{ ...large, optionId: 'm', name: 'Mediano', price: 0 }], note: '' });

    expect(lines().map((l) => [l.quantity, l.modifiers?.[0].name, l.note ?? null])).toEqual([
      [2, 'Grande', 'sin azúcar'],
      [1, 'Mediano', null],
    ]);
    expect(component['totals']().total).toBe(44000);
  });

  it('la nota de una línea sin adiciones la separa o la une con otra igual', () => {
    component.addLine(lookup('a'), 1);
    component.addLine(lookup('b'), 1);
    const [a] = lines();
    component.setNote({ key: a.key, note: 'sin cebolla' });
    expect(lines()[0].note).toBe('sin cebolla');
    component.addLine(lookup('a'), 2);
    expect(lines().filter((l) => l.productId === 'a').length).toBe(2);
    const plain = lines().find((l) => l.productId === 'a' && !l.note)!;
    component.setNote({ key: plain.key, note: 'Sin cebolla' });
    expect(lines().filter((l) => l.productId === 'a').map((l) => l.quantity)).toEqual([3]);
  });

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

    // El servidor sigue diciendo que es de precio libre: se conserva lo que escribió el cajero.
    sales.price.and.callFake((productId: string) => of({ ...lookup(productId, 3000), openPrice: true }));
    component.customerCreated({ id: 'p1', displayName: 'Marta Gómez', documentType: 'CC', formattedDocument: '1',
      priceListId: null } as Party);
    expect(lines().map((l) => l.unitPrice)).toEqual([1500, 800]);
  });

  it('precio libre: si el producto dejó de serlo, al refrescar toma el precio de la lista', () => {
    component.addLine({ ...lookup('imp', 1000), openPrice: true }, 1);
    component.openPriceValue = 1500;
    component.confirmOpenPrice();
    component.customerCreated({ id: 'p1', displayName: 'Marta Gómez', documentType: 'CC', formattedDocument: '1',
      priceListId: null } as Party);
    expect(lines().map((l) => [l.unitPrice, l.openPrice])).toEqual([[3000, undefined]]);
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

  describe('fiado (decisión 255)', () => {
    const methods: PaymentMethod[] = [
      { id: 'cash', code: 'CASH', name: 'Efectivo', affectsCash: true, requiresReference: false },
      { id: 'fiado', code: 'CREDIT', name: 'Fiado', affectsCash: false, requiresReference: false },
    ];
    const account = (overrides: Partial<CreditAccount> = {}): CreditAccount => ({
      customerId: 'p1', name: 'Marta Gómez', documentType: 'CC', formattedDocument: '1', phone: null, active: true,
      creditLimit: 50000, balance: 40000, available: 10000, oldestDebtAt: null, upTo30Days: 40000, from31To60Days: 0,
      over60Days: 0, lastPaymentAt: null, lastPaymentAmount: null, ...overrides,
    });
    const marta = { id: 'p1', displayName: 'Marta Gómez', documentType: 'CC', formattedDocument: '1', priceListId: null } as Party;
    const payMethods = () => component['payMethods']().map((m) => m.code);

    beforeEach(() => component['methods'].set(methods));

    it('"Fiado" solo aparece con un cliente que tiene cupo', () => {
      expect(payMethods()).toEqual(['CASH']);
      credit.account.and.returnValue(of(account({ creditLimit: 0, available: 0, balance: 0 })));
      component.pickCustomer(marta);
      expect(credit.account).toHaveBeenCalledWith('p1');
      expect(payMethods()).toEqual(['CASH']);

      credit.account.and.returnValue(of(account()));
      component.pickCustomer(marta);
      expect(payMethods()).toEqual(['CASH', 'CREDIT']);

      component.resetCustomer();
      expect(payMethods()).toEqual(['CASH']);
    });

    it('sin credit:manage no deja fiar más de lo disponible', () => {
      const auth = TestBed.inject(AuthService) as unknown as { hasPermission: (p: string) => boolean };
      auth.hasPermission = (p) => p !== 'credit:manage';
      credit.account.and.returnValue(of(account()));
      component.pickCustomer(marta);
      component.addLine(lookup('a', 3000), 5);
      component.openPayment();
      component.chooseMethod(methods[1]);
      expect(component.creditProblem()).toContain('Pasa el cupo de Marta Gómez');
      expect(component.canConfirm()).toBeFalse();

      component.setMixed(true);
      component['payments'] = [
        { methodId: 'cash', affectsCash: true, amount: 5000, reference: '' },
        { methodId: 'fiado', affectsCash: false, amount: 10000, reference: '' },
      ];
      expect(component.creditProblem()).toBeNull();
      expect(component.canConfirm()).toBeTrue();
      component['payOpen'] = false;
    });
  });
});
