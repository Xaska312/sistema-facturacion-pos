import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  DEPOSIT_METHOD_CODE,
  CashSession,
  CreditAccount,
  Party,
  PaymentMethod,
  PosConfig,
  Product,
  ProductLookup,
  ProductModel,
  ProductVariant,
  Sale,
  SaleInput,
  StockRow,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { CreditApi } from '../../core/api/credit.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { PartiesApi } from '../../core/api/parties.api';
import { SalesApi, newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { OnlineService } from '../../core/network/online.service';
import { ConfirmService } from '../../shared/confirm';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { BrandingService } from '../../core/theme/branding.service';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { ReceiptWidth, loadReceiptWidth, printReceipt, saveReceiptWidth } from '../../shared/receipt/receipt-prefs';
import { saleWhatsAppLink } from '../sales/sale-text';
import { TourService } from '../../shared/tour/tour.service';
import { CartPanelComponent, LineDiscountChange, LinePriceChange, LineQuantityChange, RemovedLine } from './cart-panel.component';
import { loadFavorites, saveFavorites, toggleFavorite } from './favorites';
import {
  HELD_TTL_DAYS,
  HeldSale,
  MAX_HELD,
  defaultHoldLabel,
  heldAge,
  heldKey,
  loadHeld,
  newHeldSale,
  saveHeld,
} from './held-sales';
import { NewCustomerDialogComponent } from './new-customer-dialog.component';
import { OpenCashComponent } from './open-cash.component';
import { POS_SHORTCUTS, methodIcon, methodLabel } from './pos-labels';
import { POS_TOUR } from './pos-tour';
import { PosHeaderComponent } from './pos-header.component';
import { ProductGridComponent } from './product-grid.component';
import { SearchRow, groupSearchResults, searchRows } from './pos-cards';
import { VariantPickerComponent } from './variant-picker.component';
import {
  CartLine,
  PaymentDraft,
  PaymentSummary,
  cartTotals,
  cashSuggestions,
  parseScan,
  paymentsMissingReference,
  quantity4,
  quantityForAmount,
  stockShortages,
  summarizePayments,
} from './sale-math';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';
import { documentShortLabel } from '../../shared/document-types';

interface CustomerChoice {
  id: string;
  name: string;
  document: string;
  priceListId: string | null;
}

/** Vender productos de precio libre escribiendo el precio (decisión 253). */
const OPEN_PRICE_PERMISSION = 'sales:open-price';

/** Páginas de existencias que se cargan como máximo (100 productos con inventario cada una). */
const STOCK_PAGES = 5;

/**
 * Pantalla de venta, pensada para tablet horizontal (1024×768) y también para escritorio con lector de códigos.
 * Izquierda: código/lector, categorías y cuadrícula de productos. Derecha: carrito, totales y Cobrar.
 * En el celular (menos de 768 px) el carrito queda debajo: arriba hay un campo grande para buscar por nombre y abajo
 * una barra fija con el total y Cobrar. "Pausar venta" guarda el carrito en este equipo (held-sales.ts).
 * El lector actúa como teclado + Enter sobre el campo de código, que recupera el foco solo.
 * Atajos: F2 buscar por nombre, F4 cobrar, Enter registrar / nueva venta, Esc cancelar, ? ver atajos.
 */
@Component({
  selector: 'app-pos',
  imports: [FormsModule, PesosInputDirective, ButtonModule, DialogModule, InputTextModule, SkeletonModule, HasPermissionDirective,
    ReceiptComponent, PosHeaderComponent, ProductGridComponent, CartPanelComponent, OpenCashComponent,
    VariantPickerComponent, NewCustomerDialogComponent],
  template: `
    <div class="min-h-dvh md:h-dvh flex flex-col bg-ground">
      <app-pos-header [businessName]="config()?.businessName ?? ''" [session]="session()"
                      [userName]="auth.user()?.fullName ?? ''" [online]="online()" (help)="openHelp()" />

      @if (sessionError()) {
        <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
          <i class="pi pi-wifi text-3xl text-muted" aria-hidden="true"></i>
          <p class="font-medium">No pudimos revisar tu caja.</p>
          <p class="text-sm text-muted">Revisa la conexión y vuelve a intentarlo.</p>
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="loadSession()" />
        </div>
      } @else if (session() === undefined) {
        <div class="flex-1 flex items-center justify-center p-6" aria-busy="true">
          <p-skeleton width="20rem" height="12rem" borderRadius="0.75rem" />
        </div>
      } @else if (session() === null) {
        <app-open-cash class="flex-1 overflow-auto" (opened)="cashOpened($event)" />
      } @else {
        <div class="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3">
          <section class="h-[55dvh] md:h-auto md:flex-1 min-w-0 min-h-0 flex flex-col gap-2" aria-label="Productos">
            <!-- Celular: buscar por nombre a la vista (no hay F2). El envoltorio lleva md:hidden porque .phone-search
                 fija su propio display. -->
            <div class="md:hidden shrink-0">
              <button type="button" class="phone-search" (click)="openSearch()">
                <i class="pi pi-search" aria-hidden="true"></i>
                <span>Buscar producto por nombre o código</span>
              </button>
            </div>
            <div class="flex gap-2 shrink-0">
              <div class="relative flex-1 min-w-0" data-tour="scanner">
                <i class="pi pi-barcode absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-muted" aria-hidden="true"></i>
                <input #scanner pInputText class="scanner-input w-full h-12" [(ngModel)]="code" (keydown.enter)="scan()"
                       (blur)="keepFocus()" autocomplete="off" aria-label="Código de barras o SKU"
                       [attr.inputmode]="keyboard() ? null : 'none'"
                       placeholder="Escanea o escribe el código / SKU y Enter (3*código = 3 unidades)" />
              </div>
              @if (coarsePointer) {
                <button type="button" class="tool-btn" [attr.aria-pressed]="keyboard()"
                        title="Mostrar el teclado en pantalla al tocar el campo de código" (click)="toggleKeyboard()">
                  <i class="pi pi-pencil" aria-hidden="true"></i><span class="hidden sm:inline">Teclado</span>
                  <span class="sr-only sm:hidden">Mostrar teclado para escribir el código</span>
                </button>
              }
              <!-- En el celular ya está el campo grande de búsqueda (el envoltorio oculta, .tool-btn fija display). -->
              <div class="hidden md:flex">
                <button type="button" class="tool-btn" (click)="openSearch()">
                  <i class="pi pi-search" aria-hidden="true"></i>Buscar (F2)
                </button>
              </div>
              @if (held().length > 0) {
                <button type="button" class="tool-btn" [attr.aria-label]="'Ventas en espera: ' + held().length"
                        (click)="openHeld()">
                  <i class="pi pi-clock" aria-hidden="true"></i>En espera
                  <span class="held-count" aria-hidden="true">{{ held().length }}</span>
                </button>
              }
            </div>
            <app-product-grid class="flex-1" data-tour="products" [favoriteIds]="favorites()" [stock]="stock()"
                              (pick)="pickProduct($event)" (pickModel)="openModel($event.id)"
                              (favoriteToggle)="toggleFavorite($event)" />
          </section>

          <app-cart-panel id="pos-cart" class="md:w-[22rem] lg:w-[26rem] shrink-0 scroll-mt-3" data-tour="cart"
                          [lines]="lines()" [totals]="totals()"
                          [pricesIncludeTax]="config()?.pricesIncludeTax ?? true" [shortages]="shortages()"
                          [maxDiscount]="maxDiscount()" [decimalUnits]="decimalUnits()" [customerName]="customer().name"
                          [canCharge]="lines().length > 0" [lastSaleNumber]="lastSale()?.documentNumber ?? null"
                          (quantityChange)="setQuantity($event)" (discountChange)="setDiscount($event)"
                          (priceChange)="setPrice($event)"
                          (removeLine)="removeLine($event)" (restoreLine)="restoreLine($event)"
                          (charge)="openPayment()" (cancelSale)="cancelSale()" (customer)="openCustomers()"
                          (hold)="openHold()" (reprint)="receiptOpen = true" />
        </div>

        <!-- Celular: el carrito queda debajo de los productos; el total y Cobrar siempre a la mano. -->
        @if (lines().length > 0) {
          <div class="h-24 md:hidden" aria-hidden="true"></div>
          <div class="md:hidden">
            <div class="phone-bar" role="region" aria-label="Total de la venta">
              <button type="button" class="phone-bar-summary" (click)="showCart()">
                <span class="text-xs text-muted">{{ q(totals().items) }} art. · Ver venta</span>
                <span class="text-xl font-semibold tabular-nums">{{ cop(totals().total) }}</span>
              </button>
              <p-button label="Cobrar" icon="pi pi-wallet" styleClass="min-h-12 px-5 font-semibold"
                        (onClick)="openPayment()" />
            </div>
          </div>
        }
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
        @for (row of searchRows(); track row.kind + row.id) {
          <li>
            @if (row.kind === 'model') {
              @let m = row;
              <button type="button" class="w-full min-h-11 text-left p-2 hover:bg-surface-alt flex justify-between gap-2"
                      (click)="openModel(m.id)">
                <span>{{ m.name }} <span class="text-xs text-brand">· elegir talla</span></span>
                <span class="text-muted whitespace-nowrap">{{ cop(m.salePrice) }}</span>
              </button>
            } @else {
              @let p = row.product;
              <button type="button" class="w-full min-h-11 text-left p-2 hover:bg-surface-alt flex justify-between gap-2"
                      (click)="pickProduct(p)">
                <span><span class="font-mono text-xs text-muted">{{ p.sku }}</span> {{ p.name }}</span>
                <span class="text-muted whitespace-nowrap">{{ p.openPrice ? 'Precio libre' : cop(p.salePrice) }}</span>
              </button>
            }
          </li>
        } @empty {
          <li class="p-2 text-sm text-muted">{{ searched() ? 'Sin resultados.' : 'Escribe y pulsa Enter.' }}</li>
        }
      </ul>
    </p-dialog>

    <!-- Precio libre (decisión 253): impresiones, anillados, servicios -->
    <p-dialog header="Precio libre" [(visible)]="openPriceOpen" [modal]="true" [style]="{ width: '24rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focusOpenPrice()" (onHide)="openPriceClosed()">
      @if (openPriceItem(); as item) {
        <form class="flex flex-col gap-3" (ngSubmit)="confirmOpenPrice()">
          <p class="font-medium">{{ item.found.name }}</p>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">¿Cuánto cobras por {{ item.found.unitCode }}?</span>
            <input id="open-price" appPesos name="openPrice" autocomplete="off"
                   class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums" [(ngModel)]="openPriceValue" />
          </label>
          @if (item.quantity !== 1) {
            <p class="text-sm text-muted">Cantidad: {{ q(item.quantity) }} {{ item.found.unitCode }}</p>
          }
          <div class="flex justify-end gap-2">
            <p-button label="Cancelar" [text]="true" severity="secondary" styleClass="min-h-11" (onClick)="openPriceOpen = false" />
            <p-button type="submit" label="Agregar" icon="pi pi-plus" styleClass="min-h-11"
                      [disabled]="!(openPriceValue && openPriceValue > 0)" />
          </div>
        </form>
      }
    </p-dialog>

    <!-- Talla de un modelo (fase 8d) -->
    <p-dialog [header]="variantModel()?.name ?? 'Elegir talla'" [(visible)]="variantOpen" [modal]="true"
              [style]="{ width: '40rem' }" [breakpoints]="{ '640px': '100vw' }" (onHide)="focusScanner()">
      @if (variantModel(); as m) {
        <app-variant-picker [model]="m" [stockMap]="stock()" (pick)="pickVariant($event)" />
      }
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
              <span class="text-sm text-muted"> · {{ docShort(c.documentType) }} {{ c.formattedDocument }}</span>
              @if (c.priceListName) {
                <span class="text-xs text-brand"> · {{ c.priceListName }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="p-2 text-sm text-muted">Busca un cliente registrado.</li>
        }
      </ul>
      <div class="mt-3 flex flex-wrap justify-between items-center gap-2">
        <p-button label="Consumidor final" [text]="true" styleClass="min-h-11" (onClick)="resetCustomer()" />
        <p-button *hasPermission="'parties:manage'" label="Registrar cliente nuevo" icon="pi pi-user-plus"
                  [outlined]="true" styleClass="min-h-11" (onClick)="openNewCustomer()" />
      </div>
      <p class="text-xs text-muted mt-2">Registrar un cliente no borra lo que llevas en la venta.</p>
    </p-dialog>

    <!-- Cliente nuevo sin salir de la venta -->
    <app-new-customer-dialog [visible]="newCustomerOpen" (visibleChange)="newCustomerVisible($event)"
                             (created)="customerCreated($event)" />

    <!-- Pausar venta -->
    <p-dialog header="Pausar venta" [(visible)]="holdOpen" [modal]="true" [style]="{ width: '28rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focusHoldLabel()" (onHide)="focusScanner()">
      <form class="flex flex-col gap-3" (ngSubmit)="confirmHold()">
        <p class="text-sm text-muted">
          La venta queda guardada en este equipo para que atiendas a otro cliente. La retomas desde "En espera".
        </p>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre para reconocerla</span>
          <input #holdLabelInput pInputText name="holdLabel" class="h-11" maxlength="60" autocomplete="off"
                 [(ngModel)]="holdLabel" />
        </label>
        <div class="flex justify-end gap-2">
          <p-button label="Volver" [text]="true" severity="secondary" styleClass="min-h-11" (onClick)="holdOpen = false" />
          <p-button type="submit" label="Pausar venta" icon="pi pi-pause" styleClass="min-h-11" />
        </div>
      </form>
    </p-dialog>

    <!-- Ventas en espera -->
    <p-dialog header="Ventas en espera" [(visible)]="heldOpen" [modal]="true" [style]="{ width: '34rem' }"
              [breakpoints]="{ '640px': '100vw' }" (onHide)="focusScanner()">
      <ul class="divide-y" aria-label="Ventas en espera">
        @for (h of held(); track h.id) {
          <li class="py-2 flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ h.label }}</p>
              <p class="text-sm text-muted">{{ heldSummary(h) }}</p>
            </div>
            <p-button label="Retomar" icon="pi pi-play" styleClass="min-h-11" (onClick)="resumeHeld(h)" />
            <button type="button" class="icon-btn text-danger" [attr.aria-label]="'Descartar ' + h.label"
                    (click)="discardHeld(h)">
              <i class="pi pi-trash" aria-hidden="true"></i>
            </button>
          </li>
        } @empty {
          <li class="py-2 text-sm text-muted">No hay ventas en espera.</li>
        }
      </ul>
      <p class="text-xs text-muted mt-3">
        Se guardan en este equipo para tu usuario durante {{ heldDays }} días. Al retomar una venta se actualizan los
        precios. Si tienes otra venta abierta, esa queda en espera.
      </p>
    </p-dialog>

    <!-- Cobro (F4) -->
    <p-dialog header="Cobrar" [(visible)]="payOpen" [modal]="true" [style]="{ width: '40rem' }"
              [closable]="!saving()" [closeOnEscape]="!saving()"
              [breakpoints]="{ '640px': '100vw' }" (onShow)="focusPayment()" (onHide)="focusScanner()">
      <p class="text-center text-sm text-muted">Total a cobrar</p>
      <p class="text-5xl font-bold text-center tabular-nums mb-4">{{ cop(totals().total) }}</p>

      <div class="flex items-center justify-between gap-2 mb-2">
        <p id="pay-methods" class="text-sm font-medium">{{ mixed ? 'Agregar otro medio' : 'Medio de pago' }}</p>
        @if (payMethods().length > 1) {
          <button type="button" class="tool-btn" [attr.aria-pressed]="mixed" (click)="setMixed(!mixed)">
            <i class="pi pi-clone" aria-hidden="true"></i>Pago mixto
          </button>
        }
      </div>
      <div class="grid grid-cols-3 gap-2 mb-4" role="group" aria-labelledby="pay-methods">
        @for (m of payMethods(); track m.id) {
          <button type="button" class="method-btn" [attr.aria-pressed]="mixed ? null : selectedMethod() === m.id"
                  (click)="chooseMethod(m)">
            <i [class]="methodIcon(m.code) + ' text-2xl'" aria-hidden="true"></i>
            <span>{{ mixed ? '+ ' : '' }}{{ methodLabel(m.code, m.name) }}</span>
            @if (m.code === creditCode && customerCredit(); as credit) {
              <span class="text-xs text-muted">Disponible {{ cop(credit.available) }}</span>
            }
          </button>
        }
      </div>
      @if (customerCredit(); as credit) {
        @if (credit.balance > 0) {
          <p class="text-sm text-muted -mt-2 mb-3">{{ customer().name }} debe {{ cop(credit.balance) }} de fiado.</p>
        }
      }

      @let missingRefs = missingReferences();
      @for (p of payments; track $index; let i = $index) {
        <div class="flex flex-wrap gap-2 items-center mb-2">
          <label [for]="'pay-' + i" class="w-32 text-sm font-medium flex items-center gap-2">
            <i [class]="methodIcon(methodCode(p.methodId))" aria-hidden="true"></i>{{ methodShortName(p.methodId) }}
          </label>
          <input appPesos
                 class="h-12 w-40 border rounded-lg px-3 text-xl text-right tabular-nums"
                 [id]="'pay-' + i" [(ngModel)]="p.amount" (keydown)="trackAmountTyping($event, p)"
                 (keydown.enter)="confirmFromAmount(p)" />
          @if (!p.affectsCash && methodCode(p.methodId) !== creditCode) {
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
          Tarjeta, transferencia o fiado no pueden superar el total: el cambio solo se da en efectivo.
        </p>
      }
      @if (creditProblem(); as problem) {
        <p class="text-danger text-sm mt-2" role="alert">{{ problem }}</p>
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
        <p-button label="Volver" [text]="true" severity="secondary" styleClass="min-h-11" [disabled]="saving()"
                  (onClick)="payOpen = false" />
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
            <app-receipt [sale]="sale" [width]="width()" [logo]="brandLogo()" />
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
          @if (lastSale(); as sale) {
            <a pButton label="WhatsApp" icon="pi pi-whatsapp" severity="secondary" [outlined]="true" class="min-h-11"
               target="_blank" rel="noopener noreferrer" [href]="saleWhatsApp(sale)"
               aria-label="Enviar el recibo por WhatsApp (abre WhatsApp)"></a>
          }
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
      <p class="text-sm text-muted mt-3">En tablet o celular, toca los productos de la lista o usa "Buscar producto";
        tocar una línea del carrito permite cambiar la cantidad o el descuento. "Pausar venta" la guarda para atender
        a otro cliente.</p>
      @if (session()) {
        <p-button label="Ver recorrido guiado" icon="pi pi-directions" [outlined]="true" styleClass="min-h-11 mt-4"
                  (onClick)="replayTour()" />
      }
    </p-dialog>

    @if (lastSale(); as sale) {
      <app-receipt class="receipt-print-root" [sale]="sale" [width]="width()" [logo]="brandLogo()" />
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
    .bill-btn:hover,
    .phone-search:hover {
      border-color: var(--brand);
    }
    /* Celular: parece un campo de búsqueda y abre la búsqueda por nombre. */
    .phone-search {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      width: 100%;
      min-height: 3.25rem;
      padding: 0 1rem;
      border-radius: 0.75rem;
      border: 2px solid var(--brand);
      background: var(--surface);
      color: var(--text-muted);
      font-size: 1rem;
      text-align: left;
    }
    .phone-search .pi {
      color: var(--brand);
      font-size: 1.125rem;
    }
    .held-count {
      min-width: 1.5rem;
      height: 1.5rem;
      padding: 0 0.375rem;
      border-radius: 9999px;
      background: var(--brand);
      color: var(--brand-contrast);
      font-size: 0.75rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    /* Celular: total y Cobrar fijos abajo (el carrito queda debajo de los productos). */
    .phone-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem calc(0.625rem + env(safe-area-inset-bottom));
      background: var(--surface);
      border-top: 1px solid var(--surface-border);
    }
    .phone-bar-summary {
      flex: 1;
      min-width: 0;
      min-height: 3rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      text-align: left;
    }
  `,
})
export class PosComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  /** Logo para el tiquete (fase 8c). */
  protected readonly brandLogo = inject(BrandingService).logo;
  protected readonly auth = inject(AuthService);
  private readonly cash = inject(CashApi);
  private readonly sales = inject(SalesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly parties = inject(PartiesApi);
  private readonly credit = inject(CreditApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmService);
  protected readonly online = inject(OnlineService).online;
  private readonly tours = inject(TourService);
  private tourTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly scanner = viewChild<ElementRef<HTMLInputElement>>('scanner');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly customerSearch = viewChild<ElementRef<HTMLInputElement>>('customerSearch');
  private readonly holdLabelInput = viewChild<ElementRef<HTMLInputElement>>('holdLabelInput');
  private readonly cart = viewChild(CartPanelComponent);
  private readonly newCustomer = viewChild(NewCustomerDialogComponent);

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly heldDays = HELD_TTL_DAYS;
  protected readonly docShort = documentShortLabel;
  protected readonly methodIcon = methodIcon;
  protected readonly methodLabel = methodLabel;
  protected readonly creditCode = CREDIT_METHOD_CODE;
  protected readonly shortcuts = POS_SHORTCUTS;
  /** Tablet o teléfono: el campo de código no abre el teclado en pantalla salvo que se pida (el lector no lo usa). */
  protected readonly coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  protected readonly keyboard = signal(!this.coarsePointer);

  protected readonly config = signal<PosConfig | null>(null);
  /** {@code undefined} mientras carga; {@code null} sin caja abierta. */
  protected readonly session = signal<CashSession | null | undefined>(undefined);
  protected readonly sessionError = signal(false);
  /** Búsquedas de códigos en curso: F4 espera a que terminen (si no, el último producto llega con el cobro abierto). */
  private pendingLookups = 0;
  private payWhenReady = false;
  /** Ritmo de tecleo en el monto del cobro, para reconocer una lectura del lector (QA UI-2). */
  private amountTyping = { start: 0, last: 0, count: 0, before: null as number | null };
  protected readonly methods = signal<PaymentMethod[]>([]);
  /** Cuenta de fiado del cliente de la venta (decisión 255); null = Consumidor final, sin permiso o sin datos. */
  protected readonly customerCredit = signal<CreditAccount | null>(null);
  /** "Fiado" solo aparece si el cliente tiene cupo. */
  protected readonly payMethods = computed(() => {
    const credit = this.customerCredit();
    const canCredit = credit !== null && credit.creditLimit > 0;
    // "Anticipo" solo lo usa la entrega de pedidos (decisión 258).
    return this.methods().filter((m) => m.code !== DEPOSIT_METHOD_CODE && (m.code !== CREDIT_METHOD_CODE || canCredit));
  });
  protected readonly lines = signal<CartLine[]>([]);
  protected readonly customer = signal<CustomerChoice>({ id: '', name: 'Consumidor final', document: '222222222222', priceListId: null });
  /** Resultados de F2: productos y modelos con tallas (una fila por modelo, fase 8d). */
  protected readonly searchRows = signal<SearchRow[]>([]);
  protected readonly variantModel = signal<ProductModel | null>(null);
  protected readonly searched = signal(false);
  protected readonly customerResults = signal<Party[]>([]);
  protected readonly saving = signal(false);
  protected readonly lastSale = signal<Sale | null>(null);
  protected readonly width = signal<ReceiptWidth>(loadReceiptWidth());
  protected readonly favorites = signal<string[]>(loadFavorites(this.auth.tenantId()));
  /** Ventas pausadas de este usuario en este equipo. */
  readonly held = signal<HeldSale[]>(loadHeld(this.auth.tenantId(), this.auth.user()?.id ?? null));
  /** Existencia por producto en la sucursal de la caja (solo con inventory:read). */
  protected readonly stock = signal<ReadonlyMap<string, number>>(new Map());
  /** Unidades que admiten decimales: solo ahí se ofrece "vender por valor" (fase 8e). */
  protected readonly decimalUnits = signal<ReadonlySet<string>>(new Set());

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
  protected variantOpen = false;
  protected customerOpen = false;
  protected payOpen = false;
  protected receiptOpen = false;
  protected helpOpen = false;
  holdOpen = false;
  heldOpen = false;
  newCustomerOpen = false;
  holdLabel = '';
  /** Precio libre: el producto que espera su precio y lo que se va escribiendo. */
  readonly openPriceItem = signal<{ found: ProductLookup; quantity: number } | null>(null);
  openPriceOpen = false;
  openPriceValue: number | null = null;
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
    this.loadSession();
    this.cash.paymentMethods().subscribe((methods) => this.methods.set(methods));
    this.catalog.units().subscribe((units) =>
      this.decimalUnits.set(new Set(units.filter((u) => u.allowsDecimals).map((u) => u.id))));
  }

  /**
   * Caja abierta del usuario. Un error (sin conexión, servidor reiniciando) no es "sin caja": antes mostraba "Abrir
   * caja", el servidor la rechazaba porque ya estaba abierta y el cajero quedaba atascado (QA UI-5).
   */
  loadSession(): void {
    this.sessionError.set(false);
    this.session.set(undefined);
    this.cash.current().subscribe({
      next: (session) => {
        this.session.set(session);
        if (session) {
          this.loadStock(session.branchId);
          this.focusScanner();
          this.offerTour();
        }
      },
      error: () => this.sessionError.set(true),
    });
  }

  /** Carrito con productos: salir de "Vender" o cerrar la pestaña lo perdería (QA UI-7). */
  hasUnsavedChanges(): boolean {
    return this.lines().length > 0;
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
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
    this.offerTour();
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
    this.pendingLookups++;
    this.sales.lookup(parsed.code, this.customer().priceListId)
      .pipe(finalize(() => this.lookupDone()))
      .subscribe({
        // Etiqueta de báscula (fase 8e): la cantidad viene en el código (peso, o precio ÷ precio del producto).
        next: (found) => this.addScanned(found, parsed.quantity),
        error: (error: unknown) => {
          this.payWhenReady = false; // el producto no llegó: no se abre el cobro solo
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

  /**
   * Lo leído por el lector. Etiqueta de báscula (fase 8e): con peso, esa es la cantidad; con precio, la cantidad que
   * cobra ese valor con el IVA del producto.
   */
  private addScanned(found: ProductLookup, multiplier: number): void {
    if (found.openPrice) {
      this.addLine(found, multiplier);
      return;
    }
    if (found.scaleAmount) {
      const quantity = quantityForAmount(Number(found.scaleAmount), Number(found.price), 0, Number(found.taxRate),
        this.config()?.pricesIncludeTax ?? true);
      if (quantity === null) {
        this.messages.add({ severity: 'warn', summary: 'Sin precio', detail: `${found.name} no tiene precio de venta.` });
        this.focusScanner();
        return;
      }
      this.addLine(found, quantity4(quantity * multiplier));
      return;
    }
    this.addLine(found, found.scaleQuantity ? quantity4(Number(found.scaleQuantity) * multiplier) : multiplier);
  }

  /** Agrega el producto; uno de precio libre (decisión 253) primero pide el precio. */
  addLine(found: ProductLookup, quantity: number): void {
    if (found.openPrice) {
      if (!this.auth.hasPermission(OPEN_PRICE_PERMISSION)) {
        this.messages.add({
          severity: 'warn',
          summary: 'Producto de precio libre',
          detail: `Tu usuario no puede vender ${found.name}: pídele el permiso al dueño del negocio.`,
        });
        this.focusScanner();
        return;
      }
      this.askOpenPrice(found, quantity);
      return;
    }
    this.pushLine(found, quantity, Number(found.price));
  }

  private pushLine(found: ProductLookup, quantity: number, unitPrice: number): void {
    // Cada línea de precio libre va aparte: dos impresiones pueden tener precios distintos.
    const key = found.openPrice
      ? `${found.productId}|${found.unitId}|${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      : `${found.productId}|${found.unitId}`;
    this.updateLines((list) => {
      const existing = list.findIndex((l) => l.key === key);
      if (existing >= 0) {
        return list.map((l, i) => (i === existing ? { ...l, quantity: quantity4(l.quantity + quantity) } : l));
      }
      return [...list, {
        key, productId: found.productId, sku: found.sku, name: found.name, unitId: found.unitId,
        unitCode: found.unitCode, quantity: quantity4(quantity), unitPrice, discountPercent: 0,
        taxRate: Number(found.taxRate), trackInventory: found.trackInventory, factor: Number(found.factor) || 1,
        ...(found.openPrice ? { openPrice: true } : {}),
      }];
    });
    this.focusScanner();
  }

  // ---------------------------------------------------------------- precio libre

  private askOpenPrice(found: ProductLookup, quantity: number): void {
    this.openPriceItem.set({ found, quantity });
    this.openPriceValue = Number(found.price) > 0 ? Number(found.price) : null;
    this.openPriceOpen = true;
  }

  confirmOpenPrice(): void {
    const item = this.openPriceItem();
    const price = Number(this.openPriceValue);
    if (!item || !(price > 0)) {
      return;
    }
    this.openPriceItem.set(null);
    this.openPriceOpen = false;
    this.pushLine(item.found, item.quantity, Math.round(price * 100) / 100);
  }

  openPriceClosed(): void {
    this.openPriceItem.set(null);
    this.focusScanner();
  }

  focusOpenPrice(): void {
    setTimeout(() => {
      const input = document.getElementById('open-price') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  /** Precio de una línea de precio libre, cambiado en el editor del carrito. */
  setPrice(change: LinePriceChange): void {
    if (!(change.unitPrice > 0)) {
      return;
    }
    this.updateLines((list) => list.map((l) => (l.key === change.key && l.openPrice ? { ...l, unitPrice: change.unitPrice } : l)));
    this.focusScanner();
  }

  setQuantity(change: LineQuantityChange): void {
    const quantity = quantity4(change.quantity);
    if (!(quantity > 0)) {
      return;
    }
    this.updateLines((list) => list.map((l) => (l.key === change.key ? { ...l, quantity } : l)));
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
        return list.map((l) => (l.key === removed.line.key ? { ...l, quantity: quantity4(l.quantity + removed.line.quantity) } : l));
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
    this.searchRows.set([]);
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
    // Productos sin tallas y modelos por nombre (una fila por modelo, aunque tenga muchas tallas). Si no hay nada, se
    // busca entre las tallas (p. ej. el SKU o el código de una talla) y se juntan por modelo.
    forkJoin({
      products: this.catalog.products({ page: 0, size: 20, search: text, includeVariants: false }),
      models: this.catalog.productModels({ page: 0, size: 10, search: text }),
    }).pipe(
      switchMap(({ products, models }) => {
        const rows = searchRows(products.content.filter((p) => p.active), models.content.filter((m) => m.active));
        return rows.length > 0 ? of(rows)
          : this.catalog.products({ page: 0, size: 20, search: text })
            .pipe(map((page) => groupSearchResults(page.content.filter((p) => p.active))));
      }),
    ).subscribe((rows) => {
      this.searchRows.set(rows);
      this.searched.set(true);
    });
  }

  /** Desde la cuadrícula o la búsqueda: el precio lo calcula el servidor para el cliente de la venta. */
  pickProduct(product: Product): void {
    this.addById(product.id);
  }

  /** Un modelo con tallas (cuadrícula o búsqueda): se abre la ventana para elegir la talla. */
  openModel(modelId: string): void {
    if (!this.session()) {
      return;
    }
    this.catalog.productModel(modelId).subscribe((model) => {
      this.searchOpen = false;
      this.variantModel.set(model);
      this.variantOpen = true;
    });
  }

  pickVariant(variant: ProductVariant): void {
    this.variantOpen = false;
    this.addById(variant.productId);
  }

  private addById(productId: string): void {
    this.pendingLookups++;
    this.sales.price(productId, null, this.customer().id || null)
      .pipe(finalize(() => this.lookupDone()))
      .subscribe({
        next: (price) => {
          this.searchOpen = false;
          this.addLine(price, 1);
        },
        error: () => (this.payWhenReady = false),
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
      document: `${documentShortLabel(party.documentType)} ${party.formattedDocument}`,
      priceListId: party.priceListId,
    });
  }

  resetCustomer(): void {
    this.setCustomer({ id: this.config()?.finalConsumerId ?? '', name: 'Consumidor final', document: '222222222222', priceListId: null });
  }

  /** "Registrar cliente nuevo" sin salir de la venta: el carrito sigue igual. Usa lo que se buscó (documento o nombre). */
  openNewCustomer(): void {
    this.newCustomer()?.prepare(this.customerText);
    this.customerOpen = false;
    this.newCustomerOpen = true;
  }

  /** Al cerrar el formulario (guardado o cancelado) el lector vuelve a tener el foco. */
  newCustomerVisible(visible: boolean): void {
    this.newCustomerOpen = visible;
    if (!visible) {
      this.focusScanner();
    }
  }

  customerCreated(party: Party): void {
    this.newCustomerOpen = false;
    this.pickCustomer(party);
    this.focusScanner();
  }

  // ---------------------------------------------------------------- ventas en espera

  /** "Pausar venta": pide un nombre para reconocerla (sugiere el del cliente). */
  openHold(): void {
    // Con un código buscándose, el producto llegaría después a la venta siguiente.
    if (!this.session() || this.lines().length === 0 || this.saving() || this.pendingLookups > 0 || this.anyDialogOpen()) {
      return;
    }
    this.cart()?.closeEditor();
    this.reloadHeld();
    if (this.held().length >= MAX_HELD) {
      this.messages.add({
        severity: 'warn',
        summary: `Ya tienes ${MAX_HELD} ventas en espera`,
        detail: 'Retoma o descarta alguna para pausar esta.',
      });
      return;
    }
    this.holdLabel = defaultHoldLabel(this.customer().name, this.isFinalConsumer(), this.held());
    this.holdOpen = true;
  }

  confirmHold(): void {
    if (this.lines().length === 0 || this.saving()) {
      this.holdOpen = false;
      return;
    }
    // Se relee lo guardado: otra pestaña del mismo usuario pudo pausar o retomar mientras tanto.
    const current = this.reloadHeld();
    const label = this.holdLabel.trim() || defaultHoldLabel(this.customer().name, this.isFinalConsumer(), current);
    this.storeHeld([newHeldSale(label, this.customer(), this.lines()), ...current]);
    this.holdOpen = false;
    this.resetSale();
    this.messages.add({ severity: 'info', summary: 'Venta en espera', detail: `"${label}". Retómala desde "En espera".`, life: 4000 });
  }

  openHeld(): void {
    if (this.anyDialogOpen()) {
      return;
    }
    this.cart()?.closeEditor();
    this.reloadHeld();
    this.heldOpen = true;
  }

  /**
   * Vuelve a poner la venta pausada en el carrito y pide los precios vigentes. Si había otra venta en curso, esa
   * queda en espera (no se pierde nada).
   */
  resumeHeld(sale: HeldSale): void {
    if (this.saving() || this.pendingLookups > 0) {
      return;
    }
    const current = this.reloadHeld();
    const target = current.find((h) => h.id === sale.id);
    if (!target) {
      this.messages.add({ severity: 'warn', summary: 'Esa venta ya no está en espera', detail: 'Se retomó o descartó en otra pestaña.' });
      return;
    }
    let rest = current.filter((h) => h.id !== target.id);
    if (this.lines().length > 0) {
      const label = defaultHoldLabel(this.customer().name, this.isFinalConsumer(), rest);
      rest = [newHeldSale(label, this.customer(), this.lines()), ...rest];
      this.messages.add({ severity: 'info', summary: 'La venta que tenías quedó en espera', detail: `"${label}".`, life: 4000 });
    }
    this.storeHeld(rest);
    this.heldOpen = false;
    this.cart()?.clearUndo();
    this.payments = [];
    this.mixed = false;
    this.customer.set({ ...target.customer });
    this.loadCredit(target.customer.id);
    this.updateLines(() => target.lines.map((l) => ({ ...l })));
    this.refreshPrices(target.customer.id || null);
    this.focusScanner();
  }

  discardHeld(sale: HeldSale): void {
    this.confirm.ask({
      header: 'Descartar venta en espera',
      message: `¿Borrar "${sale.label}"? Sus productos no se pueden recuperar.`,
      acceptLabel: 'Descartar',
      rejectLabel: 'Conservar',
      danger: true,
      accept: () => this.storeHeld(this.reloadHeld().filter((h) => h.id !== sale.id)),
    });
  }

  heldSummary(sale: HeldSale): string {
    const total = cartTotals(sale.lines, this.config()?.pricesIncludeTax ?? true).total;
    const count = sale.lines.length;
    return `${count} ${count === 1 ? 'producto' : 'productos'} · ${formatCop(total)} · ${heldAge(sale.heldAt)}`;
  }

  focusHoldLabel(): void {
    setTimeout(() => {
      const input = this.holdLabelInput()?.nativeElement;
      input?.focus();
      input?.select();
    }, 0);
  }

  /** Celular: "Ver venta" baja hasta el carrito. */
  showCart(): void {
    document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Otra pestaña cambió las ventas en espera: se actualiza el botón "En espera". */
  @HostListener('window:storage', ['$event'])
  protected storageChanged(event: StorageEvent): void {
    const tenantId = this.auth.tenantId();
    const userId = this.auth.user()?.id;
    if (tenantId && userId && event.key === heldKey(tenantId, userId)) {
      this.reloadHeld();
    }
  }

  private reloadHeld(): HeldSale[] {
    const list = loadHeld(this.auth.tenantId(), this.auth.user()?.id ?? null);
    this.held.set(list);
    return list;
  }

  private storeHeld(list: HeldSale[]): void {
    this.held.set(list);
    saveHeld(this.auth.tenantId(), this.auth.user()?.id ?? null, list);
  }

  private isFinalConsumer(): boolean {
    const id = this.customer().id;
    return !id || id === this.config()?.finalConsumerId;
  }

  /** Cambia el cliente y vuelve a pedir el precio de cada línea (puede tener otra lista de precios). */
  private setCustomer(choice: CustomerChoice): void {
    this.customerOpen = false;
    this.customer.set(choice);
    this.loadCredit(choice.id);
    this.refreshPrices(choice.id || null);
  }

  /** Saldo y cupo de fiado del cliente (sin credit:read o con error, no se ofrece Fiado). */
  private loadCredit(customerId: string): void {
    this.customerCredit.set(null);
    if (!customerId || customerId === this.config()?.finalConsumerId || !this.auth.hasPermission('credit:read')) {
      return;
    }
    this.credit.account(customerId).pipe(catchError(() => of(null))).subscribe((account) => {
      // Si mientras tanto cambió el cliente, la respuesta ya no aplica.
      if (this.customer().id === customerId) {
        this.customerCredit.set(account);
      }
    });
  }

  /** Vuelve a pedir el precio vigente de cada línea para el cliente. */
  private refreshPrices(customerId: string | null): void {
    const current = this.lines();
    if (current.length === 0) {
      return;
    }
    // Un producto que ya no se puede vender (p. ej. desactivado mientras la venta estaba en espera) no impide
    // actualizar los demás: su línea queda igual y se avisa.
    forkJoin(current.map((l) => this.sales.price(l.productId, l.unitId, customerId).pipe(catchError(() => of(null)))))
      .subscribe((results) => {
        const prices = results.filter((p): p is ProductLookup => p !== null);
        this.updateLines((list) => list.map((l) => {
          const price = prices.find((p) => p.productId === l.productId && p.unitId === l.unitId);
          if (!price) {
            return l;
          }
          // Precio libre (según el servidor, por si el producto cambió): se conserva el que escribió el cajero y solo
          // se actualiza el impuesto. Si dejó de ser libre, toma el precio de la lista como cualquier línea.
          if (price.openPrice && l.openPrice) {
            return { ...l, taxRate: Number(price.taxRate) };
          }
          const { openPrice: _wasOpen, ...rest } = l;
          return { ...rest, unitPrice: Number(price.price), taxRate: Number(price.taxRate) };
        }));
        const failed = current.filter((l, i) => results[i] === null);
        if (failed.length > 0) {
          this.messages.add({
            severity: 'warn',
            summary: 'No se pudo actualizar el precio',
            detail: `${failed.map((l) => l.name).join(', ')}. Revisa ${failed.length === 1 ? 'ese producto' : 'esos productos'} antes de cobrar.`,
            life: 8000,
          });
        }
      });
  }

  // ---------------------------------------------------------------- cobro

  openPayment(): void {
    if (this.pendingLookups > 0) {
      // F4 justo después de escanear: se abre cuando llegue el último producto.
      this.payWhenReady = true;
      return;
    }
    if (!this.session() || this.lines().length === 0 || this.anyDialogOpen()) {
      return;
    }
    this.cart()?.closeEditor();
    const cash = this.payMethods().find((m) => m.affectsCash) ?? this.payMethods()[0];
    this.mixed = false;
    this.payments = cash ? [this.draft(cash, this.totals().total)] : [];
    this.idempotencyKey ??= newIdempotencyKey('sale');
    this.payOpen = true;
  }

  private lookupDone(): void {
    this.pendingLookups = Math.max(0, this.pendingLookups - 1);
    if (this.pendingLookups === 0 && this.payWhenReady) {
      this.payWhenReady = false;
      this.openPayment();
    }
  }

  /**
   * Lector de códigos en el campo del monto (QA UI-2): si se escanea un producto con el cobro abierto, los dígitos
   * llegan en ráfaga (menos de ~35 ms entre teclas) y reemplazaban el monto; el Enter registraba la venta con un
   * cambio absurdo. Se reconoce la ráfaga, se deja el monto como estaba y no se registra.
   */
  trackAmountTyping(event: KeyboardEvent, payment: PaymentDraft): void {
    if (event.key.length !== 1) {
      return;
    }
    const now = performance.now();
    if (this.amountTyping.count === 0 || now - this.amountTyping.last > 60) {
      this.amountTyping = { start: now, last: now, count: 0, before: payment.amount };
    }
    this.amountTyping.count++;
    this.amountTyping.last = now;
  }

  confirmFromAmount(payment: PaymentDraft): void {
    const typing = this.amountTyping;
    this.amountTyping = { start: 0, last: 0, count: 0, before: null };
    const scannerBurst = typing.count >= 6 && performance.now() - typing.start < typing.count * 35 + 60;
    if (scannerBurst) {
      payment.amount = typing.before;
      this.messages.add({
        severity: 'warn',
        summary: 'Eso parece una lectura del lector',
        detail: 'No se registró. Para agregar otro producto toca "Volver"; si no, revisa el monto y registra.',
        life: 6000,
      });
      this.focusPayment();
      return;
    }
    this.confirmPayment();
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
    return this.paymentSummary().valid && this.missingReferences().length === 0 && this.creditProblem() === null
      && !this.saving();
  }

  /**
   * Fiado (decisión 255): solo a un cliente con cupo y, sin credit:manage, sin pasar lo disponible. El servidor lo
   * vuelve a validar con el saldo del momento.
   */
  creditProblem(): string | null {
    const fiado = this.payments
      .filter((p) => this.methodCode(p.methodId) === CREDIT_METHOD_CODE)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    if (fiado <= 0) {
      return null;
    }
    const credit = this.customerCredit();
    if (!credit || credit.creditLimit <= 0) {
      return 'Para fiar, elige un cliente con cupo de fiado.';
    }
    if (fiado > credit.available && !this.auth.hasPermission('credit:manage')) {
      return `Pasa el cupo de ${this.customer().name}: tiene disponible ${formatCop(credit.available)}. `
        + 'Cobra la diferencia con otro medio.';
    }
    return null;
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
        if (error instanceof HttpErrorResponse && error.status === 422) {
          // Si cerraron la caja compartida donde vendía (decisión 256), se vuelve a la apertura sin perder el carrito.
          this.cash.current().pipe(catchError(() => of(undefined))).subscribe((current) => {
            if (current === null) {
              this.payOpen = false;
              this.session.set(null);
            }
          });
        }
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

  /** Recibo en texto para enviarlo por WhatsApp (decisión 261). */
  protected saleWhatsApp(sale: Sale): string {
    return saleWhatsAppLink(sale);
  }

  setWidth(value: ReceiptWidth | string): void {
    const width: ReceiptWidth = Number(value) === 58 ? 58 : 80;
    this.width.set(width);
    saveReceiptWidth(width);
  }

  /** La primera vez que este usuario ve la pantalla de venta (con la caja abierta) en este equipo. */
  private offerTour(): void {
    this.clearTourTimer();
    this.tourTimer = setTimeout(() => this.tours.offer(POS_TOUR), 500);
  }

  replayTour(): void {
    this.helpOpen = false;
    this.clearTourTimer();
    // Después de que se cierre el diálogo de atajos.
    this.tourTimer = setTimeout(() => this.tours.start(POS_TOUR), 250);
  }

  ngOnDestroy(): void {
    this.clearTourTimer();
  }

  private clearTourTimer(): void {
    if (this.tourTimer !== null) {
      clearTimeout(this.tourTimer);
      this.tourTimer = null;
    }
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

  /**
   * Con un diálogo abierto no se mueve el foco (una búsqueda que llega tarde le quitaba el foco al cobro: UI-4). Si
   * solo queda la máscara de un diálogo que se está cerrando (p. ej. la confirmación de "Cancelar venta"), se
   * reintenta unas veces hasta que desaparezca.
   */
  focusScanner(attempt = 0): void {
    setTimeout(() => {
      if (this.searchOpen || this.variantOpen || this.customerOpen || this.payOpen || this.receiptOpen || this.helpOpen
        || this.holdOpen || this.heldOpen || this.newCustomerOpen || this.openPriceOpen) {
        return;
      }
      if (document.querySelector('.p-dialog-mask') && attempt < 10) {
        this.focusScanner(attempt + 1);
        return;
      }
      this.scanner()?.nativeElement.focus();
    }, attempt === 0 ? 0 : 50);
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
    return this.searchOpen || this.variantOpen || this.customerOpen || this.payOpen || this.receiptOpen || this.helpOpen
      || this.holdOpen || this.heldOpen || this.newCustomerOpen || this.openPriceOpen
      || document.querySelector('.p-dialog-mask') !== null;
  }

  private draft(method: PaymentMethod, amount: number | null): PaymentDraft {
    return { methodId: method.id, affectsCash: method.affectsCash, amount, reference: '' };
  }

  /** Todo cambio del carrito invalida la clave de idempotencia del cobro anterior. */
  private updateLines(change: (list: CartLine[]) => CartLine[]): void {
    if (this.saving()) {
      // Mientras se registra la venta el carrito no cambia (si no, una nueva clave podía duplicarla: QA UI-3).
      return;
    }
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
