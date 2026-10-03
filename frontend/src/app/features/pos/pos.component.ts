import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin } from 'rxjs';
import {
  CashSession,
  Party,
  PaymentMethod,
  PosConfig,
  Product,
  ProductLookup,
  Sale,
  SaleInput,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { PartiesApi } from '../../core/api/parties.api';
import { SalesApi, newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { ReceiptWidth, loadReceiptWidth, printReceipt, saveReceiptWidth } from '../../shared/receipt/receipt-prefs';
import {
  CartLine,
  PaymentDraft,
  PaymentSummary,
  cartTotals,
  cashSuggestions,
  lineAmounts,
  parseScan,
  summarizePayments,
} from './sale-math';

interface CustomerChoice {
  id: string;
  name: string;
  document: string;
  priceListId: string | null;
}

/**
 * Pantalla de venta. El lector de códigos actúa como teclado + Enter sobre el campo siempre enfocado.
 * Atajos: F2 buscar por nombre, F4 cobrar, Esc cancelar la venta.
 */
@Component({
  selector: 'app-pos',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, HasPermissionDirective,
    ReceiptComponent],
  template: `
    <div class="h-screen flex flex-col bg-slate-100">
      <header class="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <a routerLink="/app" class="text-slate-300 hover:text-white text-sm">← Menú</a>
        <span class="font-semibold">{{ config()?.businessName }}</span>
        @if (session(); as s) {
          <span class="text-sm text-slate-300">{{ s.registerCode }} · {{ s.branchName }} · {{ auth.user()?.fullName }}</span>
        }
        <span class="flex-1"></span>
        <a routerLink="/app/caja" class="text-sm text-slate-300 hover:text-white">Caja</a>
        <a *hasPermission="'sales:read'" routerLink="/app/ventas" class="text-sm text-slate-300 hover:text-white">Ventas</a>
      </header>

      @if (session() === null) {
        <div class="m-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
          <p class="font-medium">No tienes una caja abierta.</p>
          <p class="text-sm mb-3">Para vender, abre tu caja con la base de efectivo.</p>
          <a routerLink="/app/caja"><p-button label="Abrir caja" /></a>
        </div>
      }

      <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 min-h-0">
        <section class="md:col-span-2 flex flex-col min-h-0 bg-white rounded-xl shadow">
          <div class="p-3 border-b flex gap-2">
            <input #scanner pInputText class="flex-1 text-lg" [(ngModel)]="code" (keydown.enter)="scan()"
                   (blur)="keepFocus()" autocomplete="off"
                   placeholder="Escanea o escribe el código / SKU y Enter (3*código = 3 unidades)" />
            <p-button label="Buscar (F2)" severity="secondary" [outlined]="true" (onClick)="openSearch()"
                      [disabled]="!session()" />
          </div>
          <div class="flex-1 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-left sticky top-0">
                <tr>
                  <th class="p-2">Producto</th>
                  <th class="p-2 w-28 text-right">Cantidad</th>
                  <th class="p-2 text-right">Precio</th>
                  <th class="p-2 w-24 text-right">Desc. %</th>
                  <th class="p-2 text-right">Total</th>
                  <th class="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                @for (line of lines(); track line.key; let i = $index) {
                  <tr class="border-t">
                    <td class="p-2">
                      <span class="font-mono text-xs text-slate-500">{{ line.sku }}</span> {{ line.name }}
                      <span class="text-xs text-slate-500">({{ line.unitCode }})</span>
                    </td>
                    <td class="p-2">
                      <input type="number" min="0" step="any" class="w-24 border rounded px-2 py-1 text-right"
                             [ngModel]="line.quantity" (ngModelChange)="setQuantity(i, $event)" />
                    </td>
                    <td class="p-2 text-right whitespace-nowrap">{{ cop(line.unitPrice) }}</td>
                    <td class="p-2">
                      <input type="number" min="0" [max]="maxDiscount()" step="any"
                             class="w-20 border rounded px-2 py-1 text-right" [disabled]="maxDiscount() === 0"
                             [ngModel]="line.discountPercent" (ngModelChange)="setDiscount(i, $event)" />
                    </td>
                    <td class="p-2 text-right whitespace-nowrap font-medium">{{ cop(lineTotal(line)) }}</td>
                    <td class="p-2">
                      <p-button label="✕" [text]="true" severity="danger" size="small" (onClick)="remove(i)"
                                ariaLabel="Quitar" />
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="p-8 text-center text-slate-500">
                      Escanea un producto para empezar la venta.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <aside class="flex flex-col gap-3 min-h-0">
          <div class="bg-white rounded-xl shadow p-3">
            <p class="text-xs uppercase text-slate-500">Cliente</p>
            <p class="font-medium">{{ customer().name }}</p>
            <p class="text-sm text-slate-500">{{ customer().document }}</p>
            <p-button label="Cambiar cliente" [text]="true" size="small" (onClick)="openCustomers()"
                      [disabled]="!session()" />
          </div>
          <div class="bg-white rounded-xl shadow p-3 text-sm">
            <p class="flex justify-between"><span>Artículos</span><span>{{ q(totals().items) }}</span></p>
            @if (totals().discount > 0) {
              <p class="flex justify-between text-green-700"><span>Descuentos</span><span>-{{ cop(totals().discount) }}</span></p>
            }
            <p class="flex justify-between"><span>Base</span><span>{{ cop(totals().base) }}</span></p>
            <p class="flex justify-between"><span>Impuestos</span><span>{{ cop(totals().tax) }}</span></p>
            <p class="flex justify-between text-3xl font-semibold mt-2"><span>Total</span><span>{{ cop(totals().total) }}</span></p>
          </div>
          <p-button label="Cobrar (F4)" size="large" styleClass="w-full" (onClick)="openPayment()"
                    [disabled]="!session() || lines().length === 0" />
          <p-button label="Cancelar venta (Esc)" severity="secondary" [outlined]="true" styleClass="w-full"
                    (onClick)="cancelSale()" [disabled]="lines().length === 0" />
          @if (lastSale(); as last) {
            <p-button [label]="'Reimprimir ' + last.documentNumber" [text]="true" size="small"
                      (onClick)="receiptOpen = true" />
          }
        </aside>
      </div>
    </div>

    <!-- Buscar por nombre (F2) -->
    <p-dialog header="Buscar producto" [(visible)]="searchOpen" [modal]="true" [style]="{ width: '40rem' }"
              (onShow)="focus('search')" (onHide)="focusScanner()">
      <div class="flex gap-2 mb-3">
        <input #search pInputText class="flex-1" [(ngModel)]="searchText" (keydown.enter)="runSearch()"
               placeholder="Nombre, SKU o código" />
        <p-button label="Buscar" (onClick)="runSearch()" />
      </div>
      <ul class="max-h-96 overflow-auto divide-y">
        @for (p of searchResults(); track p.id) {
          <li>
            <button type="button" class="w-full text-left p-2 hover:bg-slate-50 flex justify-between gap-2"
                    (click)="pickProduct(p)">
              <span><span class="font-mono text-xs text-slate-500">{{ p.sku }}</span> {{ p.name }}</span>
              <span class="text-slate-600">{{ cop(p.salePrice) }}</span>
            </button>
          </li>
        } @empty {
          <li class="p-2 text-sm text-slate-500">Sin resultados.</li>
        }
      </ul>
    </p-dialog>

    <!-- Cliente -->
    <p-dialog header="Cliente de la venta" [(visible)]="customerOpen" [modal]="true" [style]="{ width: '36rem' }"
              (onShow)="focus('customerSearch')" (onHide)="focusScanner()">
      <div class="flex gap-2 mb-3">
        <input #customerSearch pInputText class="flex-1" [(ngModel)]="customerText"
               (keydown.enter)="runCustomerSearch()" placeholder="Nombre o número de documento" />
        <p-button label="Buscar" (onClick)="runCustomerSearch()" />
      </div>
      <ul class="max-h-80 overflow-auto divide-y">
        @for (c of customerResults(); track c.id) {
          <li>
            <button type="button" class="w-full text-left p-2 hover:bg-slate-50" (click)="pickCustomer(c)">
              <span class="font-medium">{{ c.displayName }}</span>
              <span class="text-sm text-slate-500"> · {{ c.documentType }} {{ c.formattedDocument }}</span>
              @if (c.priceListName) {
                <span class="text-xs text-blue-700"> · {{ c.priceListName }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="p-2 text-sm text-slate-500">Busca un cliente registrado.</li>
        }
      </ul>
      <div class="mt-3 flex justify-between">
        <p-button label="Consumidor final" [text]="true" (onClick)="resetCustomer()" />
        <a *hasPermission="'parties:manage'" routerLink="/app/clientes" class="text-sm text-blue-700 self-center">
          Registrar cliente nuevo
        </a>
      </div>
    </p-dialog>

    <!-- Cobro (F4) -->
    <p-dialog header="Cobrar" [(visible)]="payOpen" [modal]="true" [style]="{ width: '34rem' }"
              (onShow)="focusPayment()" (onHide)="focusScanner()">
      <p class="text-3xl font-semibold text-center mb-3">{{ cop(totals().total) }}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        @for (m of methods(); track m.id) {
          <p-button [label]="'+ ' + m.name" severity="secondary" [outlined]="true" size="small"
                    (onClick)="addPayment(m)" />
        }
      </div>
      @for (p of payments; track $index; let i = $index) {
        <div class="flex gap-2 items-center mb-2">
          <span class="w-28 text-sm font-medium">{{ methodName(p.methodId) }}</span>
          <input type="number" min="0" step="any" class="w-36 border rounded px-2 py-2 text-right"
                 [id]="'pay-' + i" [(ngModel)]="p.amount" (keydown.enter)="confirmPayment()" />
          @if (!p.affectsCash) {
            <input pInputText class="flex-1" [(ngModel)]="p.reference" maxlength="60" placeholder="Referencia (opcional)" />
          } @else {
            <span class="flex-1"></span>
          }
          <p-button label="✕" [text]="true" severity="danger" size="small" (onClick)="removePayment(i)"
                    ariaLabel="Quitar pago" />
        </div>
      }
      @if (cashIndex() >= 0) {
        <div class="flex flex-wrap gap-2 mb-3">
          @for (bill of suggestions(); track bill) {
            <p-button [label]="cop(bill)" size="small" [text]="true" (onClick)="setCash(bill)" />
          }
        </div>
      }
      @let sum = paymentSummary();
      <div class="text-sm border-t pt-2">
        <p class="flex justify-between"><span>Recibido</span><span>{{ cop(sum.paid) }}</span></p>
        @if (sum.missing > 0) {
          <p class="flex justify-between text-red-700 font-medium"><span>Falta</span><span>{{ cop(sum.missing) }}</span></p>
        }
        @if (sum.nonCashExceeds) {
          <p class="text-red-700">Tarjeta o transferencia no pueden superar el total: el cambio solo se da en efectivo.</p>
        }
        <p class="flex justify-between text-2xl font-semibold mt-1"><span>Cambio</span><span>{{ cop(sum.change) }}</span></p>
      </div>
      <ng-template #footer>
        <p-button label="Volver" [text]="true" severity="secondary" (onClick)="payOpen = false" />
        <p-button label="Registrar venta (Enter)" [disabled]="!paymentSummary().valid || saving()" [loading]="saving()"
                  (onClick)="confirmPayment()" />
      </ng-template>
    </p-dialog>

    <!-- Tiquete -->
    <p-dialog [header]="lastSale() ? 'Venta ' + lastSale()!.documentNumber : 'Tiquete'" [(visible)]="receiptOpen"
              [modal]="true" [style]="{ width: '28rem' }" (onHide)="focusScanner()">
      @if (lastSale(); as sale) {
        @if (sale.changeAmount > 0) {
          <p class="text-center text-2xl font-semibold mb-3">Cambio: {{ cop(sale.changeAmount) }}</p>
        }
        <div class="flex justify-center bg-slate-100 p-3 max-h-[60vh] overflow-auto">
          <app-receipt [sale]="sale" [width]="width()" />
        </div>
      }
      <ng-template #footer>
        <select class="border rounded px-2 py-2 text-sm mr-auto" [ngModel]="width()" (ngModelChange)="setWidth($event)">
          <option [ngValue]="80">80 mm</option>
          <option [ngValue]="58">58 mm</option>
        </select>
        <p-button label="Imprimir" severity="secondary" (onClick)="print()" />
        <p-button label="Nueva venta (Enter)" (onClick)="receiptOpen = false" />
      </ng-template>
    </p-dialog>

    @if (lastSale(); as sale) {
      <app-receipt class="receipt-print-root" [sale]="sale" [width]="width()" />
    }
  `,
})
export class PosComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly cash = inject(CashApi);
  private readonly sales = inject(SalesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly parties = inject(PartiesApi);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);

  private readonly scanner = viewChild<ElementRef<HTMLInputElement>>('scanner');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly customerSearch = viewChild<ElementRef<HTMLInputElement>>('customerSearch');

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;

  protected readonly config = signal<PosConfig | null>(null);
  /** {@code undefined} mientras carga; {@code null} sin caja abierta. */
  protected readonly session = signal<CashSession | null | undefined>(undefined);
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected readonly lines = signal<CartLine[]>([]);
  protected readonly customer = signal<CustomerChoice>({ id: '', name: 'Consumidor final', document: '222222222222', priceListId: null });
  protected readonly searchResults = signal<Product[]>([]);
  protected readonly customerResults = signal<Party[]>([]);
  protected readonly saving = signal(false);
  protected readonly lastSale = signal<Sale | null>(null);
  protected readonly width = signal<ReceiptWidth>(loadReceiptWidth());

  protected readonly totals = computed(() => cartTotals(this.lines(), this.config()?.pricesIncludeTax ?? true));
  /** Descuento máximo por línea: con sales:discount, 100 %; si no, el límite del negocio. */
  protected readonly maxDiscount = computed(() =>
    this.auth.hasPermission('sales:discount') ? 100 : Number(this.config()?.maxDiscountPercent ?? 0),
  );
  protected readonly suggestions = computed(() => cashSuggestions(this.totals().total));

  protected code = '';
  protected searchText = '';
  protected customerText = '';
  protected searchOpen = false;
  protected customerOpen = false;
  protected payOpen = false;
  protected receiptOpen = false;
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
        this.focusScanner();
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
    } else if (event.key === 'Escape' && !this.anyDialogOpen()) {
      // Si la tecla cerró un diálogo (su máscara sigue en la página), no se cancela la venta.
      this.cancelSale();
    } else if (event.key === 'Enter' && this.receiptOpen
      && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement)) {
      event.preventDefault();
      this.receiptOpen = false;
    }
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
        taxRate: Number(found.taxRate), trackInventory: found.trackInventory,
      }];
    });
    this.focusScanner();
  }

  setQuantity(index: number, value: number | string | null): void {
    if (value === null || value === '') {
      return; // el usuario está escribiendo
    }
    const quantity = Number(value);
    if (quantity === 0) {
      this.remove(index);
      return;
    }
    if (!(quantity > 0)) {
      return;
    }
    this.updateLines((list) => list.map((l, i) => (i === index ? { ...l, quantity } : l)));
  }

  setDiscount(index: number, value: number | string | null): void {
    const raw = Number(value ?? 0);
    const discount = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), this.maxDiscount());
    this.updateLines((list) => list.map((l, i) => (i === index ? { ...l, discountPercent: discount } : l)));
  }

  remove(index: number): void {
    this.updateLines((list) => list.filter((_, i) => i !== index));
    this.focusScanner();
  }

  lineTotal(line: CartLine): number {
    return lineAmounts(line.unitPrice, line.quantity, line.discountPercent, line.taxRate,
      this.config()?.pricesIncludeTax ?? true).total;
  }

  cancelSale(): void {
    if (this.lines().length === 0) {
      return;
    }
    this.confirmation.confirm({
      header: 'Cancelar venta',
      message: '¿Quitar todos los productos de esta venta?',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.resetSale(),
      reject: () => this.focusScanner(),
    });
  }

  // ---------------------------------------------------------------- búsqueda y cliente

  openSearch(): void {
    if (!this.session() || this.anyDialogOpen()) {
      return;
    }
    this.searchText = this.code.trim();
    this.code = '';
    this.searchResults.set([]);
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
    this.catalog.products({ page: 0, size: 20, search: text }).subscribe((page) =>
      this.searchResults.set(page.content.filter((p) => p.active)),
    );
  }

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
    const cash = this.methods().find((m) => m.affectsCash) ?? this.methods()[0];
    this.payments = cash ? [{ methodId: cash.id, affectsCash: cash.affectsCash, amount: this.totals().total, reference: '' }] : [];
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

  addPayment(method: PaymentMethod): void {
    const missing = this.paymentSummary().missing;
    this.payments = [...this.payments, {
      methodId: method.id, affectsCash: method.affectsCash, amount: missing > 0 ? missing : null, reference: '',
    }];
  }

  removePayment(index: number): void {
    this.payments = this.payments.filter((_, i) => i !== index);
  }

  cashIndex(): number {
    return this.payments.findIndex((p) => p.affectsCash);
  }

  /** Billete sugerido: lo que falta cubrir con efectivo después de los demás pagos. */
  setCash(bill: number): void {
    const index = this.cashIndex();
    if (index < 0) {
      return;
    }
    const others = this.payments.reduce((sum, p, i) => (i === index ? sum : sum + Number(p.amount ?? 0)), 0);
    this.payments[index].amount = Math.max(bill - others, 0) || bill;
  }

  methodName(id: string): string {
    return this.methods().find((m) => m.id === id)?.name ?? '';
  }

  paymentSummary(): PaymentSummary {
    return summarizePayments(this.totals().total, this.payments);
  }

  confirmPayment(): void {
    if (this.saving() || !this.paymentSummary().valid) {
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

  print(): void {
    printReceipt();
  }

  setWidth(value: ReceiptWidth | string): void {
    const width: ReceiptWidth = Number(value) === 58 ? 58 : 80;
    this.width.set(width);
    saveReceiptWidth(width);
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

  /** Incluye la confirmación de cancelar y los diálogos que se están cerrando (su máscara sigue en la página). */
  private anyDialogOpen(): boolean {
    return this.searchOpen || this.customerOpen || this.payOpen || this.receiptOpen
      || document.querySelector('.p-dialog-mask') !== null;
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
    this.resetCustomer();
    this.focusScanner();
  }
}
