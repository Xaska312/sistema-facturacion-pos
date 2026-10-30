import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, finalize } from 'rxjs';
import { Product, ProductLookup, ProductModel, ProductModelRow, ProductVariant } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { DiningApi, Floor, Tab, TabItem, TabSummary } from '../../core/api/dining.api';
import { ModifiersApi, PosModifierCatalog, PosModifierGroup } from '../../core/api/modifiers.api';
import { SalesApi } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { problemMessage } from '../../core/errors/problem';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatCop, formatQuantity } from '../../shared/money';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';
import { loadFavorites, saveFavorites, toggleFavorite } from '../pos/favorites';
import { groupsFor } from '../pos/modifier-choice';
import { ModifierPick, ModifierPickerComponent } from '../pos/modifier-picker.component';
import { ProductGridComponent } from '../pos/product-grid.component';
import { modifierSummary } from '../pos/sale-math';
import { VariantPickerComponent } from '../pos/variant-picker.component';
import { activeItems, itemExtras, itemTotal, kindGlyph, openFor } from './dining-labels';
import { PendingItem, addPending, pendingPrice, pendingTotal, stepPending, toItemInputs } from './pending-items';

/** Producto esperando su precio libre o sus adiciones antes de entrar al pedido. */
interface Picking {
  lookup: ProductLookup;
  basePrice: number;
  groups: PosModifierGroup[];
}

/**
 * Cuenta abierta (Fase 12b-2, decisión 269): a un lado los productos para pedir (con adiciones y nota), al otro la
 * cuenta con lo ya pedido. Lo nuevo queda "por agregar" hasta tocar "Agregar a la cuenta". Desde aquí se mueve de
 * mesa, se une con otra, se cambian sus datos, se cancela o se cobra (en Vender).
 */
@Component({
  selector: 'app-tab',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, SkeletonModule, FormDialogComponent,
    XIconComponent, ProductGridComponent, ModifierPickerComponent, VariantPickerComponent],
  template: `
    @if (tab(); as t) {
      <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-3 min-w-0">
          <a routerLink="/app/mesas" class="back" aria-label="Volver a las mesas"><i class="pi pi-arrow-left" aria-hidden="true"></i></a>
          <span class="glyph-tile" aria-hidden="true"><app-xicon [name]="glyph(t.kind)" [size]="28" /></span>
          <div class="min-w-0">
            <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight truncate">{{ t.label }}</h1>
            <p class="text-sm text-muted truncate">
              {{ t.zoneName ? t.zoneName + ' · ' : '' }}abierta hace {{ since(t.openedAt) }}{{ t.guests ? ' · ' + t.guests + ' personas' : '' }}{{ t.openedByName ? ' · ' + t.openedByName : '' }}
            </p>
          </div>
        </div>
        @if (isOpen()) {
          <div class="flex flex-wrap gap-2">
            <p-button label="Mover" icon="pi pi-arrows-h" severity="secondary" [outlined]="true" (onClick)="openMove()" />
            <p-button label="Unir" icon="pi pi-link" severity="secondary" [outlined]="true" (onClick)="openMerge()" />
            <p-button label="Datos" icon="pi pi-user-edit" severity="secondary" [outlined]="true" (onClick)="openDetails()" />
            <p-button label="Cancelar cuenta" icon="pi pi-times" severity="danger" [text]="true" (onClick)="openCancel()" />
          </div>
        }
      </header>

      @if (!isOpen()) {
        <p class="card p-4 mb-4 font-semibold" role="status">
          {{ t.status === 'CHARGED' ? 'Esta cuenta ya se cobró.' : t.status === 'MERGED' ? 'Esta cuenta se unió a otra.' : 'Esta cuenta se canceló.' }}
          <a routerLink="/app/mesas" class="text-brand underline ml-1">Volver a las mesas</a>
        </p>
      }

      @if (t.kind === 'DELIVERY' || t.customerName || t.notes) {
        <p class="text-sm mb-4 flex flex-wrap gap-x-4 gap-y-1">
          @if (t.customerName) { <span><span class="text-muted">Cliente:</span> {{ t.customerName }}</span> }
          @if (t.phone) { <span><span class="text-muted">Teléfono:</span> {{ t.phone }}</span> }
          @if (t.address) { <span><span class="text-muted">Dirección:</span> {{ t.address }}</span> }
          @if (t.notes) { <span><span class="text-muted">Notas:</span> {{ t.notes }}</span> }
        </p>
      }

      @if (isOpen()) {
        <!-- Celular: una cosa a la vez. -->
        <div class="flex gap-2 mb-3 lg:hidden" role="tablist" aria-label="Cuenta o productos">
          <button type="button" role="tab" class="seg" [attr.aria-selected]="pane() === 'tab'" (click)="pane.set('tab')">
            Cuenta ({{ cop(t.total) }})
          </button>
          <button type="button" role="tab" class="seg" [attr.aria-selected]="pane() === 'add'" (click)="pane.set('add')">
            Pedir{{ pending().length ? ' (' + pendingCount() + ')' : '' }}
          </button>
        </div>
      }

      <div [class]="isOpen() ? 'grid gap-4 lg:grid-cols-[1fr_24rem]' : 'grid gap-4 max-w-2xl'">
        @if (isOpen()) {
          <section class="min-h-[28rem] lg:h-[calc(100dvh-14rem)] flex flex-col lg:flex" [class.hidden]="pane() !== 'add'"
                   aria-label="Productos para pedir">
            <app-product-grid class="flex-1 min-h-0" [favoriteIds]="favorites()" (pick)="pick($event)"
                              (pickModel)="openModel($event)" (favoriteToggle)="toggleFavorite($event)" />
          </section>
        }

        <aside class="flex flex-col gap-3 lg:flex" [class.hidden]="isOpen() && pane() !== 'tab' && pending().length === 0"
               aria-label="Cuenta">
          @if (pending().length > 0) {
            <div class="card p-4 border-brand">
              <h2 class="font-bold mb-2">Por agregar</h2>
              <ul class="divide-y divide-line" aria-label="Productos por agregar">
                @for (p of pending(); track p.key) {
                  <li class="py-2 flex items-center gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold leading-tight truncate">{{ p.name }}</p>
                      @if (p.modifiers.length) { <p class="text-xs text-brand">{{ extrasOfPending(p) }}</p> }
                      @if (p.note) { <p class="text-xs italic text-muted">“{{ p.note }}”</p> }
                      <p class="text-xs text-muted">{{ cop(pendingPrice(p)) }} c/u</p>
                    </div>
                    <div class="flex items-center" role="group" [attr.aria-label]="'Cantidad de ' + p.name">
                      <button type="button" class="qty" [attr.aria-label]="'Uno menos de ' + p.name" (click)="step(p.key, -1)">
                        <i class="pi pi-minus" aria-hidden="true"></i>
                      </button>
                      <span class="min-w-7 text-center font-bold tabular-nums">{{ p.quantity }}</span>
                      <button type="button" class="qty" [attr.aria-label]="'Uno más de ' + p.name" (click)="step(p.key, 1)">
                        <i class="pi pi-plus" aria-hidden="true"></i>
                      </button>
                    </div>
                  </li>
                }
              </ul>
              <p-button styleClass="w-full min-h-12 mt-3 font-bold" icon="pi pi-check" [loading]="saving()"
                        [label]="'Agregar a la cuenta · ' + cop(pendingSum())" (onClick)="savePending()" />
            </div>
          }

          <div class="card p-4">
            <h2 class="font-bold mb-2">Pedido</h2>
            @if (items().length === 0) {
              <p class="text-sm text-muted py-4 text-center">Aún no hay productos. Toca los productos para pedirlos.</p>
            } @else {
              <ul class="divide-y divide-line" aria-label="Productos de la cuenta">
                @for (i of t.items; track i.id) {
                  <li class="py-2 flex items-start gap-2" [class.opacity-50]="i.voided">
                    <span class="font-bold tabular-nums w-8 shrink-0">{{ q(i.quantity) }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold leading-tight" [class.line-through]="i.voided">{{ i.name }}</p>
                      @if (i.modifiers.length) { <p class="text-xs text-brand">{{ extras(i) }}</p> }
                      @if (i.note) { <p class="text-xs italic text-muted">“{{ i.note }}”</p> }
                      <p class="text-xs text-muted">
                        @if (i.voided) {
                          Quitado por {{ i.voidedByName }}: {{ i.voidReason }}
                        } @else {
                          {{ i.addedByName }} · {{ time(i.addedAt) }}
                        }
                      </p>
                    </div>
                    <span class="tabular-nums font-semibold whitespace-nowrap">{{ cop(lineTotal(i)) }}</span>
                    @if (isOpen() && !i.voided) {
                      <button type="button" class="qty text-danger" [attr.aria-label]="'Quitar ' + i.name" (click)="askVoid(i)">
                        <i class="pi pi-trash" aria-hidden="true"></i>
                      </button>
                    }
                  </li>
                }
              </ul>
            }
            <p class="flex justify-between items-baseline mt-3 pt-3 border-t border-line">
              <span class="font-semibold">Total</span>
              <span class="text-2xl font-extrabold tracking-tight tabular-nums">{{ cop(t.total) }}</span>
            </p>
            <p class="text-xs text-muted">Con los precios de cuando se pidió; al cobrar se usa el precio vigente.</p>
            @if (isOpen() && canCharge()) {
              <p-button styleClass="w-full min-h-14 mt-3 text-lg font-bold" icon="pi pi-wallet" label="Cobrar"
                        [disabled]="items().length === 0 || pending().length > 0" (onClick)="charge()" />
              @if (pending().length > 0) {
                <p class="text-xs text-muted mt-1">Agrega lo pendiente antes de cobrar.</p>
              }
            }
          </div>
        </aside>
      </div>
    } @else if (notFound()) {
      <p class="card p-6" role="alert">No encontramos esta cuenta. <a routerLink="/app/mesas" class="text-brand underline">Volver a las mesas</a></p>
    } @else {
      <p-skeleton height="20rem" borderRadius="1.25rem" />
    }

    <!-- Precio libre -->
    <p-dialog header="Precio libre" [(visible)]="priceOpen" [modal]="true" [style]="{ width: '24rem' }" [breakpoints]="{ '640px': '100vw' }">
      @if (picking(); as p) {
        <form class="flex flex-col gap-3" (ngSubmit)="confirmPrice()">
          <p class="font-medium">{{ p.lookup.name }}</p>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">¿Cuánto cobras?</span>
            <input pInputText name="price" type="number" min="1" inputmode="numeric" class="h-12 text-xl text-right" [(ngModel)]="typedPrice" />
          </label>
          <div class="flex justify-end gap-2">
            <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="priceOpen = false" />
            <p-button type="submit" label="Seguir" [disabled]="!(typedPrice && typedPrice > 0)" />
          </div>
        </form>
      }
    </p-dialog>

    <!-- Adiciones -->
    <p-dialog [header]="picking()?.lookup?.name ?? 'Adiciones'" [(visible)]="modifiersOpen" [modal]="true"
              [style]="{ width: '40rem' }" [breakpoints]="{ '640px': '100vw' }">
      @if (picking(); as p) {
        <app-modifier-picker [groups]="p.groups" [basePrice]="p.basePrice" (picked)="modifiersPicked($event)"
                             (cancelled)="modifiersOpen = false" />
      }
    </p-dialog>

    <!-- Tallas -->
    <p-dialog [header]="model()?.name ?? 'Elegir talla'" [(visible)]="variantOpen" [modal]="true" [style]="{ width: '40rem' }"
              [breakpoints]="{ '640px': '100vw' }">
      @if (model(); as m) {
        <app-variant-picker [model]="m" (pick)="pickVariant($event)" />
      }
    </p-dialog>

    <!-- Quitar -->
    <app-form-dialog [(visible)]="voidOpen" [header]="'Quitar ' + (voiding()?.name ?? '')" width="26rem" submitLabel="Quitar"
                     submitIcon="pi pi-trash" [destructive]="true" [dirty]="reason.length > 0"
                     [invalidMessage]="reason.trim() ? null : 'Escribe el motivo.'" [save]="voidRequest"
                     successMessage="Producto quitado" (saved)="apply($event)">
      <div class="flex flex-col gap-1">
        <label for="void-reason" class="text-sm font-semibold">Motivo</label>
        <input pInputText id="void-reason" maxlength="200" placeholder="El cliente cambió de opinión" [(ngModel)]="reason" />
        <small class="text-muted">Queda en la cuenta tachado y en la auditoría.</small>
      </div>
    </app-form-dialog>

    <!-- Mover -->
    <p-dialog header="Mover a otra mesa" [(visible)]="moveOpen" [modal]="true" [style]="{ width: '32rem' }" [breakpoints]="{ '640px': '100vw' }">
      @if (freeTables().length === 0) {
        <p class="text-sm text-muted">No hay mesas libres.</p>
      }
      <div class="grid gap-2 grid-cols-3 sm:grid-cols-4">
        @for (f of freeTables(); track f.id) {
          <button type="button" class="pick" (click)="move(f.id)">
            <span class="font-extrabold">{{ f.name }}</span><span class="text-xs text-muted">{{ f.zone }}</span>
          </button>
        }
      </div>
    </p-dialog>

    <!-- Unir -->
    <p-dialog header="Unir otra cuenta a esta" [(visible)]="mergeOpen" [modal]="true" [style]="{ width: '32rem' }" [breakpoints]="{ '640px': '100vw' }">
      <p class="text-sm text-muted mb-3">Sus productos pasan a esta cuenta y su mesa queda libre.</p>
      @if (otherTabs().length === 0) {
        <p class="text-sm text-muted">No hay otras cuentas abiertas.</p>
      }
      <ul class="flex flex-col gap-2">
        @for (o of otherTabs(); track o.id) {
          <li>
            <button type="button" class="pick w-full flex-row justify-between" (click)="merge(o)">
              <span class="font-bold">{{ o.label }}</span><span class="tabular-nums">{{ cop(o.total) }}</span>
            </button>
          </li>
        }
      </ul>
    </p-dialog>

    <!-- Datos -->
    <app-form-dialog [(visible)]="detailsOpen" header="Datos de la cuenta" width="28rem" [dirty]="true"
                     [invalidMessage]="detailsProblem()" [save]="detailsRequest" successMessage="Datos guardados" (saved)="apply($event)">
      @if (tab()?.kind === 'TABLE') {
        <div class="flex flex-col gap-1">
          <label for="d-guests" class="text-sm font-semibold">Personas</label>
          <input pInputText id="d-guests" type="number" min="1" max="99" [(ngModel)]="details.guests" />
        </div>
      }
      <div class="flex flex-col gap-1">
        <label for="d-name" class="text-sm font-semibold">Nombre del cliente</label>
        <input pInputText id="d-name" maxlength="120" [(ngModel)]="details.customerName" />
      </div>
      @if (tab()?.kind !== 'TABLE') {
        <div class="flex flex-col gap-1">
          <label for="d-phone" class="text-sm font-semibold">Teléfono</label>
          <input pInputText id="d-phone" maxlength="30" [(ngModel)]="details.phone" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="d-address" class="text-sm font-semibold">Dirección</label>
          <input pInputText id="d-address" maxlength="200" [(ngModel)]="details.address" />
        </div>
      }
      <div class="flex flex-col gap-1">
        <label for="d-notes" class="text-sm font-semibold">Notas</label>
        <input pInputText id="d-notes" maxlength="200" [(ngModel)]="details.notes" />
      </div>
    </app-form-dialog>

    <!-- Cancelar -->
    <app-form-dialog [(visible)]="cancelOpen" header="Cancelar la cuenta" width="26rem" submitLabel="Cancelar cuenta"
                     submitIcon="pi pi-times" [destructive]="true" [dirty]="reason.length > 0"
                     [invalidMessage]="reason.trim() ? null : 'Escribe el motivo.'" [save]="cancelRequest"
                     successMessage="Cuenta cancelada" (saved)="cancelled()"
                     description="La mesa queda libre. Los productos no se cobran; todo queda en la auditoría.">
      <div class="flex flex-col gap-1">
        <label for="cancel-reason" class="text-sm font-semibold">Motivo</label>
        <input pInputText id="cancel-reason" maxlength="200" placeholder="Se fueron sin pedir" [(ngModel)]="reason" />
      </div>
    </app-form-dialog>
  `,
  styles: `
    .back, .qty {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      flex-shrink: 0;
      border-radius: 0.875rem;
    }
    .back:hover, .qty:hover { background: var(--surface-alt); }
    .glyph-tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 1.125rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-card);
    }
    .seg {
      flex: 1;
      min-height: 2.75rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-weight: 700;
    }
    .seg[aria-selected='true'] { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
    .pick {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.125rem;
      min-height: 3.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 1rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
    }
    .pick:hover { border-color: var(--brand); }
  `,
})
export class TabComponent implements OnInit, HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DiningApi);
  private readonly sales = inject(SalesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly modifiersApi = inject(ModifiersApi);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  protected readonly canCharge = permissionFlag('sales:create');
  protected readonly tab = signal<Tab | null>(null);
  protected readonly notFound = signal(false);
  protected readonly isOpen = computed(() => this.tab()?.status === 'OPEN');
  protected readonly items = computed(() => activeItems(this.tab()?.items ?? []));
  protected readonly pending = signal<PendingItem[]>([]);
  protected readonly pendingCount = computed(() => this.pending().reduce((n, p) => n + p.quantity, 0));
  protected readonly pendingSum = computed(() => pendingTotal(this.pending()));
  protected readonly pane = signal<'tab' | 'add'>('tab');
  protected readonly saving = signal(false);
  protected readonly favorites = signal<string[]>([]);
  private readonly modifierCatalog = signal<PosModifierCatalog | null>(null);
  private readonly floor = signal<Floor | null>(null);

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly glyph = kindGlyph;
  protected readonly extras = itemExtras;
  protected readonly lineTotal = itemTotal;
  protected readonly pendingPrice = pendingPrice;

  protected readonly picking = signal<Picking | null>(null);
  protected readonly model = signal<ProductModel | null>(null);
  protected readonly voiding = signal<TabItem | null>(null);
  protected priceOpen = false;
  protected modifiersOpen = false;
  protected variantOpen = false;
  protected voidOpen = false;
  protected moveOpen = false;
  protected mergeOpen = false;
  protected detailsOpen = false;
  protected cancelOpen = false;
  protected typedPrice: number | null = null;
  protected reason = '';
  protected details = { guests: null as number | null, customerName: '', phone: '', address: '', notes: '' };

  private id = '';

  /** Mesas libres de la sucursal (para mover). */
  protected readonly freeTables = computed(() => (this.floor()?.zones ?? [])
    .flatMap((z) => z.tables.filter((t) => t.tab === null).map((t) => ({ id: t.id, name: t.name, zone: z.name }))));

  /** Las demás cuentas abiertas (para unir). */
  protected readonly otherTabs = computed<TabSummary[]>(() => {
    const f = this.floor();
    if (!f) {
      return [];
    }
    const tabs = [...f.zones.flatMap((z) => z.tables.map((t) => t.tab)), ...f.others]
      .filter((t): t is TabSummary => t !== null);
    return tabs.filter((t) => t.id !== this.id);
  });

  /** Cerrar la pestaña con productos por agregar los perdería. */
  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.favorites.set(loadFavorites(this.auth.tenantId()));
    this.reload();
    if (this.auth.hasPermission('module:modifiers')) {
      this.modifiersApi.pos().subscribe({ next: (c) => this.modifierCatalog.set(c), error: () => undefined });
    }
  }

  hasUnsavedChanges(): boolean {
    return this.pending().length > 0;
  }

  private reload(): void {
    this.api.tab(this.id).subscribe({
      next: (t) => this.tab.set(t),
      error: () => this.notFound.set(true),
    });
  }

  protected apply(result: unknown): void {
    this.tab.set(result as Tab);
  }

  protected since(at: string): string {
    return openFor(at);
  }

  protected time(at: string): string {
    return new Date(at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  protected extrasOfPending(p: PendingItem): string {
    return modifierSummary(p);
  }

  // ------------------------------------------------------------------ pedir

  protected pick(product: Product): void {
    this.addById(product.id);
  }

  protected openModel(row: ProductModelRow): void {
    this.catalog.productModel(row.id).subscribe((m) => {
      this.model.set(m);
      this.variantOpen = true;
    });
  }

  protected pickVariant(variant: ProductVariant): void {
    this.variantOpen = false;
    this.addById(variant.productId);
  }

  protected toggleFavorite(product: Product): void {
    const next = toggleFavorite(this.favorites(), product.id);
    this.favorites.set(next);
    saveFavorites(this.auth.tenantId(), next);
  }

  private addById(productId: string): void {
    this.sales.price(productId, null, null).subscribe({
      next: (lookup) => {
        const picking: Picking = { lookup, basePrice: Number(lookup.price), groups: groupsFor(this.modifierCatalog(), productId) };
        this.picking.set(picking);
        if (lookup.openPrice) {
          this.typedPrice = Number(lookup.price) > 0 ? Number(lookup.price) : null;
          this.priceOpen = true;
          return;
        }
        this.continuePick(picking);
      },
      error: (e: unknown) => this.messages.add({ severity: 'warn', summary: 'No se pudo agregar', detail: problemMessage(e) }),
    });
  }

  protected confirmPrice(): void {
    const p = this.picking();
    if (!p || !(Number(this.typedPrice) > 0)) {
      return;
    }
    this.priceOpen = false;
    const next = { ...p, basePrice: Math.round(Number(this.typedPrice)) };
    this.picking.set(next);
    this.continuePick(next);
  }

  private continuePick(p: Picking): void {
    if (p.groups.length > 0) {
      this.modifiersOpen = true;
      return;
    }
    this.pushPending(p, { modifiers: [], note: '' });
  }

  protected modifiersPicked(pick: ModifierPick): void {
    this.modifiersOpen = false;
    const p = this.picking();
    if (p) {
      this.pushPending(p, pick);
    }
  }

  private pushPending(p: Picking, pick: ModifierPick): void {
    this.pending.update((list) => addPending(list, {
      productId: p.lookup.productId, unitId: p.lookup.unitId, name: p.lookup.name, quantity: 1, basePrice: p.basePrice,
      openPrice: p.lookup.openPrice === true, modifiers: pick.modifiers, note: pick.note,
    }));
    this.picking.set(null);
  }

  protected step(key: string, delta: number): void {
    this.pending.update((list) => stepPending(list, key, delta));
  }

  protected savePending(): void {
    if (this.pending().length === 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.addItems(this.id, toItemInputs(this.pending())).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (t) => {
        this.tab.set(t);
        this.pending.set([]);
        this.pane.set('tab');
        this.messages.add({ severity: 'success', summary: 'Agregado a la cuenta', life: 2000 });
      },
      error: (e: unknown) => this.messages.add({ severity: 'error', summary: 'No se agregó', detail: problemMessage(e) }),
    });
  }

  // ------------------------------------------------------------------ quitar, mover, unir, datos, cancelar

  protected askVoid(item: TabItem): void {
    this.voiding.set(item);
    this.reason = '';
    this.voidOpen = true;
  }

  protected readonly voidRequest = (): Observable<Tab> =>
    this.api.voidItem(this.id, this.voiding()?.id ?? '', this.reason.trim());

  protected openMove(): void {
    this.loadFloor();
    this.moveOpen = true;
  }

  protected openMerge(): void {
    this.loadFloor();
    this.mergeOpen = true;
  }

  private loadFloor(): void {
    this.floor.set(null);
    this.api.floor(this.tab()?.branchId ?? null).subscribe((f) => this.floor.set(f));
  }

  protected move(tableId: string): void {
    this.api.move(this.id, tableId).subscribe({
      next: (t) => {
        this.moveOpen = false;
        this.tab.set(t);
        this.messages.add({ severity: 'success', summary: `Ahora es ${t.label}`, life: 2500 });
      },
      error: (e: unknown) => this.messages.add({ severity: 'error', summary: 'No se movió', detail: problemMessage(e) }),
    });
  }

  protected merge(other: TabSummary): void {
    this.api.merge(this.id, other.id).subscribe({
      next: (t) => {
        this.mergeOpen = false;
        this.tab.set(t);
        this.messages.add({ severity: 'success', summary: `${other.label} se unió a esta cuenta`, life: 2500 });
      },
      error: (e: unknown) => this.messages.add({ severity: 'error', summary: 'No se unieron', detail: problemMessage(e) }),
    });
  }

  protected openDetails(): void {
    const t = this.tab();
    this.details = {
      guests: t?.guests ?? null, customerName: t?.customerName ?? '', phone: t?.phone ?? '', address: t?.address ?? '',
      notes: t?.notes ?? '',
    };
    this.detailsOpen = true;
  }

  protected detailsProblem(): string | null {
    if (this.tab()?.kind === 'DELIVERY' && !this.details.address.trim()) {
      return 'Escribe la dirección del domicilio.';
    }
    const g = this.details.guests;
    return g !== null && !(g >= 1 && g <= 99) ? 'Las personas van de 1 a 99.' : null;
  }

  protected readonly detailsRequest = (): Observable<Tab> => this.api.updateTab(this.id, {
    guests: this.details.guests || null,
    customerName: this.details.customerName.trim() || null,
    phone: this.details.phone.trim() || null,
    address: this.details.address.trim() || null,
    notes: this.details.notes.trim() || null,
  });

  protected openCancel(): void {
    this.reason = '';
    this.cancelOpen = true;
  }

  protected readonly cancelRequest = (): Observable<Tab> => this.api.cancel(this.id, this.reason.trim());

  protected cancelled(): void {
    this.pending.set([]);
    void this.router.navigate(['/app/mesas']);
  }

  // ------------------------------------------------------------------ cobrar

  /** El cobro se hace en Vender, con la caja abierta y el diálogo de pago de siempre. */
  protected charge(): void {
    void this.router.navigate(['/pos'], { queryParams: { cuenta: this.id } });
  }
}
