import { Component, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Party, Quote } from '../../core/api/api.models';
import { PartiesApi } from '../../core/api/parties.api';
import { QuotesApi } from '../../core/api/quotes.api';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { documentShortLabel } from '../../shared/document-types';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop } from '../../shared/money';
import { NewCustomerDialogComponent } from '../pos/new-customer-dialog.component';
import { isoDay } from '../orders/order-text';

/**
 * Convertir una cotización en pedido por encargo (decisión 260). Si era para alguien sin registrar, se elige o se
 * registra el cliente (el pedido lo necesita para avisarle y saber quién abonó).
 */
@Component({
  selector: 'app-quote-order-dialog',
  imports: [FormsModule, ButtonModule, InputTextModule, HasPermissionDirective, FormDialogComponent,
    NewCustomerDialogComponent],
  template: `
    @if (quote(); as q) {
      <app-form-dialog [(visible)]="visible" [header]="'Convertir ' + q.number + ' en pedido'" width="34rem"
                       submitLabel="Crear pedido" submitIcon="pi pi-calendar-plus" [dirty]="dueDate !== ''"
                       [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       description="El pedido lleva las mismas líneas y medidas; el descuento queda incluido en el precio de cada una."
                       (saved)="converted.emit($any($event))">
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium" id="quote-order-customer">Cliente</span>
          @if (q.customerId) {
            <p class="border rounded-lg px-3 py-2 text-sm"><span class="font-medium">{{ q.customerName }}</span>
              <span class="text-muted"> · {{ q.customerDocument }}</span></p>
          } @else if (customer()) {
            @let c = customer()!;
            <div class="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2 text-sm">
              <span class="font-medium">{{ c.displayName }}</span>
              <span class="text-muted">{{ docShort(c.documentType) }} {{ c.formattedDocument }}</span>
              <p-button label="Cambiar" size="small" [text]="true" (onClick)="customer.set(null)" />
            </div>
          } @else {
            <small class="text-xs text-muted">
              {{ q.prospectName }} aún no es cliente: búscalo por si ya lo registraron, o regístralo con sus datos.
            </small>
            <div class="flex gap-2">
              <input pInputText class="flex-1" [(ngModel)]="search" aria-labelledby="quote-order-customer"
                     placeholder="Nombre, documento o teléfono" (keydown.enter)="$event.preventDefault(); find()" />
              <p-button label="Buscar" [loading]="searching()" (onClick)="find()" />
              <p-button *hasPermission="'parties:manage'" label="Registrar" icon="pi pi-user-plus" [outlined]="true"
                        (onClick)="openNewCustomer()" />
            </div>
            @if (results().length > 0) {
              <ul class="border rounded divide-y text-sm max-h-48 overflow-y-auto">
                @for (c of results(); track c.id) {
                  <li>
                    <button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt" (click)="pick(c)">
                      <span class="font-medium">{{ c.displayName }}</span>
                      <span class="text-muted"> · {{ docShort(c.documentType) }} {{ c.formattedDocument }}</span>
                    </button>
                  </li>
                }
              </ul>
            } @else if (searched()) {
              <small class="text-xs text-muted">No hay clientes con ese dato.</small>
            }
          }
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Fecha de entrega</span>
          <input type="date" class="border rounded-lg px-3 py-2" [min]="today" [(ngModel)]="dueDate" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Dirección de entrega o instalación <span class="text-muted font-normal">(opcional)</span></span>
          <input pInputText maxlength="255" [(ngModel)]="address" />
        </label>
        <p class="text-sm">Total del pedido <strong class="tabular-nums">{{ cop(q.total) }}</strong>
          <span class="block text-xs text-muted">Puede variar unos pesos por el redondeo del precio con descuento.</span></p>
      </app-form-dialog>
    }
    <app-new-customer-dialog [(visible)]="newCustomerOpen" (created)="created($event)" />
  `,
})
export class QuoteOrderDialogComponent {
  private readonly api = inject(QuotesApi);
  private readonly parties = inject(PartiesApi);
  private readonly newCustomer = viewChild(NewCustomerDialogComponent);

  readonly visible = model(false);
  readonly quote = input<Quote | null>(null);
  readonly converted = output<Quote>();

  protected readonly customer = signal<Party | null>(null);
  protected readonly results = signal<Party[]>([]);
  protected readonly searched = signal(false);
  protected readonly searching = signal(false);
  protected search = '';
  protected dueDate = '';
  protected address = '';
  protected newCustomerOpen = false;
  protected readonly today = isoDay(new Date());
  protected readonly cop = formatCop;
  protected readonly docShort = documentShortLabel;

  prepare(quote: Quote): void {
    this.customer.set(null);
    this.results.set([]);
    this.searched.set(false);
    this.search = quote.prospectPhone ?? quote.prospectName ?? '';
    this.dueDate = '';
    this.address = '';
  }

  find(): void {
    this.searching.set(true);
    this.parties.search('customers', { page: 0, size: 8 }, this.search.trim() || null, false).subscribe({
      next: (page) => {
        this.results.set(page.content.filter((c) => !c.system));
        this.searched.set(true);
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  pick(party: Party): void {
    this.customer.set(party);
    this.results.set([]);
    this.searched.set(false);
  }

  openNewCustomer(): void {
    this.newCustomer()?.prepare(this.quote()?.prospectName ?? this.search);
    this.newCustomerOpen = true;
  }

  created(party: Party): void {
    this.newCustomerOpen = false;
    this.pick(party);
  }

  protected problem(): string | null {
    const quote = this.quote();
    if (quote && !quote.customerId && !this.customer()) {
      return 'Elige o registra al cliente.';
    }
    if (!this.dueDate) {
      return 'Elige la fecha de entrega.';
    }
    if (this.dueDate < this.today) {
      return 'La fecha de entrega no puede ser anterior a hoy.';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<Quote> => {
    const quote = this.quote()!;
    return this.api.toOrder(quote.id, {
      customerId: quote.customerId ? null : this.customer()!.id,
      dueDate: this.dueDate,
      address: this.address.trim() || null,
      notes: null,
    });
  };
}
