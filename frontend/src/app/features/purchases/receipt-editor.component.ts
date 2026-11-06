import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CREDIT_METHOD_CODE, DEPOSIT_METHOD_CODE, Branch, Party, PaymentMethod, Product } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi } from '../../core/api/parties.api';
import {
  InvoiceDraft,
  InvoiceDraftLine,
  InvoiceScanUsage,
  PurchasePaymentType,
  PurchasesApi,
} from '../../core/api/purchases.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { documentShortLabel } from '../../shared/document-types';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { invoiceFilesProblem, shrinkPhoto } from '../../shared/image-shrink';
import { formatCop, formatQuantity } from '../../shared/money';
import { nitVerificationDigit } from '../../shared/nit';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';
import { ConfirmService } from '../../shared/confirm';
import { addDays } from '../quotes/quote-text';
import { isoDay } from '../orders/order-text';
import { methodLabel } from '../pos/pos-labels';
import {
  COLD_MAX,
  COLD_MIN,
  ReceiptDraftLine,
  TECHNICAL_CHECKS,
  expiresSoon,
  invoiceLine,
  invoiceLineNotice,
  invoiceTotalNotice,
  lineAmounts,
  linesProblem,
  needsTemperature,
  receiptLine,
  receiptNumber,
  receiptTotals,
  temperatureProblem,
  toLineInputs,
  withUnit,
} from './purchase-text';

/**
 * Recepción de mercancía contra la factura del proveedor (Fase 13-2, decisión 280; Resolución 1403 de 2007): se
 * revisa cada producto, se anota lote y vencimiento (obligatorios en medicamentos), la temperatura de lo que va en
 * nevera y se rechaza lo que llega mal. Lo aceptado sube el inventario y el costo promedio; la factura queda pagada de
 * contado o en cuentas por pagar.
 */
@Component({
  selector: 'app-receipt-editor',
  imports: [XaskaIaLogoComponent, FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, PesosInputDirective],
  template: `
    <app-page-header title="Recibir mercancía"
                     description="Registra lo que llegó contra la factura del proveedor. Revisa cada producto antes de aceptarlo." />

    @if (canImport() || canScan()) {
      <section class="card p-4 mb-4 max-w-5xl flex flex-col gap-3" aria-label="Cargar la factura del proveedor">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex-1 min-w-56">
            <h2 class="font-bold tracking-tight">Cargar la factura del proveedor</h2>
            @if (canScan()) {
              <p class="text-xs text-muted">Tómale una foto (hasta 5 si es larga), sube su PDF o el XML de la factura
                electrónica. XASKA llena lo que llegó para que lo revises; nada se guarda hasta que tú registres la
                recepción.</p>
            } @else {
              <p class="text-xs text-muted">Sube el XML o el ZIP de la factura electrónica que te llegó al correo. XASKA
                llena lo que llegó para que lo revises; nada se guarda hasta que tú registres la recepción.</p>
            }
            @if (scanUsageText(); as usage) {
              <p class="text-xs mt-1 flex items-center gap-1.5" [class.text-muted]="!scanLimitReached()"
                 [class.text-warning]="scanLimitReached()">
                <app-xaska-ia-logo size="sm" label="XASKA IA" />{{ usage }}</p>
            }
          </div>
          <input #invoiceFile type="file" class="hidden" aria-label="Archivo de la factura"
                 accept=".xml,.zip,application/xml,text/xml,application/zip,application/x-zip-compressed"
                 (change)="importInvoice($event)" />
          <input #cameraFile type="file" class="hidden" aria-label="Foto de la factura" accept="image/*"
                 capture="environment" (change)="scanInvoice($event)" />
          <input #scanFile type="file" class="hidden" aria-label="Fotos o PDF de la factura" multiple
                 accept="image/jpeg,image/png,application/pdf,.pdf" (change)="scanInvoice($event)" />
          <div class="flex flex-wrap gap-2">
            @if (canScan()) {
              <p-button label="Tomar foto" icon="pi pi-camera" [loading]="scanning()"
                        [disabled]="busy() || scanLimitReached()" (onClick)="cameraFile.click()" />
              <p-button label="Fotos o PDF" icon="pi pi-images" [outlined]="true"
                        [disabled]="busy() || scanLimitReached()" (onClick)="scanFile.click()" />
            }
            @if (canImport()) {
              <p-button [label]="canScan() ? 'XML' : draft() ? 'Cargar otra' : 'Cargar factura'" icon="pi pi-upload"
                        [loading]="importing()" [disabled]="scanning()" [outlined]="draft() !== null || canScan()"
                        (onClick)="invoiceFile.click()" />
            }
          </div>
        </div>
        @if (scanning()) {
          <p class="text-sm text-muted flex items-center gap-2" role="status">
            <span class="pi pi-spin pi-spinner" aria-hidden="true"></span>
            Leyendo la factura con IA. Puede tardar hasta un minuto; no cierres esta pantalla.
          </p>
        }
        @if (draft(); as d) {
          <div class="text-sm flex flex-wrap gap-x-4 gap-y-1">
            <span><span class="text-muted">Factura</span> {{ d.invoiceNumber }}</span>
            @if (d.total !== null) {
              <span><span class="text-muted">Total</span> {{ cop(d.total) }}</span>
            }
            <span>{{ matchedCount() }} de {{ d.lines.length }} productos encontrados en XASKA</span>
          </div>
          @if (!supplier() && d.supplier.documentNumber) {
            <div class="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 bg-warning-soft text-warning-soft-fg text-sm">
              <span class="flex-1 min-w-48">{{ d.supplier.name || 'El proveedor' }} (NIT {{ d.supplier.documentNumber }})
                no está en tus proveedores.</span>
              @if (canManageParties()) {
                <p-button label="Crear proveedor" size="small" [loading]="creatingSupplier()" (onClick)="createSupplier()" />
              } @else {
                <span>Pídele a quien maneja los proveedores que lo registre.</span>
              }
            </div>
          }
          @for (w of draftWarnings(); track $index) {
            <p class="text-sm text-warning" role="status">{{ w }}</p>
          }
          @if (totalNotice(); as notice) {
            <p class="text-sm text-warning" role="status">{{ notice }}</p>
          }
        }
      </section>
    }

    <section class="card p-4 grid gap-4 md:grid-cols-3 max-w-5xl">
      <fieldset class="flex flex-col gap-2 md:col-span-3">
        <legend class="text-sm font-medium mb-1">Proveedor</legend>
        @if (supplier(); as s) {
          <div class="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2">
            <span class="pi pi-truck text-muted" aria-hidden="true"></span>
            <span class="font-medium">{{ s.displayName }}</span>
            <span class="text-sm text-muted">{{ docShort(s.documentType) }} {{ s.formattedDocument }}</span>
            <p-button label="Cambiar" size="small" [text]="true" (onClick)="supplier.set(null)" />
          </div>
        } @else {
          <form class="flex gap-2" (ngSubmit)="searchSuppliers()">
            <input pInputText name="supplierSearch" class="flex-1" [(ngModel)]="supplierText"
                   aria-label="Buscar proveedor" placeholder="Nombre o NIT del proveedor" />
            <p-button type="submit" label="Buscar" [loading]="searchingSuppliers()" />
          </form>
          @if (supplierResults().length > 0) {
            <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
              @for (p of supplierResults(); track p.id) {
                <li>
                  <button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt" (click)="pickSupplier(p)">
                    <span class="font-medium">{{ p.displayName }}</span>
                    <span class="text-muted"> · {{ docShort(p.documentType) }} {{ p.formattedDocument }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else if (supplierSearched()) {
            <small class="text-xs text-muted">No hay proveedores con ese dato. Regístralo primero en
              <a routerLink="/app/proveedores" class="text-brand hover:underline">Proveedores</a>.</small>
          }
        }
      </fieldset>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Número de la factura</span>
        <input pInputText maxlength="40" class="uppercase" [(ngModel)]="invoice" placeholder="FV-12345" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Fecha de la factura</span>
        <input type="date" class="border rounded-lg px-3 py-2" [max]="today" [(ngModel)]="invoiceDate"
               (ngModelChange)="invoiceDateChanged()" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Sucursal que recibe</span>
        <select class="border rounded-lg px-2 py-2" [(ngModel)]="branchId">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    </section>

    <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
      <h2 class="font-bold tracking-tight">Lo que llegó</h2>
      <div class="flex flex-wrap gap-2 items-center">
        <input pInputText class="flex-1 min-w-64" placeholder="Escanea el código o escribe SKU/nombre y presiona Enter"
               aria-label="Agregar producto" [(ngModel)]="code" (keyup.enter)="add()" />
        <p-button label="Agregar" [loading]="adding()" (onClick)="add()" />
      </div>
      @if (results().length > 0) {
        <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
          @for (r of results(); track r.id) {
            <li><button type="button" class="w-full min-h-11 text-left px-3 py-2 hover:bg-surface-alt" (click)="pick(r)">
              <span class="font-mono">{{ r.sku }}</span> {{ r.name }}</button></li>
          }
        </ul>
      }

      @if (assigningLine(); as target) {
        <p class="text-sm rounded-lg px-3 py-2 bg-info-soft text-info-soft-fg" role="status">
          Busca arriba el producto para "{{ target.description }}" y tócalo.
          <button type="button" class="underline ml-1" (click)="assigning.set(null)">Cancelar</button>
        </p>
      }
      @if (pending().length > 0) {
        <div class="border rounded-lg border-warning p-3 flex flex-col gap-2">
          <h3 class="text-sm font-semibold">Sin producto en XASKA ({{ pending().length }})</h3>
          <p class="text-xs text-muted">Elige a qué producto corresponde cada uno o créalo. XASKA lo recordará para la
            próxima factura de este proveedor.</p>
          @for (p of pending(); track p.lineNo; let i = $index) {
            <article class="border-t pt-2 flex flex-col gap-2 text-sm" [attr.aria-label]="p.description">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="font-medium">{{ p.description }}
                  @if (p.supplierCode) { <span class="font-mono text-xs text-muted">· {{ p.supplierCode }}</span> }</span>
                <span class="tabular-nums text-muted">{{ qty(p.quantity) }} × {{ cop(p.unitCost) }}{{ p.taxRate ? ' + IVA ' + p.taxRate + ' %' : '' }}</span>
              </div>
              <div class="flex flex-wrap gap-2 items-center">
                @for (c of p.candidates; track c.productId) {
                  <p-button size="small" [outlined]="true" [label]="'¿Es ' + c.name + '?'" (onClick)="assignCandidate(i, c.productId)" />
                }
                <p-button size="small" [text]="true" label="Buscar otro" icon="pi pi-search" (onClick)="startAssign(i)" />
                @if (canCreateProducts()) {
                  <a pButton class="p-button-sm" [text]="true" label="Crear producto" icon="pi pi-plus" target="_blank" rel="noopener"
                     routerLink="/app/productos/nuevo" [queryParams]="newProductParams(p)"></a>
                }
                <p-button size="small" [text]="true" severity="danger" label="No lo recibo" (onClick)="dropPending(i)" />
              </div>
            </article>
          }
        </div>
      }

      @for (line of lines(); track line.key; let i = $index) {
        <article class="border rounded-lg p-3 grid gap-3 md:grid-cols-12 items-end" [class.opacity-75]="line.rejected"
                 [attr.aria-label]="line.name">
          <div class="md:col-span-12 flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">
              <span class="font-mono text-sm text-muted">{{ line.sku }}</span> {{ line.name }}
              @if (line.invoice; as inv) {
                <span class="block text-xs text-muted font-normal">En la factura: {{ inv.description }}</span>
              }
              @if (line.tracksLots) {
                <span class="ml-1 text-xs rounded-full px-2 py-0.5 bg-info-soft text-info-soft-fg">Lote y vencimiento</span>
              }
              @if (line.coldChain) {
                <span class="ml-1 text-xs rounded-full px-2 py-0.5 bg-info-soft text-info-soft-fg">Nevera</span>
              }
            </span>
            <span class="flex gap-1">
              <p-button [label]="line.rejected ? 'Aceptar' : 'Rechazar'" size="small" [text]="true"
                        [severity]="line.rejected ? 'success' : 'warn'" (onClick)="toggleReject(i)" />
              <p-button label="Quitar" size="small" [text]="true" severity="danger" (onClick)="remove(i)" />
            </span>
          </div>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-xs font-medium">Cantidad</span>
            <input pInputText type="number" min="0" step="any" [(ngModel)]="line.quantity" (ngModelChange)="touch()" />
          </label>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-xs font-medium">Presentación</span>
            <select class="border rounded-lg px-2 py-2" [ngModel]="line.unitId" (ngModelChange)="changeUnit(i, $event)">
              @for (u of line.units; track u.id) {
                <option [value]="u.id">{{ u.code }}{{ u.factor !== 1 ? ' × ' + u.factor : '' }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-xs font-medium">Costo sin IVA</span>
            <input pInputText appPesos="2" [(ngModel)]="line.unitCost" (ngModelChange)="touch()" />
          </label>
          <label class="flex flex-col gap-1 md:col-span-1">
            <span class="text-xs font-medium">IVA %</span>
            <input pInputText type="number" min="0" max="100" step="1" [(ngModel)]="line.taxRate" (ngModelChange)="touch()" />
          </label>
          @if (line.rejected) {
            <label class="flex flex-col gap-1 md:col-span-3">
              <span class="text-xs font-medium">Por qué lo rechazas</span>
              <input pInputText maxlength="200" [(ngModel)]="line.rejectReason" (ngModelChange)="touch()"
                     placeholder="Empaque roto, vencido, no coincide con la factura…" />
            </label>
          } @else {
            <label class="flex flex-col gap-1 md:col-span-2">
              <span class="text-xs font-medium">Lote{{ line.tracksLots ? '' : ' (opcional)' }}</span>
              <input pInputText maxlength="40" class="uppercase" [(ngModel)]="line.lotNumber" (ngModelChange)="touch()" />
            </label>
            <label class="flex flex-col gap-1 md:col-span-1">
              <span class="text-xs font-medium">Vence</span>
              <input type="date" class="border rounded-lg px-2 py-2" [(ngModel)]="line.expirationDate"
                     (ngModelChange)="touch()" />
            </label>
          }
          <div class="md:col-span-2 text-right">
            <span class="block text-xs text-muted">{{ line.rejected ? 'Rechazado' : 'Con IVA' }}</span>
            <span class="font-semibold tabular-nums" [class.line-through]="line.rejected">{{ cop(lineTotal(line)) }}</span>
          </div>
          @if (!line.rejected && soon(line)) {
            <small class="md:col-span-12 text-xs text-warning">Vence en menos de 6 meses: confirma que lo aceptas así.</small>
          }
          @if (notice(line); as n) {
            <small class="md:col-span-12 text-xs text-warning" role="status">{{ n }}</small>
          }
        </article>
      } @empty {
        <p class="p-6 text-center text-muted text-sm">
          Escanea o busca cada producto de la factura. Si algo llegó mal, agrégalo y márcalo como rechazado.
        </p>
      }

      @if (coldNeeded()) {
        <label class="flex flex-col gap-1 max-w-xs">
          <span class="text-sm font-medium">Temperatura de los productos de nevera (°C)</span>
          <input pInputText type="number" step="0.1" [min]="coldMin" [max]="coldMax" [(ngModel)]="temperature" (ngModelChange)="touch()" />
          <small class="text-xs text-muted">Mídela al abrir el empaque. Debe estar entre 2 y 8 °C; si no, rechaza esos productos.</small>
        </label>
      }
    </section>

    <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-2">
      <h2 class="font-bold tracking-tight">Revisión técnica</h2>
      <p class="text-xs text-muted">Confirma cada punto (Resolución 1403 de 2007). Queda registrado quién recibió y cuándo.</p>
      @for (check of checks; track $index) {
        <label class="flex items-start gap-2 text-sm min-h-8">
          <input type="checkbox" class="mt-1" [(ngModel)]="checked[$index]" (ngModelChange)="touch()" />
          <span>{{ check }}</span>
        </label>
      }
    </section>

    <section class="card p-4 mt-4 max-w-5xl grid gap-3 md:grid-cols-3">
      <fieldset class="flex flex-col gap-1 md:col-span-3">
        <legend class="text-sm font-medium mb-1">Pago de la factura</legend>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg" [class.border-brand]="paymentType === 'PAID'"
                 [class.cursor-pointer]="canPay()" [class.opacity-50]="!canPay()">
            <input type="radio" name="payment-type" value="PAID" [(ngModel)]="paymentType" [disabled]="!canPay()" (ngModelChange)="touch()" />
            De contado
          </label>
          <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer" [class.border-brand]="paymentType === 'CREDIT'">
            <input type="radio" name="payment-type" value="CREDIT" [(ngModel)]="paymentType" (ngModelChange)="touch()" /> A crédito
          </label>
        </div>
        @if (!canPay()) {
          <small class="text-xs text-muted">Queda en cuentas por pagar: el pago lo registra quien tiene permiso de pagar a proveedores.</small>
        }
      </fieldset>
      @if (paymentType === 'PAID') {
        <fieldset class="flex flex-col gap-1 md:col-span-2">
          <legend class="text-xs font-medium mb-1">Medio de pago</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of methods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer" [class.border-brand]="methodId === m.id">
                <input type="radio" name="purchase-method" [value]="m.id" [(ngModel)]="methodId" (ngModelChange)="touch()" />
                {{ label(m) }}
              </label>
            }
          </div>
          @if (selectedMethod()?.affectsCash) {
            <small class="text-xs text-muted">Sale de tu caja abierta y queda en su informe como "Pagos a proveedores".</small>
          }
        </fieldset>
        @if (selectedMethod() && !selectedMethod()!.affectsCash) {
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium">Referencia (opcional)</span>
            <input pInputText maxlength="100" [(ngModel)]="reference" />
          </label>
        }
      } @else {
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium">Vence el</span>
          <input type="date" class="border rounded-lg px-3 py-2" [min]="invoiceDate" [(ngModel)]="dueDate" (ngModelChange)="touch()" />
        </label>
      }
      <label class="flex flex-col gap-1 md:col-span-3">
        <span class="text-xs font-medium">Notas (opcional)</span>
        <input pInputText maxlength="500" [(ngModel)]="notes" placeholder="Quién entregó, novedades, pedido incompleto…" />
      </label>
    </section>

    <div class="flex flex-wrap justify-end gap-3 mt-4 max-w-5xl items-center">
      <span class="text-sm text-muted">Subtotal {{ cop(totals().subtotal) }} · IVA {{ cop(totals().tax) }}
        @if (totals().rejected > 0) { · Rechazado {{ cop(totals().rejected) }} }</span>
      <span class="text-sm">Total <strong class="tabular-nums text-lg">{{ cop(totals().total) }}</strong></span>
      @if (problem(); as message) {
        <span class="text-sm text-warning basis-full text-right" role="status">{{ message }}</span>
      }
      <a pButton routerLink="/app/compras" label="Cancelar" [text]="true" severity="secondary"></a>
      <p-button label="Registrar recepción" icon="pi pi-check" [loading]="saving()" [disabled]="problem() !== null"
                (onClick)="save()" />
    </div>
  `,
})
export class ReceiptEditorComponent implements OnInit, HasUnsavedChanges {
  private readonly api = inject(PurchasesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly organization = inject(OrganizationApi);
  private readonly parties = inject(PartiesApi);
  private readonly cash = inject(CashApi);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  protected readonly canPay = permissionFlag('purchases:pay');
  protected readonly canImport = permissionFlag('purchases:import');
  private readonly canScanPermission = permissionFlag('purchases:scan');
  protected readonly canManageParties = permissionFlag('parties:manage');
  protected readonly canCreateProducts = permissionFlag('products:manage');

  protected readonly checks = TECHNICAL_CHECKS;
  protected readonly coldMin = COLD_MIN;
  protected readonly coldMax = COLD_MAX;
  protected readonly cop = formatCop;
  protected readonly docShort = documentShortLabel;
  protected readonly qty = formatQuantity;
  protected readonly today = isoDay(new Date());

  protected readonly branches = signal<Branch[]>([]);
  protected readonly supplier = signal<Party | null>(null);
  protected readonly supplierResults = signal<Party[]>([]);
  protected readonly supplierSearched = signal(false);
  protected readonly searchingSuppliers = signal(false);
  protected readonly results = signal<Product[]>([]);
  protected readonly adding = signal(false);
  protected readonly lines = signal<ReceiptDraftLine[]>([]);
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected readonly saving = signal(false);
  /** Factura cargada (decisión 290): el borrador y las líneas que aún no tienen producto. */
  protected readonly draft = signal<InvoiceDraft | null>(null);
  protected readonly pending = signal<InvoiceDraftLine[]>([]);
  protected readonly importing = signal(false);
  /** Lectura con IA (decisión 295): lo usado del mes y si se está leyendo una factura. */
  protected readonly scanUsage = signal<InvoiceScanUsage | null>(null);
  protected readonly scanning = signal(false);
  protected readonly busy = computed(() => this.importing() || this.scanning());
  protected readonly canScan = computed(() => {
    const usage = this.scanUsage();
    return this.canScanPermission() && usage !== null && usage.available && usage.limit !== 0;
  });
  protected readonly scanLimitReached = computed(() => {
    const usage = this.scanUsage();
    return usage !== null && usage.limit !== null && usage.used >= usage.limit;
  });
  protected readonly scanUsageText = computed(() => {
    const usage = this.scanUsage();
    if (!this.canScan() || usage === null) {
      return null;
    }
    if (usage.limit === null) {
      return `Lecturas con IA este mes: ${usage.used}.`;
    }
    return this.scanLimitReached()
      ? `Llegaste a las ${usage.limit} lecturas con IA de este mes: carga el XML o ingresa la factura a mano.`
      : `Lecturas con IA: ${usage.used} de ${usage.limit} este mes.`;
  });
  protected readonly creatingSupplier = signal(false);
  /** Línea sin producto a la que se le está buscando uno (el buscador de arriba la completa). */
  protected readonly assigning = signal<number | null>(null);
  /** Cambia con cada edición de los campos de las líneas (que no son señales) para recalcular totales y avisos. */
  private readonly version = signal(0);

  protected branchId = '';
  protected supplierText = '';
  protected invoice = '';
  protected invoiceDate = this.today;
  protected code = '';
  protected temperature: number | null = null;
  protected checked: boolean[] = TECHNICAL_CHECKS.map(() => false);
  protected paymentType: PurchasePaymentType = 'CREDIT';
  protected methodId = '';
  protected reference = '';
  protected dueDate = addDays(this.today, 30);
  protected notes = '';
  private nextKey = 1;
  private saved = false;
  private idempotencyKey = newIdempotencyKey('compra');
  private submitted: string | null = null;

  protected readonly totals = computed(() => (this.version(), receiptTotals(this.lines())));
  protected readonly coldNeeded = computed(() => (this.version(), needsTemperature(this.lines())));
  protected readonly assigningLine = computed(() => {
    const index = this.assigning();
    return index === null ? null : this.pending()[index] ?? null;
  });
  protected readonly matchedCount = computed(() => {
    const d = this.draft();
    return d ? d.lines.length - this.pending().length : 0;
  });
  /** Los avisos del servidor, sin el del proveedor sin registrar (tiene su propio aviso con el botón). */
  protected readonly draftWarnings = computed(() => (this.draft()?.warnings ?? [])
    .filter((w) => !w.startsWith('El proveedor ') || !w.includes('no está registrado')));
  protected readonly totalNotice = computed(() => (this.version(),
  invoiceTotalNotice(this.lines(), this.draft()?.total ?? null, this.pending().length)));

  ngOnInit(): void {
    this.refreshScanUsage();
    if (this.canPay()) {
      this.paymentType = 'PAID';
    }
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => {
      const active = p.content.filter((b) => b.active);
      this.branches.set(active);
      this.branchId = active.find((b) => b.code === 'PRINCIPAL')?.id ?? active[0]?.id ?? '';
    });
    if (this.canPay()) {
      this.cash.paymentMethods().subscribe((list) => {
        const usable = list.filter((m) => m.code !== CREDIT_METHOD_CODE && m.code !== DEPOSIT_METHOD_CODE);
        this.methods.set(usable);
        this.methodId ||= (usable.find((m) => m.affectsCash) ?? usable[0])?.id ?? '';
      });
    }
  }

  protected touch(): void {
    this.version.update((n) => n + 1);
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected selectedMethod(): PaymentMethod | undefined {
    return this.methods().find((m) => m.id === this.methodId);
  }

  protected lineTotal(line: ReceiptDraftLine): number {
    const { net, tax } = lineAmounts(line);
    return net + tax;
  }

  protected soon(line: ReceiptDraftLine): boolean {
    return expiresSoon(line.expirationDate, this.today);
  }

  protected invoiceDateChanged(): void {
    if (this.invoiceDate && this.dueDate < this.invoiceDate) {
      this.dueDate = addDays(this.invoiceDate, 30);
    }
  }

  // ------------------------------------------------------------------ proveedor

  searchSuppliers(): void {
    this.searchingSuppliers.set(true);
    this.parties.search('suppliers', { page: 0, size: 10 }, this.supplierText.trim() || null, false).subscribe({
      next: (page) => {
        this.supplierResults.set(page.content);
        this.supplierSearched.set(true);
        this.searchingSuppliers.set(false);
      },
      error: () => this.searchingSuppliers.set(false),
    });
  }

  pickSupplier(party: Party): void {
    this.supplier.set(party);
    this.supplierResults.set([]);
    this.supplierSearched.set(false);
  }

  // ------------------------------------------------------------------ líneas

  /** Enter en el campo de código: primero como código de barras o SKU; si no, búsqueda por nombre. */
  add(): void {
    const code = this.code.trim();
    this.code = '';
    if (!code || this.adding()) {
      return;
    }
    this.adding.set(true);
    this.results.set([]);
    this.inventory.lookup(code).subscribe({
      next: (found) => this.catalog.product(found.productId).subscribe({
        next: (p) => {
          this.addProduct(p, found.unitId);
          this.adding.set(false);
        },
        error: () => this.adding.set(false),
      }),
      error: () => this.catalog.products({ page: 0, size: 10, search: code }).subscribe({
        next: (page) => {
          const tracked = page.content.filter((p) => p.trackInventory && p.active);
          // Al buscar el producto de una línea de la factura siempre se muestra la lista para elegir.
          if (tracked.length === 1 && this.assigning() === null) {
            this.addProduct(tracked[0], null);
          } else if (tracked.length === 0) {
            this.messages.add({ severity: 'warn', summary: 'Sin resultados', detail: `No hay productos con "${code}".` });
          } else {
            this.results.set(tracked);
          }
          this.adding.set(false);
        },
        error: () => this.adding.set(false),
      }),
    });
  }

  pick(product: Product): void {
    this.results.set([]);
    const assigning = this.assigning();
    if (assigning !== null) {
      this.assign(assigning, product);
      return;
    }
    this.addProduct(product, null);
  }

  /** Un producto puede ir en varias líneas: un lote por línea. */
  private addProduct(product: Product, unitId: string | null): void {
    const assigning = this.assigning();
    if (assigning !== null) {
      this.assign(assigning, product);
      return;
    }
    if (!product.trackInventory) {
      this.messages.add({ severity: 'warn', summary: 'No controla inventario', detail: product.name });
      return;
    }
    let line = receiptLine(product, this.nextKey++);
    if (unitId && unitId !== line.unitId && line.units.some((u) => u.id === unitId)) {
      line = withUnit(line, unitId);
    }
    this.lines.update((list) => [...list, line]);
    this.touch();
  }

  changeUnit(index: number, unitId: string): void {
    this.lines.update((list) => list.map((l, i) => (i === index ? withUnit(l, unitId) : l)));
    this.touch();
  }

  toggleReject(index: number): void {
    this.lines.update((list) => list.map((l, i) => (i === index ? { ...l, rejected: !l.rejected } : l)));
    this.touch();
  }

  remove(index: number): void {
    this.lines.update((list) => list.filter((_, i) => i !== index));
    this.touch();
  }

  protected notice(line: ReceiptDraftLine): string | null {
    this.version();
    return invoiceLineNotice(line);
  }

  // ------------------------------------------------------------------ factura cargada (decisión 290)

  importInvoice(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) {
      return;
    }
    if (this.lines().length > 0) {
      this.confirm.ask({
        header: 'Cargar la factura',
        message: 'Lo que ya agregaste se reemplaza por lo que trae la factura.',
        acceptLabel: 'Cargar factura',
        accept: () => this.upload(file),
      });
      return;
    }
    this.upload(file);
  }

  // ------------------------------------------------------------------ factura leída con IA (decisión 295)

  private refreshScanUsage(): void {
    if (this.canScanPermission()) {
      this.api.scanUsage().subscribe({ next: (usage) => this.scanUsage.set(usage), error: () => this.scanUsage.set(null) });
    }
  }

  scanInvoice(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0 || this.busy()) {
      return;
    }
    const problem = invoiceFilesProblem(files);
    if (problem) {
      this.messages.add({ severity: 'warn', summary: 'Factura', detail: problem, life: 5000 });
      return;
    }
    if (this.lines().length > 0) {
      this.confirm.ask({
        header: 'Leer la factura',
        message: 'Lo que ya agregaste se reemplaza por lo que trae la factura.',
        acceptLabel: 'Leer factura',
        accept: () => void this.scan(files),
      });
      return;
    }
    void this.scan(files);
  }

  /** Reduce las fotos en el celular (sube rápido aun con mala señal) y las manda a leer. */
  private async scan(files: File[]): Promise<void> {
    this.scanning.set(true);
    const ready = await Promise.all(files.map((f) => shrinkPhoto(f)));
    this.api.scanInvoice(ready).subscribe({
      next: (draft) => {
        this.scanning.set(false);
        this.importing.set(true);
        this.refreshScanUsage();
        this.applyDraft(draft);
      },
      error: () => {
        this.scanning.set(false);
        this.refreshScanUsage();
      },
    });
  }

  private upload(file: File): void {
    this.importing.set(true);
    this.api.importInvoice(file).subscribe({
      next: (draft) => this.applyDraft(draft),
      error: () => this.importing.set(false),
    });
  }

  /** Llena la recepción con la factura: proveedor, número, fecha, pago y las líneas emparejadas. */
  private applyDraft(draft: InvoiceDraft): void {
    const matched = draft.lines.filter((l) => l.match);
    const ids = [...new Set(matched.map((l) => l.match!.productId))];
    const products = ids.length === 0 ? null : forkJoin(ids.map((id) => this.catalog.product(id)));
    const finish = (list: Product[]): void => {
      const byId = new Map(list.map((p) => [p.id, p]));
      const lines: ReceiptDraftLine[] = [];
      const pending: InvoiceDraftLine[] = [];
      for (const l of draft.lines) {
        const product = l.match ? byId.get(l.match.productId) : undefined;
        if (product && product.trackInventory) {
          lines.push(invoiceLine(product, l, this.nextKey++, l.match!.by));
        } else {
          pending.push(l);
        }
      }
      this.draft.set(draft);
      this.lines.set(lines);
      this.pending.set(pending);
      this.assigning.set(null);
      this.invoice = draft.invoiceNumber;
      if (draft.invoiceDate && draft.invoiceDate <= this.today) {
        this.invoiceDate = draft.invoiceDate;
      }
      if (draft.paymentType === 'CREDIT' || !this.canPay()) {
        this.paymentType = 'CREDIT';
        this.dueDate = draft.dueDate && draft.dueDate >= this.invoiceDate ? draft.dueDate : addDays(this.invoiceDate, 30);
      } else if (draft.paymentType === 'PAID') {
        this.paymentType = 'PAID';
      }
      if (draft.supplier.id && draft.supplier.active) {
        this.parties.search('suppliers', { page: 0, size: 5 }, draft.supplier.documentNumber, false).subscribe((page) => {
          const found = page.content.find((p) => p.id === draft.supplier.id);
          if (found) {
            this.supplier.set(found);
          }
        });
      } else {
        this.supplier.set(null);
      }
      this.importing.set(false);
      this.touch();
      this.messages.add({ severity: 'success', summary: 'Factura cargada',
        detail: `${lines.length} de ${draft.lines.length} productos listos para revisar.`, life: 4000 });
    };
    if (products) {
      products.subscribe({ next: finish, error: () => this.importing.set(false) });
    } else {
      finish([]);
    }
  }

  createSupplier(): void {
    const s = this.draft()?.supplier;
    if (!s?.documentNumber || this.creatingSupplier()) {
      return;
    }
    this.creatingSupplier.set(true);
    this.parties.save('suppliers', null, {
      personType: 'LEGAL', documentType: 'NIT', documentNumber: s.documentNumber,
      verificationDigit: s.verificationDigit ?? nitVerificationDigit(s.documentNumber),
      firstNames: null, lastNames: null, businessName: s.name?.trim() || 'Proveedor ' + s.documentNumber,
      email: null, phone: null, address: null, cityCode: null,
    }).subscribe({
      next: (party) => {
        this.creatingSupplier.set(false);
        this.supplier.set(party);
        this.messages.add({ severity: 'success', summary: 'Proveedor creado', detail: party.displayName, life: 3000 });
      },
      error: () => this.creatingSupplier.set(false),
    });
  }

  startAssign(index: number): void {
    this.assigning.set(index);
    // Se busca por la palabra más larga de la descripción; si no aparece, se escribe otra en el buscador.
    const words = (this.pending()[index]?.description ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
    this.code = words.sort((a, b) => b.length - a.length)[0] ?? '';
    this.add();
  }

  assignCandidate(index: number, productId: string): void {
    this.catalog.product(productId).subscribe((p) => this.assign(index, p));
  }

  /** La línea de la factura queda con el producto elegido; al registrar, XASKA recuerda el código del proveedor. */
  private assign(index: number, product: Product): void {
    const draftLine = this.pending()[index];
    if (!draftLine) {
      return;
    }
    if (!product.trackInventory) {
      this.messages.add({ severity: 'warn', summary: 'No controla inventario', detail: product.name });
      return;
    }
    this.lines.update((list) => [...list, invoiceLine(product, draftLine, this.nextKey++, 'MANUAL')]);
    this.pending.update((list) => list.filter((_, i) => i !== index));
    this.assigning.set(null);
    this.touch();
  }

  dropPending(index: number): void {
    this.pending.update((list) => list.filter((_, i) => i !== index));
    if (this.assigning() === index) {
      this.assigning.set(null);
    }
  }

  protected newProductParams(line: InvoiceDraftLine): Record<string, string> {
    const params: Record<string, string> = { nombre: line.description, costo: String(line.unitCost) };
    if (line.barcode) {
      params['codigo'] = line.barcode;
    }
    return params;
  }

  // ------------------------------------------------------------------ guardar

  protected problem(): string | null {
    this.version();
    if (!this.supplier()) {
      return 'Elige el proveedor.';
    }
    if (!this.invoice.trim()) {
      return 'Escribe el número de la factura.';
    }
    if (!this.invoiceDate || this.invoiceDate > this.today) {
      return 'La fecha de la factura no puede ser futura.';
    }
    if (!this.branchId) {
      return 'Elige la sucursal que recibe.';
    }
    if (this.pending().length > 0) {
      return 'Elige el producto de las líneas de la factura que no están en XASKA (o márcalas como no recibidas).';
    }
    const lines = linesProblem(this.lines(), this.today) ?? temperatureProblem(this.lines(), this.temperature);
    if (lines) {
      return lines;
    }
    if (this.checked.some((c) => !c)) {
      return 'Confirma los puntos de la revisión técnica.';
    }
    if (this.paymentType === 'PAID' && !this.methodId) {
      return 'Elige el medio de pago.';
    }
    if (this.paymentType === 'CREDIT' && (!this.dueDate || this.dueDate < this.invoiceDate)) {
      return 'La fecha de vencimiento debe ser igual o posterior a la de la factura.';
    }
    return null;
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && (this.lines().length > 0 || this.invoice.trim() !== '' || this.supplier() !== null
      || this.draft() !== null);
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  save(): void {
    if (this.problem() !== null || this.saving()) {
      return;
    }
    const paid = this.paymentType === 'PAID';
    const method = this.selectedMethod();
    const body = {
      branchId: this.branchId,
      supplierId: this.supplier()!.id,
      supplierInvoice: this.invoice.trim().toUpperCase(),
      invoiceDate: this.invoiceDate,
      paymentType: this.paymentType,
      paymentMethodId: paid ? this.methodId : null,
      dueDate: paid ? null : this.dueDate,
      paymentReference: paid && method && !method.affectsCash ? this.reference.trim() || null : null,
      checksConfirmed: true,
      coldChainTemperature: this.coldNeeded() && this.temperature !== null ? Number(this.temperature) : null,
      notes: this.notes.trim() || null,
      lines: toLineInputs(this.lines()),
      documentId: this.draft()?.documentId ?? null,
    };
    // Reintentar lo mismo no duplica; si el borrador cambió, es otra recepción.
    const fingerprint = JSON.stringify(body);
    if (this.submitted !== null && this.submitted !== fingerprint) {
      this.idempotencyKey = newIdempotencyKey('compra');
    }
    this.submitted = fingerprint;
    this.saving.set(true);
    this.api.receive(body, this.idempotencyKey).subscribe({
      next: (receipt) => {
        this.saving.set(false);
        this.saved = true;
        this.messages.add({ severity: 'success', summary: `Recepción ${receiptNumber(receipt.summary.number)} registrada`,
          detail: 'El inventario y el costo promedio quedaron actualizados.', life: 4000 });
        void this.router.navigate(['/app/compras', receipt.summary.id]);
      },
      error: () => this.saving.set(false),
    });
  }
}
