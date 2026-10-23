import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { Quote, QuoteConfig, QuoteSaleResult } from '../../core/api/api.models';
import { QuotesApi } from '../../core/api/quotes.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { BrandingService } from '../../core/theme/branding.service';
import { formatDateTime } from '../../shared/format';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop, formatPercent } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { printReceipt } from '../../shared/receipt/receipt-prefs';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { formatDay, sizeText } from '../orders/order-text';
import { QuoteDocumentComponent } from './quote-document.component';
import { QuoteOrderDialogComponent } from './quote-order-dialog.component';
import { QuoteSellDialogComponent } from './quote-sell-dialog.component';
import { partyName, partyPhone, quoteBadge, quoteWhatsAppLink, validLabel } from './quote-text';

/**
 * Una cotización (decisión 260): sus líneas, la vigencia y las acciones: PDF, WhatsApp, editar (o renovar si
 * venció), duplicar, rechazar y convertir en pedido o en venta.
 */
@Component({
  selector: 'app-quote-detail',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, StatusBadgeComponent,
    FormDialogComponent, QuoteDocumentComponent, QuoteOrderDialogComponent, QuoteSellDialogComponent],
  template: `
    <app-page-header [title]="quote() ? 'Cotización ' + quote()!.number : 'Cotización'" [description]="subtitle()">
      <a pButton routerLink="/app/cotizaciones" label="Todas las cotizaciones" icon="pi pi-arrow-left" severity="secondary"
         [outlined]="true"></a>
    </app-page-header>

    @if (quote(); as q) {
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <app-status-badge [status]="badge(q).key" [label]="badge(q).label" />
        <span class="text-sm">Válida hasta <strong>{{ day(q.validUntil) }}</strong>
          @if (q.status === 'OPEN') {
            <span [class.text-danger]="q.expired" [class.text-muted]="!q.expired"> · {{ valid(q) }}</span>
          }
        </span>
        @if (q.status === 'ACCEPTED' && q.convertedId) {
          <span class="text-sm">
            {{ q.convertedType === 'ORDER' ? 'Pedido' : 'Venta' }}
            @if (q.convertedType === 'ORDER' && canSeeOrders()) {
              <a class="text-brand font-medium hover:underline font-mono"
                 [routerLink]="['/app/pedidos', q.convertedId]">{{ q.convertedNumber }}</a>
            } @else {
              <span class="font-medium font-mono">{{ q.convertedNumber }}</span>
            }
            <span class="text-muted"> · {{ dateTime(q.convertedAt) }}</span>
          </span>
        }
        @if (q.status === 'REJECTED') {
          <span class="text-sm text-muted">Rechazada el {{ dateTime(q.rejectedAt) }}: {{ q.rejectReason }}</span>
        }
      </div>

      @if (q.status === 'OPEN' && q.expired) {
        <p class="text-sm text-warning mb-4" role="status">
          Venció: para convertirla, edítala, revisa los precios y renueva la fecha. O duplícala en una nueva.
        </p>
      }

      <div class="flex flex-wrap gap-2 mb-4">
        @if (q.status === 'OPEN' && canCreate()) {
          @if (!q.expired) {
            @if (canOrder()) {
              <p-button label="Convertir en pedido" icon="pi pi-calendar-plus" (onClick)="openOrder()" />
            }
            @if (canSell()) {
              <p-button label="Vender" icon="pi pi-shopping-cart" [outlined]="canOrder()" (onClick)="openSell()" />
            }
          }
          <a pButton [routerLink]="['/app/cotizaciones', q.id, 'editar']" [label]="q.expired ? 'Renovar' : 'Editar'"
             icon="pi pi-pencil" severity="secondary" [outlined]="true"></a>
        }
        <p-button label="Descargar PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true"
                  [disabled]="config() === null" (onClick)="print()" />
        <a pButton label="Enviar por WhatsApp" icon="pi pi-whatsapp" severity="secondary" [outlined]="true"
           target="_blank" rel="noopener noreferrer" [href]="whatsApp(q)"
           [attr.aria-label]="'Enviar la cotización a ' + name(q) + ' por WhatsApp (abre WhatsApp)'"></a>
        @if (canCreate()) {
          <a pButton routerLink="/app/cotizaciones/nueva" [queryParams]="{ desde: q.id }" label="Duplicar" icon="pi pi-copy"
             severity="secondary" [text]="true"></a>
        }
        @if (q.status === 'OPEN' && canCreate()) {
          <p-button label="Rechazar" icon="pi pi-times-circle" severity="danger" [text]="true" (onClick)="openReject()" />
        }
      </div>

      @if (q.notes || q.terms) {
        <section class="card p-4 mb-4 text-sm flex flex-col gap-1">
          @if (q.notes) {
            <p class="whitespace-pre-line"><span class="font-medium">Notas:</span> {{ q.notes }}</p>
          }
          @if (q.terms) {
            <p class="whitespace-pre-line"><span class="font-medium">Condiciones:</span> {{ q.terms }}</p>
          }
        </section>
      }

      <section class="card p-4 mb-4">
        <h2 class="font-semibold mb-2">Qué se cotizó</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Producto</th>
                <th class="p-2">Cantidad</th>
                <th class="p-2 text-right">Precio</th>
                <th class="p-2 text-right">Desc.</th>
                <th class="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (item of q.items; track item.id) {
                <tr class="border-t">
                  <td class="p-2">
                    {{ item.productName }}
                    @if (item.description) {
                      <span class="block text-xs text-muted">{{ item.description }}</span>
                    }
                  </td>
                  <td class="p-2">{{ size(item) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(item.unitPrice) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ item.discountPercent > 0 ? percent(item.discountPercent) : '—' }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(item.total) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t font-semibold">
                <td class="p-2" colspan="4">Total</td>
                <td class="p-2 text-right tabular-nums text-lg">{{ cop(q.total) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        @if (q.createdByName) {
          <p class="text-xs text-muted mt-2">Hecha por {{ q.createdByName }} el {{ dateTime(q.createdAt) }}</p>
        }
      </section>

      <app-quote-document class="receipt-print-root" [quote]="q" [config]="config()" [logo]="brandLogo()" />
    }

    <app-quote-order-dialog [(visible)]="orderOpen" [quote]="quote()" (converted)="convertedToOrder($event)" />
    <app-quote-sell-dialog [(visible)]="sellOpen" [quote]="quote()" (sold)="sold($event)" />

    <app-form-dialog [(visible)]="rejectOpen" header="Rechazar cotización" width="28rem" submitLabel="Rechazar"
                     submitIcon="pi pi-times-circle" [destructive]="true" [dirty]="rejectReason.trim().length > 0"
                     [invalidMessage]="rejectReason.trim() ? null : 'Escribe el motivo.'" [save]="rejectRequest"
                     [successMessage]="null" (saved)="quote.set($any($event))"
                     description="Queda como rechazada (sirve para saber por qué no se cerró). Puedes duplicarla después.">
      <div class="flex flex-col gap-1">
        <label for="reject-reason" class="text-sm font-medium">Motivo</label>
        <input pInputText id="reject-reason" maxlength="255" [(ngModel)]="rejectReason"
               placeholder="Le pareció caro, compró en otro lado, ya no lo necesita…" />
      </div>
    </app-form-dialog>
  `,
})
export class QuoteDetailComponent {
  /** Parámetro de ruta :id. */
  readonly id = input.required<string>();

  private readonly api = inject(QuotesApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly orderDialog = viewChild(QuoteOrderDialogComponent);
  private readonly sellDialog = viewChild(QuoteSellDialogComponent);
  protected readonly brandLogo = inject(BrandingService).logo;
  protected readonly canCreate = permissionFlag('quotes:create');
  protected readonly canOrder = permissionFlag('orders:create');
  protected readonly canSell = permissionFlag('sales:create');
  protected readonly canSeeOrders = permissionFlag('orders:read');

  protected readonly quote = signal<Quote | null>(null);
  protected readonly config = signal<QuoteConfig | null>(null);
  protected orderOpen = false;
  protected sellOpen = false;
  protected rejectOpen = false;
  protected rejectReason = '';

  protected readonly cop = formatCop;
  protected readonly percent = formatPercent;
  protected readonly day = formatDay;
  protected readonly dateTime = formatDateTime;
  protected readonly size = sizeText;
  protected readonly name = partyName;

  constructor() {
    this.api.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.quote.set(null);
        this.api.get(id).subscribe({
          next: (quote) => {
            if (this.id() === id) {
              this.quote.set(quote);
            }
          },
          error: () => void this.router.navigate(['/app/cotizaciones']),
        });
      });
    });
  }

  protected subtitle(): string | null {
    const q = this.quote();
    if (!q) {
      return null;
    }
    const phone = partyPhone(q);
    const who = q.customerId ? `${q.customerName} · ${q.customerDocument}` : `${q.prospectName} (sin registrar)`;
    return phone ? `${who} · ${phone}` : who;
  }

  protected badge(quote: Quote) {
    return quoteBadge(quote);
  }

  protected valid(quote: Quote): string {
    return validLabel(quote.validUntil, new Date(), quote.expired);
  }

  protected whatsApp(quote: Quote): string {
    return quoteWhatsAppLink(quote, this.config()?.businessName || this.auth.currentTenant()?.tradeName || 'tu tienda');
  }

  print(): void {
    printReceipt();
  }

  openOrder(): void {
    const quote = this.quote();
    if (quote) {
      this.orderDialog()?.prepare(quote);
      this.orderOpen = true;
    }
  }

  convertedToOrder(quote: Quote): void {
    this.quote.set(quote);
    this.messages.add({ severity: 'success', summary: `Pedido ${quote.convertedNumber} creado`, life: 4000 });
    if (quote.convertedId) {
      void this.router.navigate(['/app/pedidos', quote.convertedId], { queryParams: { anticipo: 1 } });
    }
  }

  openSell(): void {
    const quote = this.quote();
    if (quote) {
      this.sellDialog()?.prepare(quote);
      this.sellOpen = true;
    }
  }

  sold(result: QuoteSaleResult): void {
    this.quote.set(result.quote);
    this.messages.add({ severity: 'success', summary: `Venta ${result.quote.convertedNumber ?? ''} registrada`,
      detail: 'La encuentras en Ventas para imprimir el tiquete.', life: 6000 });
  }

  openReject(): void {
    this.rejectReason = '';
    this.rejectOpen = true;
  }

  protected readonly rejectRequest = (): Observable<Quote> =>
    this.api.reject(this.quote()!.id, this.rejectReason.trim())
      .pipe(tap(() => this.messages.add({ severity: 'success', summary: 'Cotización rechazada', life: 3000 })));
}
