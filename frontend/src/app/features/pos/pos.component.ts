import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { forkJoin, map, of } from 'rxjs';
import {
  CashSession,
  Party,
  PaymentMethod,
  PosConfig,
  Product,
  ProductLookup,
  Sale,
  SaleInput,
  StockRow,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { PartiesApi } from '../../core/api/parties.api';
import { SalesApi, newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { OnlineService } from '../../core/network/online.service';
import { ConfirmService } from '../../shared/confirm';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop } from '../../shared/money';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { ReceiptWidth, loadReceiptWidth, printReceipt, saveReceiptWidth } from '../../shared/receipt/receipt-prefs';
import { CartPanelComponent, LineDiscountChange, LineQuantityChange, RemovedLine } from './cart-panel.component';
import { loadFavorites, saveFavorites, toggleFavorite } from './favorites';
import { OpenCashComponent } from './open-cash.component';
import { POS_SHORTCUTS, methodIcon, methodLabel } from './pos-labels';
import { PosHeaderComponent } from './pos-header.component';
import { ProductGridComponent } from './product-grid.component';
import {
  CartLine,
  PaymentDraft,
  PaymentSummary,
  cartTotals,
  cashSuggestions,
  parseScan,
  paymentsMissingReference,
  stockShortages,
  summarizePayments,
} from './sale-math';

interface CustomerChoice {
  id: string;
  name: string;
  document: string;
  priceListId: string | null;
}

/** Páginas de existencias que se cargan como máximo (100 productos con inventario cada una). */
const STOCK_PAGES = 5;

/**
 * Pantalla de venta, pensada para tablet horizontal (1024×768) y también para escritorio con lector de códigos.
 * Izquierda: código/lector, categorías y cuadrícula de productos. Derecha: carrito, totales y Cobrar.
 * El lector actúa como teclado + Enter sobre el campo de código, que recupera el foco solo.
 * Atajos: F2 buscar por nombre, F4 cobrar, Enter registrar / nueva venta, Esc cancelar, ? ver atajos.
 */
@Component({
  selector: 'app-pos',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, SkeletonModule, HasPermissionDirective,
    ReceiptComponent, PosHeaderComponent, ProductGridComponent, CartPanelComponent, OpenCashComponent],
  template: `
    <div class="min-h-dvh md:h-dvh flex flex-col bg-ground">
      <app-pos-header [businessName]="config()?.businessName ?? ''" [session]="session()"
                      [userName]="auth.user()?.fullName ?? ''" [online]="online()" (help)="openHelp()" />

      @if (session() === undefined) {
        <div class="flex-1 flex items-center justify-center p-6" aria-busy="true">
          <p-skeleton width="20rem" height="12rem" borderRadius="0.75rem" />
        </div>
      } @else if (session() === null) {
        <app-open-cash class="flex-1 overflow-auto" (opened)="cashOpened($event)" />
      } @else {
        <div class="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3">
          <section class="h-[55dvh] md:h-auto md:flex-1 min-w-0 min-h-0 flex flex-col gap-2" aria-label="Productos">
            <div class="flex gap-2 shrink-0">
              <div class="relative flex-1 min-w-0">
                <i class="pi pi-barcode absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-muted" aria-hidden="true"></i>
                <input #scanner pInputText class="scanner-input w-full h-12" [(ngModel)]="code" (keydown.enter)="scan()"
                       (blur)="keepFocus()" autocomplete="off" aria-label="Código de barras o SKU"
                       [attr.inputmode]="keyboard() ? null : 'none'"
                       placeholder="Escanea o escribe el código / SKU y Enter (3*código = 3 unidades)" />
              </div>
              @if (coarsePointer) {
                <button type="button" class="tool-btn" [attr.aria-pressed]="keyboard()"
                        title="Mostrar el teclado en pantalla al tocar el campo de código" (click)="toggleKeyboard()">
                  <i class="pi pi-pencil" aria-hidden="true"></i><span class="hidden lg:inline">Teclado</span>
                </button>
              }
              <button type="button" class="tool-btn" (click)="openSearch()">
                <i class="pi pi-search" aria-hidden="true"></i><span class="hidden sm:inline">Buscar (F2)</span>
                <span class="sr-only sm:hidden">Buscar producto</span>
              </button>
            </div>
            <app-product-grid class="flex-1" [favoriteIds]="favorites()" [stock]="stock()"
                              (pick)="pickProduct($event)" (favoriteToggle)="toggleFavorite($event)" />
          </section>

          <app-cart-panel class="md:w-[22rem] lg:w-[26rem] shrink-0" [lines]="lines()" [totals]="totals()"
                          [pricesIncludeTax]="config()?.pricesIncludeTax ?? true" [shortages]="shortages()"
                          [maxDiscount]="maxDiscount()" [customerName]="customer().name"
                          [canCharge]="lines().length > 0" [lastSaleNumber]="lastSale()?.documentNumber ?? null"
                          (quantityChange)="setQuantity($event)" (discountChange)="setDiscount($event)"
                          (removeLine)="removeLine($event)" (restoreLine)="restoreLine($event)"
                          (charge)="openPayment()" (cancel)="cancelSale()" (customer)="openCustomers()"
                          (reprint)="receiptOpen = true" />
        </div>
      }
    </div>

    <!-- Buscar por nombre (F2) -->
    <p-dialog header="Buscar producto" [(visible)]="searchOpen" [modal]="true" [style]="{ width: '40rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focus('search')" (onHide)="focusScanner()">
      <form class="flex gap-2 mb-3" (ngSubmit)="runSearch()">
        <input #search pInputText name="search" class="flex-1 h-11" [(ngModel)]="searchText"
               aria-label="Nombre, SKU o código" placeholder="Nombre, SKU o código" />
        <p-button type="submit" label="Buscar" styleClass="min-h-11" />
      </form>
      <ul class="max-h-96 overflow-auto divide-y">
        @for (p of searchResults(); track p.id) {
          <li>
            <button type="button" class="w-full min-h-11 text-left p-2 hover:bg-surface-alt flex justify-between gap-2"
                    (click)="pickProduct(p)">
              <span><span class="font-mono text-xs text-muted">{{ p.sku }}</span> {{ p.name }}</span>
              <span class="text-muted whitespace-nowrap">{{ cop(p.salePrice) }}</span>
            </button>
          </li>
        } @empty {
          <li class="p-2 text-sm text-muted">{{ searched() ? 'Sin resultados.' : 'Escribe y pulsa Enter.' }}</li>
        }
      </ul>
    </p-dialog>

    <!-- Cliente -->
    <p-dialog header="Cliente de la venta" [(visible)]="customerOpen" [modal]="true" [style]="{ width: '36rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focus('customerSearch')" (onHide)="focusScanner()">
      <form class="flex gap-2 mb-3" (ngSubmit)="runCustomerSearch()">
        <input #customerSearch pInputText name="customerSearch" class="flex-1 h-11" [(ngModel)]="customerText"
               aria-label="Nombre o número de documento" placeholder="Nombre o número de documento" />
        <p-button type="submit" label="Buscar" styleClass="min-h-11" />
      </form>
      <ul class="max-h-80 overflow-auto divide-y">
        @for (c of customerResults(); track c.id) {
          <li>
            <button type="button" class="w-full min-h-11 text-left p-2 hover:bg-surface-alt" (click)="pickCustomer(c)">
              <span class="font-medium">{{ c.displayName }}</span>
              <span class="text-sm text-muted"> · {{ c.documentType }} {{ c.formattedDocument }}</span>
              @if (c.priceListName) {
                <span class="text-xs text-brand"> · {{ c.priceListName }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="p-2 text-sm text-muted">Busca un cliente registrado.</li>
        }
      </ul>
      <div class="mt-3 flex justify-between items-center">
        <p-button label="Consumidor final" [text]="true" styleClass="min-h-11" (onClick)="resetCustomer()" />
        <a *hasPermission="'parties:manage'" routerLink="/app/clientes" class="text-sm text-brand">
          Registrar cliente nuevo
        </a>
      </div>
    </p-dialog>

    <!-- Cobro (F4) -->
    <p-dialog header="Cobrar" [(visible)]="payOpen" [modal]="true" [style]="{ width: '40rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focusPayment()" (onHide)="focusScanner()">
      <p class="text-center text-sm text-muted">Total a cobrar</p>
      <p class="text-5xl font-bold text-center tabular-nums mb-4">{{ cop(totals().total) }}</p>

      <div class="flex items-center justify-between gap-2 mb-2">
        <p id="pay-methods" class="text-sm font-medium">{{ mixed ? 'Agregar otro medio' : 'Medio de pago' }}</p>
        @if (methods().length > 1) {
          <button type="button" class="tool-btn" [attr.aria-pressed]="mixed" (click)="setMixed(!mixed)">
            <i class="pi pi-clone" aria-hidden="true"></i>Pago mixto
          </button>
        }
      </div>
      <div class="grid grid-cols-3 gap-2 mb-4" role="group" aria-labelledby="pay-methods">
        @for (m of methods(); track m.id) {
          <button type="button" class="method-btn" [attr.aria-pressed]="mixed ? null : selectedMethod() === m.id"
                  (click)="chooseMethod(m)">
            <i [class]="methodIcon(m.code) + ' text-2xl'" aria-hidden="true"></i>
            <span>{{ mixed ? '+ ' : '' }}{{ methodLabel(m.code, m.name) }}</span>
          </button>
        }
      </div>

      @let missingRefs = missingReferences();
      @for (p of payments; track $index; let i = $index) {
        <div class="flex flex-wrap gap-2 items-center mb-2">
          <label [for]="'pay-' + i" class="w-32 text-sm font-medium flex items-center gap-2">
            <i [class]="methodIcon(methodCode(p.methodId))" aria-hidden="true"></i>{{ methodShortName(p.methodId) }}
          </label>
          <input type="number" inputmode="decimal" min="0" step="any"
                 class="h-12 w-40 border rounded-lg px-3 text-xl text-right tabular-nums"
                 [id]="'pay-' + i" [(ngModel)]="p.amount" (keydown.enter)="confirmPayment()" />
          @if (!p.affectsCash) {
            <input pInputText class="flex-1 min-w-32 h-12" [(ngModel)]="p.reference" maxlength="60"
                   [attr.aria-label]="'Referencia del pago con ' + methodShortName(p.methodId)"
                   [attr.aria-invalid]="missingRefs.includes(i)"
                   [placeholder]="requiresReference(p.methodId) ? 'Referencia (obligatoria)' : 'Referencia (opcional)'"
                   (keydown.enter)="confirmPayment()" />
          } @else {
            <span class="flex-1"></span>
          }
          @if (payments.length > 1) {
            <button type="button" class="icon-btn text-danger" [attr.aria-label]="'Quitar pago con ' + methodShortName(p.methodId)"
                    (click)="removePayment(i)">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          }
        </div>
      }

      @if (cashIndex() >= 0 && suggestions().length > 0) {
        <p class="text-sm text-muted mt-3 mb-1">Billetes recibidos</p>
        <div class="flex flex-wrap gap-2 mb-4">
          @for (bill of suggestions(); track bill) {
            <button type="button" class="bill-btn" (click)="setCash(bill)">{{ cop(bill) }}</button>
          }
        </div>
      }

      @let sum = paymentSummary();
      <div class="grid grid-cols-2 gap-2 mt-2" aria-live="polite">
        <div class="rounded-xl bg-surface-alt p-3">
          <p class="text-sm text-muted">Recibido</p>
          <p class="text-2xl font-semibold tabular-nums">{{ cop(sum.paid) }}</p>
        </div>
        @if (sum.missing > 0) {
          <div class="rounded-xl bg-danger-soft text-danger-soft-fg p-3 text-right">
            <p class="text-sm font-medium">Falta</p>
            <p class="text-3xl font-bold tabular-nums">{{ cop(sum.missing) }}</p>
          </div>
        } @else {
          <div class="rounded-xl bg-success-soft text-success-soft-fg p-3 text-right">
            <p class="text-sm font-medium">Cambio</p>
            <p class="text-4xl font-bold tabular-nums">{{ cop(sum.change) }}</p>
          </div>
        }
      </div>
      @if (sum.nonCashExceeds) {
        <p class="text-danger text-sm mt-2" role="alert">
          Tarjeta o transferencia no pueden superar el total: el cambio solo se da en efectivo.
        </p>
      }
      @if (missingRefs.length > 0) {
        <p class="text-danger text-sm mt-2" role="alert">Escribe la referencia del pago con {{ methodShortName(payments[missingRefs[0]].methodId) }}.</p>
      }
      @if (!online()) {
        <p class="mt-2 rounded-lg bg-warning-soft text-warning-soft-fg text-sm p-2" role="alert">
          Sin conexión: revisa la red. Si reintentas el mismo cobro no se registra dos veces.
        </p>
      }
      <ng-template #footer>
        <p-button label="Volver" [text]="true" severity="secondary" styleClass="min-h-11" (onClick)="payOpen = false" />
        <p-button label="Registrar venta (Enter)" icon="pi pi-check" size="large" styleClass="min-h-12"
                  [disabled]="!canConfirm()" [loading]="saving()" (onClick)="confirmPayment()" />
      </ng-template>
    </p-dialog>

    <!-- Venta registrada -->
    <p-dialog [header]="lastSale() ? 'Venta ' + lastSale()!.documentNumber : 'Tiquete'" [(visible)]="receiptOpen"
              [modal]="true" [style]="{ width: '30rem' }" [breakpoints]="{ '640px': '100vw' }"
              (onShow)="focusNewSale()" (onHide)="focusScanner()">
      @if (lastSale(); as sale) {
        <div class="flex flex-col items-center gap-2 text-center">
          <span class="size-16 rounded-full bg-success-soft text-success-soft-fg inline-flex items-center justify-center">
            <i class="pi pi-check text-3xl" aria-hidden="true"></i>
          </span>
          <p class="text-lg font-semibold" role="status">Venta registrada</p>
          <p class="text-muted">Total {{ cop(sale.total) }} · {{ sale.customerName }}</p>
          @if (sale.changeAmount > 0) {
            <p class="text-3xl font-bold rounded-xl bg-success-soft text-success-soft-fg px-4 py-2 tabular-nums">Cambio: {{ cop(sale.changeAmount) }}</p>
          }
        </div>
        <details class="mt-4">
          <summary class="min-h-11 flex items-center cursor-pointer text-sm text-brand">Ver tiquete</summary>
          <div class="flex justify-center bg-surface-alt p-3 max-h-[50vh] overflow-auto">
            <app-receipt [sale]="sale" [width]="width()" />
          </div>
        </details>
      }
      <ng-template #footer>
        <div class="w-full flex flex-wrap items-center gap-2">
          <select class="h-11 border rounded-lg px-2 text-sm" aria-label="Ancho del tiquete" [ngModel]="width()"
                  (ngModelChange)="setWidth($event)">
            <option [ngValue]="80">80 mm</option>
            <option [ngValue]="58">58 mm</option>
          </select>
          <p-button label="Imprimir tiquete" icon="pi pi-print" severity="secondary" [outlined]="true" styleClass="min-h-11"
                    (onClick)="print()" />
          <span class="flex-1"></span>
          <p-button id="new-sale" label="Nueva venta (Enter)" icon="pi pi-plus" styleClass="min-h-11"
                    (onClick)="receiptOpen = false" />
        </div>
      </ng-template>
    </p-dialog>

    <!-- Atajos (?) -->
    <p-dialog header="Atajos de teclado" [(visible)]="helpOpen" [modal]="true" [style]="{ width: '30rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onHide)="focusScanner()">
      <dl class="divide-y">
        @for (s of shortcuts; track s.keys) {
          <div class="py-2 flex items-start gap-3">
            <dt class="w-24 shrink-0"><kbd class="px-2 py-0.5 rounded border bg-surface-alt font-mono text-sm">{{ s.keys }}</kbd></dt>
            <dd class="text-sm">{{ s.action }}</dd>
          </div>
        }
      </dl>
      <p class="text-sm text-muted mt-3">En tablet, toca los productos de la lista; tocar una línea del carrito permite
        cambiar la cantidad o el descuento.</p>
    </p-dialog>

    @if (lastSale(); as sale) {
      <app-receipt class="receipt-print-root" [sale]="sale" [width]="width()" />
    }
  `,
  styles: `
    /* Los estilos de PrimeNG (sin capa) ganan a las utilidades de Tailwind: el espacio del icono va aquí. */
    .scanner-input {
      padding-left: 2.5rem;
      font-size: 1.125rem;
    }
    .tool-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 3rem;
      min-width: 3rem;
      padding: 0 0.875rem;
      border-radius: 0.5rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
    }
    .tool-btn[aria-pressed='true'],
    .method-btn[aria-pressed='true'] {
      border-color: var(--brand);
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .method-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 5rem;
      padding: 0.5rem;
      border-radius: 0.75rem;
      border: 2px solid var(--surface-border);
      background: var(--surface);
      font-weight: 600;
    }
    .bill-btn {
      min-height: 3rem;
      padding: 0 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--surface-border);
      background: var(--surface-alt);
      font-size: 1.125rem;
      font-weight: 600;
    }
    .icon-btn {
      width: 2.75rem;
      height: 2.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
    }
    .tool-btn:hover,
    .method-btn:hover,
    .bill-btn:hover {
      border-color: var(--brand);
    }
  `,
})
export class PosComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly cash = inject(CashApi);
  private readonly sales = inject(SalesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly parties = inject(PartiesApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmService);
  protected readonly online = inject(OnlineService).online;

  private readonly scanner = viewChild<ElementRef<HTMLInputElement>>('scanner');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly customerSearch = viewChild<ElementRef<HTMLInputElement>>('customerSearch');
  private readonly cart = viewChild(CartPanelComponent);

  protected readonly cop = formatCop;
  protected readonly methodIcon = methodIcon;
  protected readonly methodLabel = methodLabel;
  protected readonly shortcuts = POS_SHORTCUTS;
  /** Tablet o teléfono: el campo de código no abre el teclado en pantalla salvo que se pida (el lector no lo usa). */
  protected readonly coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  protected readonly keyboard = signal(!this.coarsePointer);

  protected readonly config = signal<PosConfig | null>(null);
  /** {@code undefined} mientras carga; {@code null} sin caja abierta. */
  protected readonly session = signal<CashSession | null | undefined>(undefined);
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected readonly lines = signal<CartLine[]>([]);
  protected readonly customer = signal<CustomerChoice>({ id: '', name: 'Consumidor final', document: '222222222222', priceListId: null });
  protected readonly searchResults = signal<Product[]>([]);
  protected readonly searched = signal(false);
  protected readonly customerResults = signal<Party[]>([]);
  protected readonly saving = signal(false);
  protected readonly lastSale = signal<Sale | null>(null);
  protected readonly width = signal<ReceiptWidth>(loadReceiptWidth());
  protected readonly favorites = signal<string[]>(loadFavorites(this.auth.tenantId()));
  /** Existencia por producto en la sucursal de la caja (solo con inventory:read). */
  protected readonly stock = signal<ReadonlyMap<string, number>>(new Map());

  protected readonly totals = computed(() => cartTotals(this.lines(), this.config()?.pricesIncludeTax ?? true));
  protected readonly shortages = computed(() => stockShortages(this.lines(), this.stock()));
  /** Descuento máximo por línea: con sales:discount, 100 %; si no, el límite del negocio. */
  protected readonly maxDiscount = computed(() =>
    this.auth.hasPermission('sales:discount') ? 100 : Number(this.config()?.maxDiscountPercent ?? 0),
  );
  protected readonly suggestions = computed(() => cashSuggestions(this.totals().total));
  private readonly methodsById = computed(() => new Map(this.methods().map((m) => [m.id, m])));

  protected code = '';
  protected searchText = '';
  protected customerText = '';
  protected searchOpen = false;
  protected customerOpen = false;
  protected payOpen = false;
  protected receiptOpen = false;
  protected helpOpen = false;
  /** Pago mixto: los botones de medio de pago agregan una fila en lugar de cambiar el medio. */
  protected mixed = false;
  protected payments: PaymentDraft[] = [];
  /** Se conserva entre reintentos del mismo cobro: un reenvío no crea otra venta. */
  private idempotencyKey: string | null = null;

  ngOnInit(): void {
    this.sales.config().subscribe((config) => {
      this.config.set(config);
      this.customer.update((c) => (c.id ? c : { ...c, id: config.finalConsumerId }));
    });
    this.cash.current().subscribe({
      next: (session) => {
        this.session.set(session);
        if (session) {
          this.loadStock(session.branchId);
          this.focusScanner();
        }
      },
      error: () => this.session.set(null),
    });
    this.cash.paymentMethods().subscribe((methods) => this.methods.set(methods));
  }

  @HostListener('window:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.openSearch();
    } else if (event.key === 'F4') {
      event.preventDefault();
      this.openPayment();
    } else if (event.key === 'Escape') {
      // Si la tecla cerró el editor de la línea o un diálogo (su máscara sigue en la página), no se cancela la venta.
      if (!this.cart()?.closeEditor() && !this.anyDialogOpen()) {
        this.cancelSale();
      }
    } else if (event.key === 'Enter' && this.receiptOpen && !isControl(event.target)) {
      event.preventDefault();
      this.receiptOpen = false;
    } else if (event.key === '?' && !this.anyDialogOpen() && this.canOpenHelpFrom(event.target)) {
      event.preventDefault();
      this.openHelp();
    }
  }

  // ---------------------------------------------------------------- caja y existencias

  cashOpened(session: CashSession): void {
    this.session.set(session);
    this.loadStock(session.branchId);
    this.focusScanner();
  }

  /**
   * Existencias de la sucursal para avisar en la cuadrícula y el carrito. El backend las da paginadas (máx. 100):
   * se cargan hasta {@link STOCK_PAGES} páginas. Sin inventory:read no se muestran.
   */
  private loadStock(branchId: string): void {
    if (!this.auth.hasPermission('inventory:read')) {
      return;
    }
    const query = (page: number) => ({ page, size: 100, sort: 'name,asc' });
    this.inventory.stock(branchId, query(0), null).subscribe((first) => {
      const pages = Math.min(first.totalPages, STOCK_PAGES);
      const rest = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
        this.inventory.stock(branchId, query(i + 1), null).pipe(map((p) => p.content)));
      (rest.length ? forkJoin(rest) : of([] as StockRow[][])).subscribe((more) => {
        const rows = [first.content, ...more].flat();
        this.stock.set(new Map(rows.map((r) => [r.productId, Number(r.quantity)])));
      });
    });
  }

  // ---------------------------------------------------------------- carrito

  scan(): void {
    const parsed = parseScan(this.code);
    if (!parsed || !this.session()) {
      return;
    }
    this.code = '';
    this.sales.lookup(parsed.code, this.customer().priceListId).subscribe({
      next: (found) => this.addLine(found, parsed.quantity),
      error: (error: unknown) => {
        const notFound = error instanceof HttpErrorResponse && error.status === 404;
        this.messages.add({
          severity: 'warn',
          summary: notFound ? 'Código no encontrado' : 'No se pudo agregar',
          detail: notFound ? `"${parsed.code}". Usa F2 para buscar por nombre.` : problemMessage(error),
        });
        this.focusScanner();
      },
    });
  }

  addLine(found: ProductLookup, quantity: number): void {
    const key = `${found.productId}|${found.unitId}`;
    this.updateLines((list) => {
      const existing = list.findIndex((l) => l.key === key);
      if (existing >= 0) {
        return list.map((l, i) => (i === existing ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...list, {
        key, productId: found.productId, sku: found.sku, name: found.name, unitId: found.unitId,
        unitCode: found.unitCode, quantity, unitPrice: Number(found.price), discountPercent: 0,
        taxRate: Number(found.taxRate), trackInventory: found.trackInventory, factor: Number(found.factor) || 1,
      }];
    });
    this.focusScanner();
  }

  setQuantity(change: LineQuantityChange): void {
    if (!(change.quantity > 0)) {
      return;
    }
    this.updateLines((list) => list.map((l) => (l.key === change.key ? { ...l, quantity: change.quantity } : l)));
    this.focusScanner();
  }

  setDiscount(change: LineDiscountChange): void {
    const discount = Math.min(Math.max(change.discountPercent, 0), this.maxDiscount());
    this.updateLines((list) => list.map((l) => (l.key === change.key ? { ...l, discountPercent: discount } : l)));
    this.focusScanner();
  }

  removeLine(key: string): void {
    this.updateLines((list) => list.filter((l) => l.key !== key));
    this.focusScanner();
  }

  /** "Deshacer": vuelve a poner la línea en su lugar (si mientras tanto se escaneó de nuevo, suma la cantidad). */
  restoreLine(removed: RemovedLine): void {
    this.updateLines((list) => {
      if (list.some((l) => l.key === removed.line.key)) {
        return list.map((l) => (l.key === removed.line.key ? { ...l, quantity: l.quantity + removed.line.quantity } : l));
      }
      const copy = [...list];
      copy.splice(Math.min(removed.index, copy.length), 0, removed.line);
      return copy;
    });
    this.focusScanner();
  }

  cancelSale(): void {
    if (this.lines().length === 0) {
      return;
    }
    this.confirm.ask({
      header: 'Cancelar venta',
      message: '¿Quitar todos los productos de esta venta?',
      acceptLabel: 'Cancelar venta',
      rejectLabel: 'Seguir vendiendo',
      danger: true,
      accept: () => this.resetSale(),
      reject: () => this.focusScanner(),
    });
  }

  toggleFavorite(product: Product): void {
    const next = toggleFavorite(this.favorites(), product.id);
    this.favorites.set(next);
    saveFavorites(this.auth.tenantId(), next);
  }

  toggleKeyboard(): void {
    this.keyboard.update((on) => !on);
    this.focusScanner();
  }

  // ---------------------------------------------------------------- búsqueda y cliente

  openSearch(): void {
    if (!this.session() || this.anyDialogOpen()) {
      return;
    }
    this.cart()?.closeEditor();
    this.searchText = this.code.trim();
    this.code = '';
    this.searchResults.set([]);
    this.searched.set(false);
    this.searchOpen = true;
    if (this.searchText) {
      this.runSearch();
    }
  }

  runSearch(): void {
    const text = this.searchText.trim();
    if (!text) {
      return;
    }
    this.catalog.products({ page: 0, size: 20, search: text }).subscribe((page) => {
      this.searchResults.set(page.content.filter((p) => p.active));
      this.searched.set(true);
    });
  }

  /** Desde la cuadrícula o la búsqueda: el precio lo calcula el servidor para el cliente de la venta. */
  pickProduct(product: Product): void {
    this.sales.price(product.id, null, this.customer().id || null).subscribe((price) => {
      this.searchOpen = false;
      this.addLine(price, 1);
    });
  }

  openCustomers(): void {
    this.customerText = '';
    this.customerResults.set([]);
    this.customerOpen = true;
  }

  runCustomerSearch(): void {
    this.parties.search('customers', { page: 0, size: 10 }, this.customerText.trim() || null, false)
      .subscribe((page) => this.customerResults.set(page.content));
  }

  pickCustomer(party: Party): void {
    this.setCustomer({
      id: party.id,
      name: party.displayName,
      document: `${party.documentType} ${party.formattedDocument}`,
      priceListId: party.priceListId,
    });
  }

  resetCustomer(): void {
    this.setCustomer({ id: this.config()?.finalConsumerId ?? '', name: 'Consumidor final', document: '222222222222', priceListId: null });
  }

  /** Cambia el cliente y vuelve a pedir el precio de cada línea (puede tener otra lista de precios). */
  private setCustomer(choice: CustomerChoice): void {
    this.customerOpen = false;
    this.customer.set(choice);
    this.refreshPrices(choice.id || null);
  }

  /** Vuelve a pedir el precio vigente de cada línea para el cliente. */
  private refreshPrices(customerId: string | null): void {
    const current = this.lines();
    if (current.length === 0) {
      return;
    }
    forkJoin(current.map((l) => this.sales.price(l.productId, l.unitId, customerId))).subscribe((prices) => {
      this.updateLines((list) => list.map((l) => {
        const price = prices.find((p) => p.productId === l.productId && p.unitId === l.unitId);
        return price ? { ...l, unitPrice: Number(price.price), taxRate: Number(price.taxRate) } : l;
      }));
    });
  }

  // ---------------------------------------------------------------- cobro

  openPayment(): void {
    if (!this.session() || this.lines().length === 0 || this.anyDialogOpen()) {
      return;
    }
    this.cart()?.closeEditor();
    const cash = this.methods().find((m) => m.affectsCash) ?? this.methods()[0];
    this.mixed = false;
    this.payments = cash ? [this.draft(cash, this.totals().total)] : [];
    this.idempotencyKey ??= newIdempotencyKey('sale');
    this.payOpen = true;
  }

  focusPayment(): void {
    setTimeout(() => {
      const input = document.getElementById('pay-0') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  /** Sin pago mixto, cambia el medio del único pago (por el total); con pago mixto, agrega uno por lo que falta. */
  chooseMethod(method: PaymentMethod): void {
    if (this.mixed) {
      this.addPayment(method);
      return;
    }
    this.payments = [this.draft(method, this.totals().total)];
    this.focusPayment();
  }

  setMixed(on: boolean): void {
    this.mixed = on;
    if (!on && this.payments.length > 0) {
      this.payments = [{ ...this.payments[0], amount: this.totals().total }];
    }
  }

  selectedMethod(): string | null {
    return this.payments.length === 1 ? this.payments[0].methodId : null;
  }

  addPayment(method: PaymentMethod): void {
    const missing = this.paymentSummary().missing;
    this.payments = [...this.payments, this.draft(method, missing > 0 ? missing : null)];
    const index = this.payments.length - 1;
    setTimeout(() => document.getElementById(`pay-${index}`)?.focus(), 0);
  }

  removePayment(index: number): void {
    this.payments = this.payments.filter((_, i) => i !== index);
    if (this.payments.length <= 1) {
      this.mixed = false;
    }
  }

  cashIndex(): number {
    return this.payments.findIndex((p) => p.affectsCash);
  }

  /** Billete recibido: lo que cubre el efectivo después de los demás pagos. */
  setCash(bill: number): void {
    const index = this.cashIndex();
    if (index < 0) {
      return;
    }
    const others = this.payments.reduce((sum, p, i) => (i === index ? sum : sum + Number(p.amount ?? 0)), 0);
    this.payments[index].amount = Math.max(bill - others, 0) || bill;
  }

  methodCode(id: string): string {
    return this.methodsById().get(id)?.code ?? '';
  }

  methodShortName(id: string): string {
    const method = this.methodsById().get(id);
    return method ? methodLabel(method.code, method.name) : '';
  }

  requiresReference(id: string): boolean {
    return this.methodsById().get(id)?.requiresReference ?? false;
  }

  missingReferences(): number[] {
    return paymentsMissingReference(this.payments, (id) => this.requiresReference(id));
  }

  paymentSummary(): PaymentSummary {
    return summarizePayments(this.totals().total, this.payments);
  }

  canConfirm(): boolean {
    return this.paymentSummary().valid && this.missingReferences().length === 0 && !this.saving();
  }

  confirmPayment(): void {
    if (!this.canConfirm()) {
      return;
    }
    const input: SaleInput = {
      customerId: this.customer().id && this.customer().id !== this.config()?.finalConsumerId ? this.customer().id : null,
      items: this.lines().map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        quantity: l.quantity,
        discountPercent: l.discountPercent > 0 ? l.discountPercent : null,
        unitPrice: l.unitPrice,
      })),
      payments: this.payments.map((p) => ({
        paymentMethodId: p.methodId,
        amount: Number(p.amount),
        reference: p.reference.trim() || null,
      })),
      expectedTotal: this.totals().total,
      notes: null,
    };
    this.idempotencyKey ??= newIdempotencyKey('sale');
    this.saving.set(true);
    this.sales.create(input, this.idempotencyKey).subscribe({
      next: (sale) => {
        this.saving.set(false);
        this.payOpen = false;
        this.lastSale.set(sale);
        this.resetSale();
        this.receiptOpen = true;
        const session = this.session();
        if (session) {
          this.loadStock(session.branchId);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          // Precios o impuestos cambiaron: se recargan los ajustes y el precio de cada línea.
          this.payOpen = false;
          this.sales.config().subscribe((config) => this.config.set(config));
          this.refreshPrices(this.customer().id || null);
        }
        // Un error de red conserva la clave: reintentar no duplica la venta.
      },
    });
  }

  focusNewSale(): void {
    setTimeout(() => document.querySelector<HTMLButtonElement>('#new-sale button, button#new-sale')?.focus(), 0);
  }

  print(): void {
    printReceipt();
  }

  setWidth(value: ReceiptWidth | string): void {
    const width: ReceiptWidth = Number(value) === 58 ? 58 : 80;
    this.width.set(width);
    saveReceiptWidth(width);
  }

  openHelp(): void {
    this.cart()?.closeEditor();
    this.helpOpen = true;
  }

  // ---------------------------------------------------------------- foco y estado

  keepFocus(): void {
    setTimeout(() => {
      const active = document.activeElement;
      if (!this.anyDialogOpen() && (!active || active === document.body)) {
        this.focusScanner();
      }
    }, 150);
  }

  focusScanner(): void {
    setTimeout(() => this.scanner()?.nativeElement.focus(), 0);
  }

  focus(which: 'search' | 'customerSearch'): void {
    setTimeout(() => (which === 'search' ? this.search() : this.customerSearch())?.nativeElement.focus(), 0);
  }

  /** "?" abre la ayuda fuera de los campos, o desde el campo de código cuando está vacío. */
  private canOpenHelpFrom(target: EventTarget | null): boolean {
    if (target === this.scanner()?.nativeElement) {
      return this.code.trim() === '';
    }
    return !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement);
  }

  /** Incluye la confirmación de cancelar y los diálogos que se están cerrando (su máscara sigue en la página). */
  private anyDialogOpen(): boolean {
    return this.searchOpen || this.customerOpen || this.payOpen || this.receiptOpen || this.helpOpen
      || document.querySelector('.p-dialog-mask') !== null;
  }

  private draft(method: PaymentMethod, amount: number | null): PaymentDraft {
    return { methodId: method.id, affectsCash: method.affectsCash, amount, reference: '' };
  }

  /** Todo cambio del carrito invalida la clave de idempotencia del cobro anterior. */
  private updateLines(change: (list: CartLine[]) => CartLine[]): void {
    this.lines.update(change);
    this.idempotencyKey = null;
  }

  private resetSale(): void {
    this.lines.set([]);
    this.idempotencyKey = null;
    this.payments = [];
    this.mixed = false;
    this.cart()?.clearUndo();
    this.resetCustomer();
    this.focusScanner();
  }
}

/** Botones, selects y el resumen de un details manejan Enter por su cuenta. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.tagName === 'SUMMARY');
}
