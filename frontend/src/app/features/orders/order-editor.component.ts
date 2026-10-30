import { Component, HostListener, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Order, OrderItem, Party, Product, Unit } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { OrdersApi } from '../../core/api/orders.api';
import { PartiesApi } from '../../core/api/parties.api';
import { SalesApi } from '../../core/api/sales.api';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { documentShortLabel } from '../../shared/document-types';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';
import { NewCustomerDialogComponent } from '../pos/new-customer-dialog.component';
import { quantity4 } from '../pos/sale-math';
import { DraftItem, draftProblem, draftQuantity, draftTotal, isoDay, side, sizeText } from './order-text';

interface CustomerChoice {
  id: string;
  name: string;
  document: string;
  phone: string | null;
}

/**
 * Nuevo pedido o edición de uno abierto (decisión 258). Cada línea es un producto del catálogo (puede ser uno
 * genérico como "Mesón" o "Torta"), con descripción, cantidad o medidas (ancho × largo en metros = m²) y el precio
 * acordado. Al editar, lo ya entregado no cambia: solo se reemplazan las líneas pendientes.
 */
@Component({
  selector: 'app-order-editor',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, PesosInputDirective,
    HasPermissionDirective, NewCustomerDialogComponent],
  template: `
    <app-page-header [title]="id() ? 'Editar pedido ' + (order()?.number ?? '') : 'Nuevo pedido'"
                     description="Lo que pidió el cliente, el precio acordado y la fecha de entrega. No mueve inventario ni dinero hasta que lo entregues." />

    <section class="card p-4 grid gap-4 md:grid-cols-2 max-w-5xl">
      <div class="flex flex-col gap-1 md:col-span-2">
        <span class="text-sm font-medium" id="order-customer-label">Cliente</span>
        @if (customer(); as c) {
          <div class="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2">
            <span class="pi pi-user text-muted" aria-hidden="true"></span>
            <span class="font-medium">{{ c.name }}</span>
            <span class="text-sm text-muted">{{ c.document }}{{ c.phone ? ' · ' + c.phone : '' }}</span>
            @if (!id()) {
              <p-button label="Cambiar" size="small" [text]="true" (onClick)="customer.set(null)" />
            }
          </div>
          @if (!c.phone) {
            <small class="text-xs text-warning">El cliente no tiene teléfono: no podrás enviarle el comprobante por WhatsApp.</small>
          }
        } @else {
          <form class="flex gap-2" (ngSubmit)="searchCustomers()">
            <input pInputText name="customerSearch" class="flex-1" [(ngModel)]="customerText"
                   aria-labelledby="order-customer-label" placeholder="Nombre, documento o teléfono del cliente" />
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
            <small class="text-xs text-muted">No hay clientes con ese dato. Regístralo con "Nuevo".</small>
          }
        }
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Fecha de entrega</span>
        <input type="date" class="border rounded-lg px-3 py-2" [min]="today" [(ngModel)]="dueDate" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Dirección de entrega o instalación <span class="text-muted font-normal">(opcional)</span></span>
        <input pInputText maxlength="255" [(ngModel)]="address" placeholder="Si se lleva o se instala donde el cliente" />
      </label>
      <label class="flex flex-col gap-1 md:col-span-2">
        <span class="text-sm font-medium">Indicaciones <span class="text-muted font-normal">(opcional)</span></span>
        <textarea pInputText rows="2" maxlength="1000" [(ngModel)]="notes"
                  placeholder="Color, acabado, mensaje de la torta, hora de instalación…"></textarea>
      </label>
    </section>

    <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
      <h2 class="font-bold tracking-tight">Qué pidió</h2>
      @if (deliveredItems().length > 0) {
        <div class="text-sm border rounded-lg p-3 bg-surface-alt">
          <p class="font-medium mb-1">Ya entregado (no cambia)</p>
          @for (i of deliveredItems(); track i.id) {
            <p class="flex justify-between gap-2">
              <span>{{ i.productName }}{{ i.description ? ' · ' + i.description : '' }} — {{ size(i) }}</span>
              <span class="tabular-nums">{{ cop(i.total) }}</span>
            </p>
          }
        </div>
      }
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
            <input pInputText maxlength="200" [(ngModel)]="item.description" placeholder="Mesón cocina, torta 2 pisos…" />
          </label>
          <fieldset class="md:col-span-4 flex flex-col gap-1">
            <legend class="text-xs font-medium mb-1">Cobrar</legend>
            <div class="flex gap-2">
              <label class="flex items-center gap-2 min-h-10 px-3 border rounded-lg cursor-pointer" [class.border-brand]="!item.bySize">
                <input type="radio" [name]="'mode-' + item.key" [value]="false" [(ngModel)]="item.bySize" /> Por cantidad
              </label>
              <label class="flex items-center gap-2 min-h-10 px-3 border rounded-lg" [class.border-brand]="item.bySize"
                     [class.cursor-pointer]="item.allowsDecimals" [class.opacity-50]="!item.allowsDecimals">
                <input type="radio" [name]="'mode-' + item.key" [value]="true" [(ngModel)]="item.bySize"
                       [disabled]="!item.allowsDecimals" /> Por medidas
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
          <div class="md:col-span-2 text-right">
            <span class="block text-xs text-muted">{{ quantityText(item) }}</span>
            <span class="font-semibold tabular-nums">{{ cop(lineTotal(item)) }}</span>
          </div>
          @if (!item.allowsDecimals) {
            <small class="md:col-span-12 text-xs text-muted">
              Para cobrar por medidas (ancho × largo) usa un producto cuya unidad sea M2.
            </small>
          }
        </div>
      } @empty {
        @if (deliveredItems().length === 0) {
          <p class="p-6 text-center text-muted text-sm">
            Busca y agrega lo que pidió el cliente. Si no lo tienes en el catálogo, crea un producto genérico
            (por ejemplo "Mesón en granito" en M2 o "Torta" en unidades) con precio libre.
          </p>
        }
      }
    </section>

    <div class="flex flex-wrap justify-end gap-3 mt-4 max-w-5xl items-center">
      <span class="text-sm">Total estimado <strong class="tabular-nums text-lg">{{ cop(total()) }}</strong></span>
      @if (problem(); as message) {
        <span class="text-sm text-warning basis-full text-right">{{ message }}</span>
      }
      <a pButton [routerLink]="id() ? ['/app/pedidos', id()] : '/app/pedidos'" label="Cancelar" [text]="true"
         severity="secondary"></a>
      <p-button [label]="id() ? 'Guardar cambios' : 'Crear pedido'" icon="pi pi-check" [loading]="saving() || loading()"
                [disabled]="problem() !== null || loading()" (onClick)="save()" />
    </div>

    <app-new-customer-dialog [(visible)]="newCustomerOpen" (created)="customerCreated($event)" />
  `,
})
export class OrderEditorComponent implements OnInit, HasUnsavedChanges {
  /** Parámetro de ruta :id (solo al editar). */
  readonly id = input<string>();

  private readonly api = inject(OrdersApi);
  private readonly catalog = inject(CatalogApi);
  private readonly parties = inject(PartiesApi);
  private readonly sales = inject(SalesApi);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly newCustomer = viewChild(NewCustomerDialogComponent);

  protected readonly order = signal<Order | null>(null);
  protected readonly customer = signal<CustomerChoice | null>(null);
  protected readonly customerResults = signal<Party[]>([]);
  protected readonly customerSearched = signal(false);
  protected readonly searchingCustomers = signal(false);
  protected readonly productResults = signal<Product[]>([]);
  protected readonly searchingProducts = signal(false);
  protected readonly items = signal<DraftItem[]>([]);
  protected readonly deliveredItems = computed<OrderItem[]>(() => (this.order()?.items ?? []).filter((i) => i.delivered));
  protected readonly saving = signal(false);
  /** Al editar: hasta traer el pedido y sus productos no se puede guardar (se enviarían las líneas vacías). */
  protected readonly loading = signal(false);
  protected customerText = '';
  protected productText = '';
  protected dueDate = '';
  protected address = '';
  protected notes = '';
  protected newCustomerOpen = false;
  protected readonly today = isoDay(new Date());
  private pricesIncludeTax = true;
  private units = new Map<string, Unit>();
  private nextKey = 1;
  private saved = false;
  /** Lo que había al abrir (o al terminar de cargar el pedido): si cambia, salir pregunta. */
  private snapshot = '';

  protected readonly cop = formatCop;
  protected readonly size = sizeText;
  protected readonly docShort = documentShortLabel;

  ngOnInit(): void {
    this.snapshot = this.fingerprint();
    this.sales.config().subscribe({ next: (c) => (this.pricesIncludeTax = c.pricesIncludeTax), error: () => undefined });
    // Las unidades primero: dicen qué productos se pueden cobrar por medidas (aceptan decimales).
    this.catalog.units().pipe(catchError(() => of([] as Unit[]))).subscribe((list) => {
      this.units = new Map(list.map((u) => [u.id, u]));
      const id = this.id();
      if (id) {
        this.loading.set(true);
        this.api.get(id).subscribe({
          next: (order) => this.loadOrder(order),
          // El aviso del error ya lo muestra el manejo global; sin pedido no hay nada que editar.
          error: () => void this.router.navigate(['/app/pedidos']),
        });
      }
    });
  }

  private loadOrder(order: Order): void {
    if (order.status !== 'OPEN') {
      this.loading.set(false);
      this.messages.add({ severity: 'warn', summary: 'No se puede editar', detail: 'El pedido ya no está abierto.' });
      void this.router.navigate(['/app/pedidos', order.id]);
      return;
    }
    this.order.set(order);
    this.customer.set({ id: order.customerId, name: order.customerName, document: order.customerDocument,
      phone: order.customerPhone });
    this.dueDate = order.dueDate;
    this.address = order.address ?? '';
    this.notes = order.notes ?? '';
    const pending = order.items.filter((i) => !i.delivered);
    const ids = [...new Set(pending.map((i) => i.productId))];
    const products = ids.length === 0 ? of([] as (Product | null)[])
      : forkJoin(ids.map((pid) => this.catalog.product(pid, true).pipe(catchError(() => of(null)))));
    products.subscribe((list) => {
      const byId = new Map(list.filter((p): p is Product => p !== null).map((p) => [p.id, p]));
      this.items.set(pending.map((i) => {
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
        };
      }));
      this.loading.set(false);
      this.snapshot = this.fingerprint();
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
        // El consumidor final no sirve para un pedido: hay que poder avisarle y saber quién abonó.
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
    this.items.update((list) => [...list, {
      key: this.nextKey++,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      unitCode: product.baseUnitCode ?? '',
      allowsDecimals,
      taxRate: product.taxRate ?? 0,
      description: '',
      bySize: allowsDecimals && product.baseUnitCode === 'M2',
      width: null,
      length: null,
      quantity: allowsDecimals && product.baseUnitCode === 'M2' ? null : 1,
      unitPrice: product.salePrice > 0 ? product.salePrice : null,
    }]);
  }

  remove(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  protected lineTotal(item: DraftItem): number {
    return draftTotal(item, this.pricesIncludeTax);
  }

  protected quantityText(item: DraftItem): string {
    const quantity = draftQuantity(item);
    return quantity === null ? '' : `${formatQuantity(quantity)} ${item.unitCode}`;
  }

  protected total(): number {
    const pending = this.items().reduce((sum, i) => sum + this.lineTotal(i), 0);
    return pending + this.deliveredItems().reduce((sum, i) => sum + i.total, 0);
  }

  protected problem(): string | null {
    if (!this.customer()) {
      return 'Elige el cliente.';
    }
    if (!this.dueDate) {
      return 'Elige la fecha de entrega.';
    }
    if (this.dueDate < this.today) {
      return 'La fecha de entrega no puede ser anterior a hoy.';
    }
    if (this.items().length === 0 && this.deliveredItems().length > 0) {
      // Guardar así marcaría el pedido como entregado sin cobrar nada: para terminarlo se usa Entregar o Cancelar.
      return 'Deja al menos una línea pendiente. Si ya no falta nada, usa Entregar o Cancelar pedido.';
    }
    return draftProblem(this.items());
  }

  /** Lo que se guardaría (sin los campos de búsqueda). */
  private fingerprint(): string {
    return JSON.stringify([this.customer()?.id ?? null, this.dueDate, this.address.trim(), this.notes.trim(),
      this.items().map((i) => [i.productId, i.description.trim(), i.bySize, i.width, i.length, i.quantity, i.unitPrice])]);
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
      customerId: this.customer()!.id,
      dueDate: this.dueDate,
      address: this.address.trim() || null,
      notes: this.notes.trim() || null,
      items: this.items().map((i) => ({
        productId: i.productId,
        description: i.description.trim() || null,
        // Redondeado como lo valida el servidor (medidas a 3 decimales, cantidad a 4).
        width: i.bySize ? side(i.width) : null,
        length: i.bySize ? side(i.length) : null,
        quantity: i.bySize ? null : quantity4(Number(i.quantity)),
        unitPrice: Number(i.unitPrice),
      })),
    }).subscribe({
      next: (order) => {
        this.saving.set(false);
        this.saved = true;
        this.messages.add({ severity: 'success', summary: id ? 'Pedido actualizado' : `Pedido ${order.number} creado`,
          life: 3000 });
        // Recién creado: se ofrece recibir el anticipo de una vez.
        void this.router.navigate(['/app/pedidos', order.id], id ? {} : { queryParams: { anticipo: 1 } });
      },
      error: () => this.saving.set(false),
    });
  }
}
