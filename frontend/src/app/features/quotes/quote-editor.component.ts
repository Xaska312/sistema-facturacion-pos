import { Component, HostListener, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Party, Product, Quote, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { PartiesApi } from '../../core/api/parties.api';
import { QuotesApi } from '../../core/api/quotes.api';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { documentShortLabel } from '../../shared/document-types';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop, formatPercent, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';
import { NewCustomerDialogComponent } from '../pos/new-customer-dialog.component';
import { quantity4 } from '../pos/sale-math';
import { draftQuantity, isoDay, side } from '../orders/order-text';
import { QuoteDraft, addDays, discountOf, quoteDraftProblem, quoteDraftTotal } from './quote-text';

interface CustomerChoice {
  id: string;
  name: string;
  document: string;
  phone: string | null;
}

/**
 * Nueva cotización, edición de una abierta (también vencida: así se renueva) o copia de otra ({@code ?desde=id})
 * (decisión 260). Para un cliente registrado o un prospecto (nombre y teléfono); líneas por cantidad o por medidas,
 * con descuento; vigencia y condiciones por defecto de Ajustes.
 */
@Component({
  selector: 'app-quote-editor',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, PesosInputDirective,
    HasPermissionDirective, NewCustomerDialogComponent],
  template: `
    <app-page-header [title]="title()"
                     description="Los precios que le ofreces al cliente y hasta cuándo valen. No mueve inventario ni dinero." />

    <section class="card p-4 grid gap-4 md:grid-cols-2 max-w-5xl">
      <fieldset class="flex flex-col gap-2 md:col-span-2">
        <legend class="text-sm font-medium mb-1">Para quién</legend>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer" [class.border-brand]="!prospect">
            <input type="radio" name="party-mode" [value]="false" [(ngModel)]="prospect" /> Cliente registrado
          </label>
          <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer" [class.border-brand]="prospect">
            <input type="radio" name="party-mode" [value]="true" [(ngModel)]="prospect" /> Aún no es cliente
          </label>
        </div>
        @if (prospect) {
          <div class="grid gap-3 md:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium">Nombre</span>
              <input pInputText maxlength="160" [(ngModel)]="prospectName" placeholder="Nombre de la persona o empresa" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium">Teléfono <span class="text-muted font-normal">(opcional, para WhatsApp)</span></span>
              <input pInputText type="tel" maxlength="30" [(ngModel)]="prospectPhone" placeholder="300 123 4567" />
            </label>
          </div>
          <small class="text-xs text-muted">Si acepta, lo registras como cliente al convertir la cotización en pedido.</small>
        } @else if (customer()) {
          @let c = customer()!;
          <div class="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2">
            <span class="pi pi-user text-muted" aria-hidden="true"></span>
            <span class="font-medium">{{ c.name }}</span>
            <span class="text-sm text-muted">{{ c.document }}{{ c.phone ? ' · ' + c.phone : '' }}</span>
            <p-button label="Cambiar" size="small" [text]="true" (onClick)="customer.set(null)" />
          </div>
        } @else {
          <form class="flex gap-2" (ngSubmit)="searchCustomers()">
            <input pInputText name="customerSearch" class="flex-1" [(ngModel)]="customerText"
                   aria-label="Buscar cliente" placeholder="Nombre, documento o teléfono del cliente" />
            <p-button type="submit" label="Buscar" [loading]="searchingCustomers()" />
            <p-button *hasPermission="'parties:manage'" label="Nuevo" icon="pi pi-user-plus" [outlined]="true"
                      (onClick)="openNewCustomer()" />
          </form>
          @if (customerResults().length > 0) {
            <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
              @for (c of customerResults(); track c.id) {
                <li>
                  <button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt" (click)="pickCustomer(c)">
                    <span class="font-medium">{{ c.displayName }}</span>
                    <span class="text-muted"> · {{ docShort(c.documentType) }} {{ c.formattedDocument }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else if (customerSearched()) {
            <small class="text-xs text-muted">No hay clientes con ese dato. Regístralo con "Nuevo" o marca "Aún no es cliente".</small>
          }
        }
      </fieldset>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Válida hasta</span>
        <input type="date" class="border rounded-lg px-3 py-2" [min]="today" [(ngModel)]="validUntil" />
        @if (validityDays() !== null) {
          <small class="text-xs text-muted">Por defecto, {{ validityDays() }} días (se cambia en Ajustes).</small>
        }
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Notas <span class="text-muted font-normal">(opcional)</span></span>
        <input pInputText maxlength="1000" [(ngModel)]="notes" placeholder="Obra, referencia, color, acabado…" />
      </label>
      <label class="flex flex-col gap-1 md:col-span-2">
        <span class="text-sm font-medium">Condiciones <span class="text-muted font-normal">(salen en el PDF)</span></span>
        <textarea pInputText rows="2" maxlength="1000" [(ngModel)]="terms"
                  placeholder="Anticipo, tiempo de entrega, garantía, formas de pago…"></textarea>
      </label>
    </section>

    <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
      <h2 class="font-semibold">Qué cotizas</h2>
      <form class="flex flex-wrap gap-2" (ngSubmit)="searchProducts()">
        <input pInputText name="productSearch" class="flex-1 min-w-64" [(ngModel)]="productText"
               aria-label="Buscar producto o servicio" placeholder="Busca el producto o servicio (nombre o SKU) y presiona Enter" />
        <p-button type="submit" label="Buscar" [loading]="searchingProducts()" />
      </form>
      @if (productResults().length > 0) {
        <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
          @for (p of productResults(); track p.id) {
            <li>
              <button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt" (click)="addProduct(p)">
                <span class="font-mono">{{ p.sku }}</span> {{ p.name }}
                <span class="text-muted"> · {{ p.baseUnitCode }} · {{ cop(p.salePrice) }}</span>
              </button>
            </li>
          }
        </ul>
      }

      @for (item of items(); track item.key; let i = $index) {
        <div class="border rounded-lg p-3 grid gap-3 md:grid-cols-12 items-end">
          <div class="md:col-span-12 flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium"><span class="font-mono text-sm text-muted">{{ item.sku }}</span> {{ item.productName }}</span>
            <p-button label="Quitar" size="small" [text]="true" severity="danger" (onClick)="remove(i)" />
          </div>
          <label class="flex flex-col gap-1 md:col-span-12">
            <span class="text-xs font-medium">Descripción <span class="text-muted font-normal">(opcional)</span></span>
            <input pInputText maxlength="200" [(ngModel)]="item.description" placeholder="Mesón cocina, resma para el colegio…" />
          </label>
          <fieldset class="md:col-span-3 flex flex-col gap-1">
            <legend class="text-xs font-medium mb-1">Cobrar</legend>
            <div class="flex flex-wrap gap-2">
              <label class="flex items-center gap-2 min-h-10 px-3 border rounded-lg cursor-pointer" [class.border-brand]="!item.bySize">
                <input type="radio" [name]="'mode-' + item.key" [value]="false" [(ngModel)]="item.bySize" /> Cantidad
              </label>
              <label class="flex items-center gap-2 min-h-10 px-3 border rounded-lg" [class.border-brand]="item.bySize"
                     [class.cursor-pointer]="item.allowsDecimals" [class.opacity-50]="!item.allowsDecimals">
                <input type="radio" [name]="'mode-' + item.key" [value]="true" [(ngModel)]="item.bySize"
                       [disabled]="!item.allowsDecimals" /> Medidas
              </label>
            </div>
          </fieldset>
          @if (item.bySize) {
            <label class="flex flex-col gap-1 md:col-span-2">
              <span class="text-xs font-medium">Ancho (m)</span>
              <input pInputText type="number" min="0" max="100" step="0.001" [(ngModel)]="item.width" />
            </label>
            <label class="flex flex-col gap-1 md:col-span-2">
              <span class="text-xs font-medium">Largo (m)</span>
              <input pInputText type="number" min="0" max="100" step="0.001" [(ngModel)]="item.length" />
            </label>
          } @else {
            <label class="flex flex-col gap-1 md:col-span-4">
              <span class="text-xs font-medium">Cantidad ({{ item.unitCode }})</span>
              <input pInputText type="number" min="0" [step]="item.allowsDecimals ? 'any' : 1" [(ngModel)]="item.quantity" />
            </label>
          }
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-xs font-medium">Precio por {{ item.unitCode }}</span>
            <input pInputText appPesos [(ngModel)]="item.unitPrice" />
          </label>
          <label class="flex flex-col gap-1 md:col-span-1">
            <span class="text-xs font-medium">Desc. %</span>
            <input pInputText type="number" min="0" max="99.99" step="0.5" [(ngModel)]="item.discountPercent"
                   [attr.aria-label]="'Descuento de ' + item.productName + ' en porcentaje'" />
          </label>
          <div class="md:col-span-2 text-right">
            <span class="block text-xs text-muted">{{ quantityText(item) }}</span>
            <span class="font-semibold tabular-nums">{{ cop(lineTotal(item)) }}</span>
          </div>
          @if (!item.allowsDecimals) {
            <small class="md:col-span-12 text-xs text-muted">
              Para cotizar por medidas (ancho × largo) usa un producto cuya unidad sea M2.
            </small>
          }
        </div>
      } @empty {
        <p class="p-6 text-center text-muted text-sm">
          Busca y agrega lo que vas a cotizar. Puedes dar un descuento en cada línea.
        </p>
      }
    </section>

    <div class="flex flex-wrap justify-end gap-3 mt-4 max-w-5xl items-center">
      <span class="text-sm">Total <strong class="tabular-nums text-lg">{{ cop(total()) }}</strong></span>
      @if (problem(); as message) {
        <span class="text-sm text-warning basis-full text-right">{{ message }}</span>
      }
      <a pButton [routerLink]="id() ? ['/app/cotizaciones', id()] : '/app/cotizaciones'" label="Cancelar" [text]="true"
         severity="secondary"></a>
      <p-button [label]="id() ? 'Guardar cambios' : 'Crear cotización'" icon="pi pi-check" [loading]="saving() || loading()"
                [disabled]="problem() !== null || loading()" (onClick)="save()" />
    </div>

    <app-new-customer-dialog [(visible)]="newCustomerOpen" (created)="customerCreated($event)" />
  `,
})
export class QuoteEditorComponent implements OnInit, HasUnsavedChanges {
  /** Parámetro de ruta :id (solo al editar). */
  readonly id = input<string>();
  /** ?desde=id: nueva cotización copiada de otra (por ejemplo, de una vencida o rechazada). */
  readonly desde = input<string>();

  private readonly api = inject(QuotesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly parties = inject(PartiesApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly newCustomer = viewChild(NewCustomerDialogComponent);

  protected readonly original = signal<Quote | null>(null);
  protected readonly customer = signal<CustomerChoice | null>(null);
  protected readonly customerResults = signal<Party[]>([]);
  protected readonly customerSearched = signal(false);
  protected readonly searchingCustomers = signal(false);
  protected readonly productResults = signal<Product[]>([]);
  protected readonly searchingProducts = signal(false);
  protected readonly items = signal<QuoteDraft[]>([]);
  protected readonly saving = signal(false);
  protected readonly validityDays = signal<number | null>(null);
  /** Hasta traer la configuración (y la cotización al editar o copiar) no se puede guardar. */
  protected readonly loading = signal(true);
  protected prospect = false;
  protected prospectName = '';
  protected prospectPhone = '';
  protected customerText = '';
  protected productText = '';
  protected validUntil = '';
  protected notes = '';
  protected terms = '';
  protected newCustomerOpen = false;
  protected readonly today = isoDay(new Date());
  private pricesIncludeTax = true;
  private maxDiscountPercent = 100;
  private units = new Map<string, Unit>();
  private nextKey = 1;
  private saved = false;
  /** La fecha guardada: al editar una vencida se puede dejar como está (el servidor la acepta). */
  private savedValidUntil: string | null = null;
  private snapshot = '';

  protected readonly cop = formatCop;
  protected readonly docShort = documentShortLabel;

  ngOnInit(): void {
    this.snapshot = this.fingerprint();
    forkJoin({
      config: this.api.config(),
      units: this.catalog.units().pipe(catchError(() => of([] as Unit[]))),
    }).subscribe({
      next: ({ config, units }) => {
        this.units = new Map(units.map((u) => [u.id, u]));
        this.pricesIncludeTax = config.pricesIncludeTax;
        this.maxDiscountPercent = config.maxDiscountPercent;
        this.validityDays.set(config.validityDays);
        this.validUntil = addDays(this.today, config.validityDays);
        this.terms = config.terms ?? '';
        const source = this.id() ?? this.desde();
        if (!source) {
          this.loading.set(false);
          this.snapshot = this.fingerprint();
          return;
        }
        this.api.get(source).subscribe({
          next: (quote) => this.loadQuote(quote, !!this.id()),
          error: () => void this.router.navigate(['/app/cotizaciones']),
        });
      },
      error: () => void this.router.navigate(['/app/cotizaciones']),
    });
  }

  protected title(): string {
    if (this.id()) {
      return 'Editar cotización ' + (this.original()?.number ?? '');
    }
    return this.desde() ? 'Nueva cotización (copia)' : 'Nueva cotización';
  }

  /** {@code editing}: se edita esa misma; si no, se copia en una nueva con la vigencia por defecto. */
  private loadQuote(quote: Quote, editing: boolean): void {
    if (editing && quote.status !== 'OPEN') {
      this.loading.set(false);
      this.messages.add({ severity: 'warn', summary: 'No se puede editar',
        detail: 'La cotización ya fue aceptada o rechazada. Usa "Duplicar" para hacer una nueva.' });
      this.saved = true;
      void this.router.navigate(['/app/cotizaciones', quote.id]);
      return;
    }
    if (editing) {
      this.original.set(quote);
      this.validUntil = quote.validUntil;
      this.savedValidUntil = quote.validUntil;
      this.terms = quote.terms ?? '';
    } else if (quote.terms) {
      this.terms = quote.terms;
    }
    if (quote.customerId) {
      this.prospect = false;
      this.customer.set({ id: quote.customerId, name: quote.customerName ?? '', document: quote.customerDocument ?? '',
        phone: quote.customerPhone });
    } else {
      this.prospect = true;
      this.prospectName = quote.prospectName ?? '';
      this.prospectPhone = quote.prospectPhone ?? '';
    }
    this.notes = quote.notes ?? '';
    const ids = [...new Set(quote.items.map((i) => i.productId))];
    const products = ids.length === 0 ? of([] as (Product | null)[])
      : forkJoin(ids.map((pid) => this.catalog.product(pid, true).pipe(catchError(() => of(null)))));
    products.subscribe((list) => {
      const byId = new Map(list.filter((p): p is Product => p !== null).map((p) => [p.id, p]));
      this.items.set(quote.items.map((i) => {
        const product = byId.get(i.productId);
        const bySize = i.width !== null && i.length !== null;
        return {
          key: this.nextKey++,
          productId: i.productId,
          sku: i.sku,
          productName: i.productName,
          unitCode: i.unitCode,
          allowsDecimals: product ? this.allowsDecimals(product) : bySize,
          taxRate: product?.taxRate ?? 0,
          description: i.description ?? '',
          bySize,
          width: i.width,
          length: i.length,
          quantity: bySize ? null : i.quantity,
          unitPrice: i.unitPrice,
          discountPercent: i.discountPercent > 0 ? i.discountPercent : null,
        };
      }));
      this.loading.set(false);
      // Una copia es nueva: salir sin guardarla sí pregunta.
      this.snapshot = editing ? this.fingerprint() : '';
    });
  }

  private allowsDecimals(product: Product): boolean {
    return this.units.get(product.baseUnitId)?.allowsDecimals ?? product.baseUnitCode === 'M2';
  }

  // ------------------------------------------------------------------ cliente

  searchCustomers(): void {
    this.searchingCustomers.set(true);
    this.parties.search('customers', { page: 0, size: 10 }, this.customerText.trim() || null, false).subscribe({
      next: (page) => {
        // Al consumidor final no se le cotiza: para alguien sin registrar está "Aún no es cliente".
        this.customerResults.set(page.content.filter((c) => !c.system));
        this.customerSearched.set(true);
        this.searchingCustomers.set(false);
      },
      error: () => this.searchingCustomers.set(false),
    });
  }

  pickCustomer(party: Party): void {
    this.customer.set({ id: party.id, name: party.displayName,
      document: `${documentShortLabel(party.documentType)} ${party.formattedDocument}`, phone: party.phone });
    this.customerResults.set([]);
    this.customerSearched.set(false);
  }

  openNewCustomer(): void {
    this.newCustomer()?.prepare(this.customerText);
    this.newCustomerOpen = true;
  }

  customerCreated(party: Party): void {
    this.newCustomerOpen = false;
    this.pickCustomer(party);
  }

  // ------------------------------------------------------------------ líneas

  searchProducts(): void {
    const text = this.productText.trim();
    if (!text) {
      return;
    }
    this.searchingProducts.set(true);
    this.catalog.products({ page: 0, size: 10, search: text }).subscribe({
      next: (page) => {
        const active = page.content.filter((p) => p.active);
        this.searchingProducts.set(false);
        if (active.length === 1) {
          this.addProduct(active[0]);
        } else if (active.length === 0) {
          this.messages.add({ severity: 'warn', summary: 'Sin resultados', detail: `No hay productos con "${text}".` });
        } else {
          this.productResults.set(active);
        }
      },
      error: () => this.searchingProducts.set(false),
    });
  }

  addProduct(product: Product): void {
    this.productResults.set([]);
    this.productText = '';
    const allowsDecimals = this.allowsDecimals(product);
    const bySize = allowsDecimals && product.baseUnitCode === 'M2';
    this.items.update((list) => [...list, {
      key: this.nextKey++,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      unitCode: product.baseUnitCode ?? '',
      allowsDecimals,
      taxRate: product.taxRate ?? 0,
      description: '',
      bySize,
      width: null,
      length: null,
      quantity: bySize ? null : 1,
      unitPrice: product.salePrice > 0 ? product.salePrice : null,
      discountPercent: null,
    }]);
  }

  remove(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  protected lineTotal(item: QuoteDraft): number {
    return quoteDraftTotal(item, this.pricesIncludeTax);
  }

  protected quantityText(item: QuoteDraft): string {
    const quantity = draftQuantity(item);
    return quantity === null ? '' : `${formatQuantity(quantity)} ${item.unitCode}`;
  }

  protected total(): number {
    return this.items().reduce((sum, i) => sum + this.lineTotal(i), 0);
  }

  protected problem(): string | null {
    if (this.prospect ? !this.prospectName.trim() : !this.customer()) {
      return this.prospect ? 'Escribe el nombre de la persona a quien le cotizas.' : 'Elige el cliente.';
    }
    if (!this.validUntil) {
      return 'Elige hasta cuándo es válida.';
    }
    if (this.validUntil < this.today && this.validUntil !== this.savedValidUntil) {
      return 'La fecha de validez no puede ser anterior a hoy.';
    }
    const lines = quoteDraftProblem(this.items());
    if (lines !== null) {
      return lines;
    }
    // Como en el POS: más del máximo de Ajustes exige el permiso de descuentos (el servidor también lo valida).
    const over = this.items().find((i) => discountOf(i) > this.maxDiscountPercent);
    if (over && !this.auth.hasPermission('sales:discount')) {
      return `El descuento de ${over.productName} pasa del máximo de ${formatPercent(this.maxDiscountPercent)}: `
        + 'necesitas el permiso de descuentos.';
    }
    return null;
  }

  private fingerprint(): string {
    return JSON.stringify([this.prospect, this.prospect ? this.prospectName.trim() : this.customer()?.id ?? null,
      this.prospect ? this.prospectPhone.trim() : null, this.validUntil, this.notes.trim(), this.terms.trim(),
      this.items().map((i) => [i.productId, i.description.trim(), i.bySize, i.width, i.length, i.quantity, i.unitPrice,
        i.discountPercent])]);
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && !this.loading() && this.fingerprint() !== this.snapshot;
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  save(): void {
    if (this.problem() !== null || this.saving()) {
      return;
    }
    const id = this.id() ?? null;
    this.saving.set(true);
    this.api.save(id, {
      customerId: this.prospect ? null : this.customer()!.id,
      prospectName: this.prospect ? this.prospectName.trim() : null,
      prospectPhone: this.prospect ? this.prospectPhone.trim() || null : null,
      validUntil: this.validUntil,
      notes: this.notes.trim() || null,
      // Vacío = sin condiciones (nulo tomaría las de Ajustes).
      terms: this.terms.trim(),
      items: this.items().map((i) => ({
        productId: i.productId,
        description: i.description.trim() || null,
        width: i.bySize ? side(i.width) : null,
        length: i.bySize ? side(i.length) : null,
        quantity: i.bySize ? null : quantity4(Number(i.quantity)),
        unitPrice: Number(i.unitPrice),
        discountPercent: discountOf(i),
      })),
    }).subscribe({
      next: (quote) => {
        this.saving.set(false);
        this.saved = true;
        this.messages.add({ severity: 'success', summary: id ? 'Cotización actualizada' : `Cotización ${quote.number} creada`,
          life: 3000 });
        void this.router.navigate(['/app/cotizaciones', quote.id]);
      },
      error: () => this.saving.set(false),
    });
  }
}
