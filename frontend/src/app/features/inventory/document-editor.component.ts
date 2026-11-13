import { isTouch } from '../../shared/touch';
import { Component, HostListener, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Branch, InventoryDocument, InventoryDocumentType, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { formatQuantity } from '../../shared/money';
import {
  DraftLine,
  addScan,
  anotherLot,
  baseQuantity,
  draftLine,
  isEntry,
  linesProblem,
  mergeGridLines,
  normalizeLot,
  toLineInputs,
} from './document-lines';
import { formatDay, isoDay } from '../orders/order-text';
import { SizeGridDialogComponent, SizeGridResult } from './size-grid-dialog.component';
import { DOCUMENT_LABEL, documentNumber, documentTypeFromRoute } from './labels';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { HasUnsavedChanges, warnIfUnsaved } from '../../shared/unsaved-changes';

/**
 * Editor de documentos de inventario: saldo inicial, ajuste, traslado o conteo físico.
 * Los productos se agregan escaneando el código de barras (o escribiendo SKU) y Enter, o buscando por nombre.
 * Cada lectura del lector suma 1 en la unidad leída; las lecturas rápidas se encolan y se procesan en orden.
 */
@Component({
  selector: 'app-inventory-document-editor',
  imports: [FormsModule, PesosInputDirective, RouterLink, ButtonComponent, AppInputDirective, PageHeaderComponent,
    SizeGridDialogComponent],
  template: `
    @if (type(); as t) {
      <app-page-header [title]="labels[t]" [description]="help[t]" />

      <section class="card p-4 grid gap-3 md:grid-cols-3 max-w-5xl">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t === 'TRANSFER' ? 'Sucursal de origen' : 'Sucursal' }}</span>
          <select class="border rounded px-2 py-2" [ngModel]="branchId" (ngModelChange)="branchId = $event; refreshBalances()">
            @for (b of branches(); track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </label>
        @if (t === 'TRANSFER') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Sucursal de destino</span>
            <select class="border rounded px-2 py-2" [(ngModel)]="toBranchId">
              <option value="">—</option>
              @for (b of branches(); track b.id) {
                @if (b.id !== branchId) {
                  <option [value]="b.id">{{ b.name }}</option>
                }
              }
            </select>
          </label>
        }
        @if (t === 'ADJUSTMENT' || t === 'COUNT') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Motivo{{ t === 'ADJUSTMENT' ? '' : ' (opcional)' }}</span>
            <input appInput [(ngModel)]="reason" maxlength="255"
                   [placeholder]="t === 'ADJUSTMENT' ? 'Daño, vencimiento, donación…' : 'Conteo físico'" />
          </label>
        }
        @if (t === 'DISPOSAL') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Motivo</span>
            <select class="border rounded px-2 py-2" [(ngModel)]="reason">
              <option value="">Elige…</option>
              @for (r of disposalReasons; track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Cómo se dispuso</span>
            <input appInput [(ngModel)]="disposalMethod" maxlength="200"
                   placeholder="Gestor de residuos que lo recogió y número de su acta" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Testigo (opcional)</span>
            <input appInput [(ngModel)]="witnessName" maxlength="160" placeholder="Nombre de quien lo presenció" />
          </label>
        }
        <label class="flex flex-col gap-1 md:col-span-3">
          <span class="text-sm font-medium">Notas</span>
          <input appInput [(ngModel)]="notes" maxlength="500" />
        </label>
      </section>

      <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
        <div class="flex flex-wrap gap-2 items-center">
          <input appInput class="flex-1 min-w-64" placeholder="Escanea el código o escribe SKU/nombre y presiona Enter"
                 [(ngModel)]="code" (keyup.enter)="add()" [attr.autofocus]="desktop ? '' : null" />
          <app-button label="Agregar" [loading]="adding()" (clicked)="add()" />
          <app-button label="Por tallas" icon="pi pi-th-large" severity="secondary" [outlined]="true"
                    (clicked)="sizeGrid()?.open()" />
        </div>
        @if (results().length > 0) {
          <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
            @for (r of results(); track r.id) {
              <li><button type="button" class="w-full text-left px-3 py-2 hover:bg-surface-alt" (click)="pick(r)">
                <span class="font-mono">{{ r.sku }}</span> {{ r.name }}</button></li>
            }
          </ul>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Producto</th>
                @if (t === 'ADJUSTMENT') { <th class="p-2">Tipo</th> }
                <th class="p-2">{{ t === 'COUNT' ? 'Contado' : 'Cantidad' }}</th>
                <th class="p-2">Unidad</th>
                @if (hasLots()) { <th class="p-2">Lote · vence</th> }
                @if (t === 'COUNT') { <th class="p-2 text-right">En sistema</th><th class="p-2 text-right">Diferencia</th> }
                @if (t === 'INITIAL' || t === 'ADJUSTMENT') { <th class="p-2">Costo por unidad</th> }
                <th class="p-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (line of lines(); track $index; let i = $index) {
                <tr class="border-t">
                  <td class="p-2"><span class="font-mono">{{ line.sku }}</span> {{ line.name }}
                    @if (line.tracksLots && entry(t, line)) {
                      <button type="button" class="block text-xs text-brand hover:underline" (click)="addLot(i)">+ Otro lote</button>
                    }
                  </td>
                  @if (t === 'ADJUSTMENT') {
                    <td class="p-2">
                      <select class="border rounded px-2 py-1" [(ngModel)]="line.direction">
                        <option value="IN">Entrada</option>
                        <option value="OUT">Salida</option>
                      </select>
                    </td>
                  }
                  <td class="p-2"><input appInput type="number" min="0" step="any" class="w-28" [(ngModel)]="line.quantity" /></td>
                  <td class="p-2">
                    <select class="border rounded px-2 py-1" [(ngModel)]="line.unitId">
                      @for (u of line.units; track u.id) {
                        <option [value]="u.id">{{ u.code }}{{ u.factor !== 1 ? ' (' + q(u.factor) + ')' : '' }}</option>
                      }
                    </select>
                  </td>
                  @if (hasLots()) {
                    <td class="p-2">
                      @if (!line.tracksLots) {
                        <span class="text-xs text-muted">—</span>
                      } @else if (entry(t, line) || (t === 'COUNT' && !line.lotFixed)) {
                        <span class="flex gap-1">
                          <input appInput class="w-28 uppercase" maxlength="40" placeholder="Lote" [(ngModel)]="line.lotNumber"
                                 [attr.aria-label]="'Lote de ' + line.name" />
                          <input type="date" class="border rounded px-1 py-1" [(ngModel)]="line.expirationDate"
                                 [attr.aria-label]="'Vencimiento de ' + line.name" />
                        </span>
                      } @else if (t === 'COUNT') {
                        <span>{{ line.lotNumber || 'Sin lote (de antes)' }}</span>
                        @if (line.expirationDate) { <span class="block text-xs text-muted">{{ day(line.expirationDate) }}</span> }
                      } @else {
                        <select class="border rounded px-2 py-1 max-w-56" [(ngModel)]="line.lotNumber"
                                [attr.aria-label]="'Lote de ' + line.name">
                          <option value="">{{ t === 'DISPOSAL' ? 'Sin lote (de antes)' : 'El que vence primero' }}</option>
                          @for (o of line.lotOptions ?? []; track o.lotNumber) {
                            @if (!(t === 'TRANSFER' && o.expired)) {
                              <option [value]="o.lotNumber">{{ o.lotNumber }} · {{ o.expirationDate ? day(o.expirationDate) : 'sin fecha' }} · {{ q(o.quantity) }}{{ o.expired ? ' · VENCIDO' : '' }}</option>
                            }
                          }
                        </select>
                      }
                    </td>
                  }
                  @if (t === 'COUNT') {
                    <td class="p-2 text-right">{{ q(line.currentQuantity) }} {{ line.baseUnitCode }}</td>
                    <td class="p-2 text-right" [class.text-danger]="difference(line) < 0"
                        [class.text-success]="difference(line) > 0">{{ q(difference(line)) }}</td>
                  }
                  @if (t === 'INITIAL' || t === 'ADJUSTMENT') {
                    <td class="p-2">
                      @if (t === 'INITIAL' || line.direction === 'IN') {
                        <input appInput appPesos="2" class="w-32" [(ngModel)]="line.unitCost"
                               [placeholder]="t === 'ADJUSTMENT' ? 'Costo promedio' : ''" />
                      } @else {
                        <span class="text-muted text-xs">Costo promedio</span>
                      }
                    </td>
                  }
                  <td class="p-2 text-right">
                    @if (t === 'COUNT' && line.tracksLots) {
                      <button type="button" class="text-xs text-brand hover:underline mr-1" (click)="addLot(i)">+ Lote nuevo</button>
                    }
                    <app-button label="Quitar" size="small" [text]="true" severity="danger" (clicked)="remove(i)" />
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="p-6 text-center text-muted">Agrega productos escaneando o buscando.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (t === 'COUNT' && hasLots()) {
        <p class="text-xs text-muted max-w-5xl mt-2">En los productos con lotes cuenta cada lote por separado. Lo que
          esté "Sin lote (de antes)" pásalo a su lote: cuenta el lote con lo que encontraste y deja "Sin lote" en 0.
          Para un lote que no está en la lista usa "+ Lote nuevo".</p>
      }
      <div class="flex justify-end gap-2 mt-4 max-w-5xl items-center">
        @if (problem(); as message) {
          <span class="text-sm text-warning">{{ message }}</span>
        }
        <a routerLink="/app/inventario/movimientos"><app-button label="Cancelar" [text]="true" severity="secondary" /></a>
        <app-button label="Registrar" [loading]="saving()" [disabled]="problem() !== null" (clicked)="save()" />
      </div>

      <app-size-grid-dialog [type]="t" [branchId]="branchId" [lines]="lines()" (applied)="applyGrid($event)" />
    } @else {
      <p class="text-muted">Tipo de documento desconocido.</p>
    }
  `,
})
export class InventoryDocumentEditorComponent implements OnInit, HasUnsavedChanges {
  /** Decisión 314: en el celular el teclado no se abre solo. */
  protected readonly desktop = !isTouch();
  /** Segmento de ruta :kind (saldo-inicial, ajuste, traslado, conteo). */
  readonly kind = input.required<string>();
  /** ?producto=id: llega desde "Producto creado → registrar existencias" y entra ya en la lista. */
  readonly producto = input<string>();
  /** ?lote=X: con ?producto, la baja de ese lote desde Vencimientos (Fase 13-3). */
  readonly lote = input<string>();

  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly labels = DOCUMENT_LABEL;
  protected readonly help: Record<InventoryDocumentType, string> = {
    INITIAL: 'Carga la existencia con la que arrancas en una sucursal. El costo se toma del producto (cámbialo si es distinto). Solo para productos sin movimientos en esa sucursal.',
    ADJUSTMENT: 'Entradas o salidas por daño, vencimiento, donación, etc. Las salidas se valoran al costo promedio.',
    TRANSFER: 'Mueve mercancía de una sucursal a otra al instante.',
    COUNT: 'Escribe lo que contaste: el sistema ajusta la diferencia con lo registrado.',
    DISPOSAL: 'Saca del inventario lo vencido, averiado o retirado del mercado y deja el acta: motivo, lote, cantidad, cómo se dispuso y testigo.',
  };
  protected readonly disposalReasons = ['Vencido', 'Averiado o deteriorado', 'Retiro del mercado (alerta sanitaria)',
    'Mal almacenado (temperatura)', 'Otro'];
  protected readonly day = formatDay;
  protected readonly hasLots = computed(() => this.lines().some((l) => l.tracksLots));
  protected disposalMethod = '';
  protected witnessName = '';
  protected readonly q = formatQuantity;
  protected readonly sizeGrid = viewChild(SizeGridDialogComponent);
  protected readonly type = computed(() => documentTypeFromRoute(this.kind()));
  protected readonly branches = signal<Branch[]>([]);
  protected readonly lines = signal<DraftLine[]>([]);
  protected readonly results = signal<Product[]>([]);
  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected branchId = '';
  protected toBranchId = '';
  protected reason = '';
  protected notes = '';
  protected code = '';
  /**
   * Una clave por envío: si se repite igual (doble clic, reintento) no se duplica; si el borrador cambió, se usa una
   * clave nueva para no recibir el documento anterior como si fuera este (QA UI-8).
   */
  private idempotencyKey = newKey();
  private submitted: string | null = null;
  /** Lecturas del lector pendientes: se procesan de una en una y en orden (QA UI-6). */
  private readonly scans: string[] = [];
  private scanning = false;
  /** Ya se registró: salir hacia la lista no debe preguntar. */
  private saved = false;

  ngOnInit(): void {
    const productId = this.producto();
    if (productId) {
      this.catalog.product(productId, true).subscribe((p) => {
        this.addProduct(p, null, false);
        const lot = this.lote();
        if (lot) {
          this.lines.update((list) => list.map((l) => (l.productId === p.id ? { ...l, lotNumber: normalizeLot(lot) } : l)));
        }
      });
    }
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => {
      const active = p.content.filter((b) => b.active);
      this.branches.set(active);
      this.branchId = active.find((b) => b.code === 'PRINCIPAL')?.id ?? active[0]?.id ?? '';
      // Productos leídos antes de que llegaran las sucursales: traer su existencia ahora.
      this.refreshBalances();
    });
  }

  protected problem(): string | null {
    const t = this.type();
    if (!t) {
      return 'Tipo desconocido.';
    }
    if (!this.branchId) {
      return 'Elige la sucursal.';
    }
    if (t === 'TRANSFER' && !this.toBranchId) {
      return 'Elige la sucursal de destino.';
    }
    if (t === 'ADJUSTMENT' && !this.reason.trim()) {
      return 'Escribe el motivo del ajuste.';
    }
    if (t === 'DISPOSAL' && !this.reason.trim()) {
      return 'Elige el motivo de la baja.';
    }
    if (t === 'DISPOSAL' && !this.disposalMethod.trim()) {
      return 'Escribe cómo se dispuso (el gestor de residuos y su acta).';
    }
    return linesProblem(t, this.lines());
  }

  protected difference(line: DraftLine): number {
    const counted = baseQuantity(line);
    return counted === null || line.currentQuantity === null ? 0 : counted - line.currentQuantity;
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && (this.lines().length > 0 || this.reason.trim() !== '' || this.notes.trim() !== ''
      || this.disposalMethod.trim() !== '');
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    warnIfUnsaved(event, this.hasUnsavedChanges());
  }

  /**
   * Enter en el campo de código. El campo se limpia de inmediato: el lector puede enviar la siguiente lectura antes de
   * que responda la anterior, y antes se pegaba al código en curso o se perdía (QA UI-6).
   */
  add(): void {
    const code = this.code.trim();
    this.code = '';
    if (!code) {
      return;
    }
    this.scans.push(code);
    this.nextScan();
  }

  private nextScan(): void {
    if (this.scanning) {
      return;
    }
    const code = this.scans.shift();
    if (code === undefined) {
      this.adding.set(false);
      return;
    }
    this.scanning = true;
    this.adding.set(true);
    this.results.set([]);
    const done = () => {
      this.scanning = false;
      this.nextScan();
    };
    this.api.lookup(code).subscribe({
      next: (found) => this.catalog.product(found.productId).subscribe({
        next: (p) => {
          this.addProduct(p, found.unitId, true);
          done();
        },
        error: done,
      }),
      error: () => {
        // No es un código: buscar por nombre.
        this.catalog.products({ page: 0, size: 10, search: code }).subscribe({
          next: (page) => {
            const tracked = page.content.filter((p) => p.trackInventory);
            if (tracked.length === 1) {
              this.addProduct(tracked[0], null, false);
            } else if (tracked.length === 0) {
              this.messages.add({ severity: 'warn', summary: 'Sin resultados', detail: `No hay productos con "${code}".` });
            } else {
              this.results.set(tracked);
            }
            done();
          },
          error: done,
        });
      },
    });
  }

  /** Elegido de la lista de resultados de búsqueda. */
  pick(product: Product): void {
    this.results.set([]);
    this.addProduct(product, null, false);
  }

  /**
   * Agrega el producto. Leído con el lector ({@code scanned}): la línea empieza en 1 y cada nueva lectura suma 1 en la
   * unidad leída (si la línea está en otra unidad, se avisa en vez de sumar mal). Elegido o buscado por nombre: la
   * cantidad se escribe a mano.
   */
  private addProduct(product: Product, unitId: string | null, scanned: boolean): void {
    if (!product.trackInventory) {
      this.messages.add({ severity: 'warn', summary: 'No controla inventario', detail: product.name });
      return;
    }
    const existing = this.lines().find((l) => l.productId === product.id);
    if (existing?.tracksLots) {
      this.messages.add({ severity: 'info', summary: 'Ya está en la lista',
        detail: `${product.name}: escribe la cantidad de cada lote (o usa "+ Otro lote").` });
      return;
    }
    if (existing) {
      const added = scanned ? addScan(existing, unitId ?? product.baseUnitId) : null;
      if (added) {
        this.lines.update((list) => list.map((l) => (l.productId === product.id ? added : l)));
      } else {
        this.messages.add({ severity: 'info', summary: 'Ya está en la lista', detail: product.name });
      }
      return;
    }
    const line = draftLine(product, unitId);
    if (scanned) {
      line.quantity = 1;
    }
    if (product.tracksLots && this.type() !== 'INITIAL') {
      this.lines.update((list) => [...list, line]);
      this.loadLots(product.id);
      return;
    }
    // Saldo inicial: el costo ya está en el producto; se propone para no escribirlo dos veces (se puede cambiar).
    if (this.type() === 'INITIAL' && product.cost > 0) {
      const factor = line.units.find((u) => u.id === line.unitId)?.factor ?? 1;
      line.unitCost = Math.round(product.cost * factor * 100) / 100;
    }
    this.lines.update((list) => [...list, line]);
    if (this.type() === 'COUNT' && this.branchId) {
      this.loadCurrent(this.branchId, product.id);
    }
  }

  /** Cantidades de la cuadrícula talla × color (fase 8d). */
  applyGrid(result: SizeGridResult): void {
    this.results.set([]);
    this.lines.update((list) => mergeGridLines(list, result.variantIds, result.lines));
    if (this.type() === 'COUNT' && this.branchId) {
      for (const line of result.lines.filter((l) => l.currentQuantity === null)) {
        this.loadCurrent(this.branchId, line.productId);
      }
    }
  }

  remove(index: number): void {
    this.lines.update((list) => list.filter((_, i) => i !== index));
  }

  protected entry(type: InventoryDocumentType, line: DraftLine): boolean {
    return isEntry(type, line);
  }

  /** Otra línea del mismo producto para otro lote (entradas) o un lote nuevo encontrado en el conteo. */
  addLot(index: number): void {
    this.lines.update((list) => [...list.slice(0, index + 1), anotherLot(list[index]), ...list.slice(index + 1)]);
  }

  /**
   * Lotes del producto en la sucursal (Fase 13-3). En el conteo, una línea por lote y otra por lo que no tiene lote;
   * en salidas, traslados y bajas, las opciones para elegir de qué lote sale.
   */
  private loadLots(productId: string): void {
    const branchId = this.branchId;
    if (!branchId) {
      return;
    }
    this.api.productLots(productId, branchId).subscribe((found) => {
      if (branchId !== this.branchId) {
        return;
      }
      const today = isoDay(new Date());
      const options = found.lots.map((l) => ({ lotNumber: l.lotNumber, expirationDate: l.expirationDate,
        quantity: l.quantity, expired: !!l.expirationDate && l.expirationDate <= today }));
      if (this.type() === 'COUNT') {
        this.lines.update((list) => {
          const index = list.findIndex((l) => l.productId === productId);
          if (index < 0) {
            return list;
          }
          const template = list[index];
          const lotLines: DraftLine[] = found.lots.map((l) => ({ ...template, quantity: null, lotNumber: l.lotNumber,
            expirationDate: l.expirationDate ?? '', lotFixed: true, currentQuantity: l.quantity, unitId: template.units[0].id }));
          const unlotted: DraftLine = { ...template, lotNumber: '', expirationDate: '', lotFixed: true,
            currentQuantity: found.unlotted, unitId: template.units[0].id };
          const replacement = found.unlotted > 0 || lotLines.length === 0 ? [...lotLines, unlotted] : lotLines;
          return [...list.slice(0, index), ...replacement,
            ...list.slice(index + 1).filter((l) => l.productId !== productId)];
        });
      } else {
        this.lines.update((list) => list.map((l) => (l.productId === productId ? { ...l, lotOptions: options } : l)));
      }
    });
  }

  refreshBalances(): void {
    for (const productId of new Set(this.lines().filter((l) => l.tracksLots).map((l) => l.productId))) {
      if (this.type() !== 'COUNT' && this.type() !== 'INITIAL') {
        this.loadLots(productId);
      }
    }
    if (this.type() !== 'COUNT' || !this.branchId) {
      return;
    }
    // Lo de la sucursal anterior no sirve: sin dato, el servidor compara con el saldo actual (nunca con otra sucursal).
    this.lines.update((list) => list.map((l) => ({ ...l, currentQuantity: null })));
    const lotted = new Set(this.lines().filter((l) => l.tracksLots).map((l) => l.productId));
    // Los productos con lotes se vuelven a armar con los lotes de la sucursal nueva.
    this.lines.update((list) => list.filter((l, i) => !l.tracksLots
      || list.findIndex((x) => x.productId === l.productId) === i));
    for (const productId of lotted) {
      this.loadLots(productId);
    }
    for (const line of this.lines().filter((l) => !l.tracksLots)) {
      this.loadCurrent(this.branchId, line.productId);
    }
  }

  save(): void {
    const t = this.type();
    if (!t || this.problem() !== null) {
      return;
    }
    const body = {
      branchId: this.branchId,
      toBranchId: this.toBranchId || null,
      reason: this.reason.trim() || null,
      notes: this.notes.trim() || null,
      disposalMethod: t === 'DISPOSAL' ? this.disposalMethod.trim() : null,
      witnessName: t === 'DISPOSAL' ? this.witnessName.trim() || null : null,
      lines: toLineInputs(t, this.lines()),
    };
    const fingerprint = JSON.stringify([t, body]);
    if (this.submitted !== null && this.submitted !== fingerprint) {
      this.idempotencyKey = newKey();
    }
    this.submitted = fingerprint;
    this.saving.set(true);
    this.api
      .create(t, body, this.idempotencyKey)
      .subscribe({
        next: (doc: InventoryDocument) => {
          this.saving.set(false);
          this.saved = true;
          this.messages.add({ severity: 'success', summary: `${DOCUMENT_LABEL[doc.type]} registrado`,
            detail: documentNumber(doc.number) });
          void this.router.navigate(['/app/inventario/movimientos']);
        },
        error: () => this.saving.set(false),
      });
  }

  /** Existencia en el sistema para el conteo; si mientras tanto se cambió de sucursal, la respuesta se descarta. */
  private loadCurrent(branchId: string, productId: string): void {
    this.api.balance(branchId, productId).subscribe((row) => {
      if (branchId === this.branchId) {
        this.lines.update((list) =>
          list.map((l) => (l.productId === productId ? { ...l, currentQuantity: row.quantity } : l)));
      }
    });
  }
}

function newKey(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return 'inv-' + random;
}
