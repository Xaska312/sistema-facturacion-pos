import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Branch } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import {
  PurchaseReview,
  PurchaseSuggestions,
  PurchasesApi,
  SuggestionGroup,
} from '../../core/api/purchases.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { copyToClipboard } from '../../shared/clipboard';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { printReceipt } from '../../shared/receipt/receipt-prefs';
import { whatsAppNumber } from '../credit/credit-text';
import { orderTotal, orderedQuantity, supplierOrderMessage } from './purchase-text';

/**
 * Qué comprar (decisión 297): el pedido sugerido a cada proveedor, calculado con lo vendido, la existencia y el mínimo
 * y máximo; la persona ajusta las cantidades, puede pedirle a Aska que lo revise y lo manda por WhatsApp o en PDF.
 * Nada se guarda: solo los días de cada proveedor.
 */
@Component({
  selector: 'app-purchase-suggestions',
  imports: [FormsModule, ButtonModule, PageHeaderComponent, EmptyStateComponent, XaskaIaLogoComponent],
  template: `
    <app-page-header title="Qué comprar"
                     description="El pedido sugerido a cada proveedor según lo que vendes, lo que tienes y tus mínimos. Ajusta las cantidades y envíaselo." />

    @if (branches().length > 1) {
      <label class="flex items-center gap-2 mb-4 text-sm max-w-md">
        <span class="font-medium">Sucursal</span>
        <select class="flex-1 min-h-11 rounded-lg border border-line bg-surface px-3" [ngModel]="branchId()"
                (ngModelChange)="selectBranch($event)">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    }

    @if (loading()) {
      <p class="text-muted" role="status">Calculando el pedido…</p>
    } @else if (data() !== null) {
      @let d = data()!;
      @if (d.groups.length === 0) {
        <app-empty-state icon="pi pi-check-circle" title="No hay nada que pedir por ahora"
                         message="Con lo que vendes y lo que tienes en bodega, alcanzas para los días de cada proveedor." />
      }
      <div class="flex flex-col gap-5 max-w-6xl">
        @for (g of d.groups; track g.supplierId; let gi = $index) {
          <section class="card p-4 md:p-5 flex flex-col gap-4" [attr.aria-label]="'Pedido a ' + g.supplierName">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex-1 min-w-48">
                <h2 class="text-lg font-bold tracking-tight">{{ g.supplierName }}</h2>
                <p class="text-xs text-muted">{{ g.lines.length }} {{ g.lines.length === 1 ? 'producto' : 'productos' }}
                  · {{ g.phone || 'sin teléfono' }}</p>
              </div>
              @if (g.supplierId) {
                <label class="flex items-center gap-2 text-sm">
                  <span class="text-muted">Pedir para</span>
                  <input type="number" min="1" max="120" class="w-20 min-h-11 rounded-lg border border-line bg-surface px-2 text-center"
                         [ngModel]="g.coverageDays" [disabled]="!canReceive() || savingDays() === g.supplierId"
                         (change)="saveDays(g, $event)" [attr.aria-label]="'Días de venta para ' + g.supplierName" />
                  <span class="text-muted">días</span>
                </label>
              }
              <div class="text-right">
                <p class="text-xs text-muted">Valor estimado</p>
                <p class="text-lg font-bold">{{ cop(total(g)) }}</p>
              </div>
            </div>

            <div class="overflow-x-auto -mx-1">
              <table class="w-full text-sm min-w-[44rem]">
                <caption class="sr-only">Productos sugeridos para {{ g.supplierName }}</caption>
                <thead>
                  <tr class="text-left text-xs text-muted border-b border-line">
                    <th scope="col" class="py-2 px-1 font-medium">Producto</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Hay</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Mín / Máx</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Vendido 7 / 30 días</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Sugerido</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Pedir</th>
                    <th scope="col" class="py-2 px-1 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of g.lines; track l.productId) {
                    <tr class="border-b border-line last:border-0" [class.opacity-50]="ordered(l) === 0">
                      <td class="py-2 px-1">
                        <span class="font-medium">{{ l.name }}</span>
                        <span class="block text-xs text-muted">{{ l.sku }}
                          @if (l.expiringSoon > 0) {
                            · <span class="text-warning">{{ qty(l.expiringSoon) }} por vencer</span>
                          }
                          @if (l.expired > 0) {
                            · <span class="text-danger">{{ qty(l.expired) }} vencido</span>
                          }
                        </span>
                        @if (adjustmentFor(l.productId); as adj) {
                          <span class="aska-note mt-1">
                            <app-xaska-ia-logo size="sm" />
                            <span><strong>Aska: pedir {{ qty(adj.quantity) }}.</strong> {{ adj.reason }}</span>
                            <button type="button" class="aska-apply" (click)="apply(adj.productId, adj.quantity)">Aplicar</button>
                          </span>
                        }
                      </td>
                      <td class="py-2 px-1 text-right whitespace-nowrap">{{ qty(l.stock) }} {{ l.unitCode }}</td>
                      <td class="py-2 px-1 text-right whitespace-nowrap text-muted">{{ l.minStock === null ? '—' : qty(l.minStock) }} / {{ l.maxStock === null ? '—' : qty(l.maxStock) }}</td>
                      <td class="py-2 px-1 text-right whitespace-nowrap">{{ qty(l.soldLast7) }} / {{ qty(l.soldLast30) }}</td>
                      <td class="py-2 px-1 text-right whitespace-nowrap text-muted">{{ qty(l.suggested) }}</td>
                      <td class="py-2 px-1 text-right">
                        <input type="number" min="0" step="1" class="w-20 min-h-10 rounded-lg border border-line bg-surface px-2 text-right"
                               [ngModel]="ordered(l)" (ngModelChange)="setQuantity(l.productId, $event)"
                               [attr.aria-label]="'Cantidad a pedir de ' + l.name" />
                      </td>
                      <td class="py-2 px-1 text-right whitespace-nowrap">{{ cop(ordered(l) * l.unitCost) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (reviews()[key(g)]; as r) {
              <div class="aska-review" role="status">
                <app-xaska-ia-logo size="md" />
                <div class="flex-1 flex flex-col gap-1">
                  <p class="font-bold">Aska revisó este pedido</p>
                  <p class="text-sm">{{ r.summary }}</p>
                  @if (pendingAdjustments(g).length > 1) {
                    <button type="button" class="aska-apply self-start mt-1" (click)="applyAll(g)">Aplicar todos los ajustes</button>
                  }
                </div>
              </div>
            }

            <div class="flex flex-wrap gap-2 justify-end">
              @if (canAsk()) {
                <button type="button" class="aska-button" [disabled]="reviewing() !== null" (click)="review(g)">
                  <app-xaska-ia-logo size="sm" />
                  {{ reviewing() === key(g) ? 'Aska está revisando…' : 'Revisar con Aska' }}
                </button>
              }
              <p-button label="Copiar mensaje" icon="pi pi-copy" [outlined]="true" (onClick)="copy(g)" />
              @if (whatsApp(g); as link) {
                <a pButton [href]="link" target="_blank" rel="noopener" label="WhatsApp" icon="pi pi-whatsapp" [outlined]="true"></a>
              }
              <p-button label="Imprimir o PDF" icon="pi pi-print" (onClick)="print(gi)" />
            </div>

            <article class="receipt-print-root order-sheet" [class]="'order-sheet-' + gi">
              <h1>Pedido a {{ g.supplierName }}</h1>
              <p>{{ businessName() }} · {{ d.date }}</p>
              <table>
                <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th></tr></thead>
                <tbody>
                  @for (l of g.lines; track l.productId) {
                    @if (ordered(l) > 0) {
                      <tr><td>{{ l.sku }}</td><td>{{ l.name }}</td><td>{{ qty(ordered(l)) }} {{ l.unitCode }}</td></tr>
                    }
                  }
                </tbody>
              </table>
            </article>
          </section>
        }
      </div>
      <p class="text-xs text-muted mt-4 max-w-3xl">Sugerido = venta diaria (más peso a la última semana) × días del proveedor
        + mínimo − lo que hay (sin contar lo vencido), sin pasar del máximo. El proveedor es el de la última compra del
        producto.</p>
    }
  `,
  styles: `
    .aska-button {
      display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; padding: 0 1rem; border-radius: 0.75rem;
      font-weight: 700; font-size: 0.875rem; color: var(--aska-contrast); background: var(--aska);
      box-shadow: 0 0 0 4px var(--aska-glow);
    }
    .aska-button:disabled { opacity: 0.7; }
    .aska-review {
      display: flex; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: 1rem;
      background: var(--aska-soft); border: 1px solid var(--aska-line);
    }
    .aska-note {
      display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; padding: 0.375rem 0.5rem; border-radius: 0.625rem;
      font-size: 0.75rem; background: var(--aska-soft); color: var(--aska-soft-fg);
    }
    .aska-apply {
      min-height: 2rem; padding: 0 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700;
      color: var(--aska-contrast); background: var(--aska);
    }
    .order-sheet { padding: 1.5cm; font-size: 12pt; }
    .order-sheet h1 { font-size: 16pt; margin: 0 0 0.25cm; }
    .order-sheet table { width: 100%; border-collapse: collapse; margin-top: 0.5cm; }
    .order-sheet th, .order-sheet td { text-align: left; padding: 0.15cm 0.2cm; border-bottom: 1px solid; }
  `,
})
export class PurchaseSuggestionsComponent implements OnInit {
  private readonly api = inject(PurchasesApi);
  private readonly organization = inject(OrganizationApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  protected readonly canReceive = permissionFlag('purchases:receive');
  protected readonly canAsk = permissionFlag('ai:ask');
  protected readonly branches = signal<Branch[]>([]);
  protected readonly branchId = signal('');
  protected readonly data = signal<PurchaseSuggestions | null>(null);
  protected readonly loading = signal(true);
  protected readonly savingDays = signal<string | null>(null);
  protected readonly reviewing = signal<string | null>(null);
  protected readonly reviews = signal<Record<string, PurchaseReview>>({});
  /** Cantidades que la persona cambió (por producto). */
  protected readonly quantities = signal<Record<string, number>>({});
  protected readonly businessName = computed(() => this.auth.currentTenant()?.tradeName ?? '');

  protected readonly cop = formatCop;
  protected readonly qty = formatQuantity;

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => {
      const active = p.content.filter((b) => b.active);
      this.branches.set(active);
      const first = active.find((b) => b.code === 'PRINCIPAL') ?? active[0];
      if (first) {
        this.selectBranch(first.id);
      } else {
        this.loading.set(false);
      }
    });
  }

  protected selectBranch(id: string): void {
    this.branchId.set(id);
    this.quantities.set({});
    this.reviews.set({});
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.suggestions(this.branchId()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected key(g: SuggestionGroup): string {
    return g.supplierId ?? 'none';
  }

  protected ordered(line: { productId: string; suggested: number }): number {
    return orderedQuantity(line, this.quantities());
  }

  protected setQuantity(productId: string, value: number | string | null): void {
    const n = value === null || value === '' ? 0 : Math.max(0, Math.round(Number(value)));
    this.quantities.update((q) => ({ ...q, [productId]: Number.isNaN(n) ? 0 : n }));
  }

  protected total(g: SuggestionGroup): number {
    return orderTotal(g.lines, this.quantities());
  }

  protected saveDays(g: SuggestionGroup, event: Event): void {
    const days = Math.round(Number((event.target as HTMLInputElement).value));
    if (!g.supplierId || !Number.isInteger(days) || days < 1 || days > 120) {
      this.messages.add({ severity: 'warn', summary: 'Días', detail: 'Los días van de 1 a 120.' });
      return;
    }
    this.savingDays.set(g.supplierId);
    this.api.setCoverageDays(g.supplierId, days).subscribe({
      next: () => {
        this.savingDays.set(null);
        this.load();
      },
      error: () => this.savingDays.set(null),
    });
  }

  protected review(g: SuggestionGroup): void {
    this.reviewing.set(this.key(g));
    const lines = g.lines.map((l) => ({ productId: l.productId, quantity: this.ordered(l) }));
    this.api.reviewSuggestion(this.branchId(), g.supplierId, lines).subscribe({
      next: (r) => {
        this.reviewing.set(null);
        this.reviews.update((all) => ({ ...all, [this.key(g)]: r }));
      },
      error: () => this.reviewing.set(null),
    });
  }

  /** Ajuste de Aska que todavía no se aplicó a ese producto. */
  protected adjustmentFor(productId: string): { productId: string; quantity: number; reason: string } | null {
    for (const r of Object.values(this.reviews())) {
      const adj = r.adjustments.find((a) => a.productId === productId);
      if (adj && this.quantities()[productId] !== adj.quantity) {
        return adj;
      }
    }
    return null;
  }

  protected pendingAdjustments(g: SuggestionGroup): { productId: string; quantity: number }[] {
    return g.lines.map((l) => this.adjustmentFor(l.productId)).filter((a) => a !== null);
  }

  protected apply(productId: string, quantity: number): void {
    this.setQuantity(productId, quantity);
  }

  protected applyAll(g: SuggestionGroup): void {
    for (const a of this.pendingAdjustments(g)) {
      this.setQuantity(a.productId, a.quantity);
    }
  }

  private message(g: SuggestionGroup): string {
    return supplierOrderMessage(g.supplierName, this.businessName(), g.lines, this.quantities());
  }

  protected copy(g: SuggestionGroup): void {
    void copyToClipboard(this.message(g)).then((ok) => this.messages.add(ok
      ? { severity: 'success', summary: 'Mensaje copiado', detail: 'Pégalo en el chat con tu proveedor.', life: 3000 }
      : { severity: 'warn', summary: 'No se pudo copiar', detail: 'Copia el pedido desde la hoja para imprimir.' }));
  }

  protected whatsApp(g: SuggestionGroup): string | null {
    const number = whatsAppNumber(g.phone);
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(this.message(g))}` : null;
  }

  protected print(index: number): void {
    printReceipt('.order-sheet-' + index);
  }
}
