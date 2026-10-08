import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Branch, InventoryDocument, InventoryDocumentType, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { formatQuantity } from '../../shared/money';
import { DraftLine, addScan, baseQuantity, draftLine, linesProblem, toLineInputs } from './document-lines';
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
  imports: [FormsModule, PesosInputDirective, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent],
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
            <input pInputText [(ngModel)]="reason" maxlength="255"
                   [placeholder]="t === 'ADJUSTMENT' ? 'Daño, vencimiento, donación…' : 'Conteo físico'" />
          </label>
        }
        <label class="flex flex-col gap-1 md:col-span-3">
          <span class="text-sm font-medium">Notas</span>
          <input pInputText [(ngModel)]="notes" maxlength="500" />
        </label>
      </section>

      <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
        <div class="flex flex-wrap gap-2 items-center">
          <input pInputText class="flex-1 min-w-64" placeholder="Escanea el código o escribe SKU/nombre y presiona Enter"
                 [(ngModel)]="code" (keyup.enter)="add()" autofocus />
          <p-button label="Agregar" [loading]="adding()" (onClick)="add()" />
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
                @if (t === 'COUNT') { <th class="p-2 text-right">En sistema</th><th class="p-2 text-right">Diferencia</th> }
                @if (t === 'INITIAL' || t === 'ADJUSTMENT') { <th class="p-2">Costo por unidad</th> }
                <th class="p-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (line of lines(); track line.productId; let i = $index) {
                <tr class="border-t">
                  <td class="p-2"><span class="font-mono">{{ line.sku }}</span> {{ line.name }}</td>
                  @if (t === 'ADJUSTMENT') {
                    <td class="p-2">
                      <select class="border rounded px-2 py-1" [(ngModel)]="line.direction">
                        <option value="IN">Entrada</option>
                        <option value="OUT">Salida</option>
                      </select>
                    </td>
                  }
                  <td class="p-2"><input pInputText type="number" min="0" step="any" class="w-28" [(ngModel)]="line.quantity" /></td>
                  <td class="p-2">
                    <select class="border rounded px-2 py-1" [(ngModel)]="line.unitId">
                      @for (u of line.units; track u.id) {
                        <option [value]="u.id">{{ u.code }}{{ u.factor !== 1 ? ' (' + q(u.factor) + ')' : '' }}</option>
                      }
                    </select>
                  </td>
                  @if (t === 'COUNT') {
                    <td class="p-2 text-right">{{ q(line.currentQuantity) }} {{ line.baseUnitCode }}</td>
                    <td class="p-2 text-right" [class.text-danger]="difference(line) < 0"
                        [class.text-success]="difference(line) > 0">{{ q(difference(line)) }}</td>
                  }
                  @if (t === 'INITIAL' || t === 'ADJUSTMENT') {
                    <td class="p-2">
                      @if (t === 'INITIAL' || line.direction === 'IN') {
                        <input pInputText appPesos="2" class="w-32" [(ngModel)]="line.unitCost"
                               [placeholder]="t === 'ADJUSTMENT' ? 'Costo promedio' : ''" />
                      } @else {
                        <span class="text-muted text-xs">Costo promedio</span>
                      }
                    </td>
                  }
                  <td class="p-2 text-right">
                    <p-button label="Quitar" size="small" [text]="true" severity="danger" (onClick)="remove(i)" />
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="p-6 text-center text-muted">Agrega productos escaneando o buscando.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="flex justify-end gap-2 mt-4 max-w-5xl items-center">
        @if (problem(); as message) {
          <span class="text-sm text-warning">{{ message }}</span>
        }
        <a routerLink="/app/inventario/movimientos"><p-button label="Cancelar" [text]="true" severity="secondary" /></a>
        <p-button label="Registrar" [loading]="saving()" [disabled]="problem() !== null" (onClick)="save()" />
      </div>
    } @else {
      <p class="text-muted">Tipo de documento desconocido.</p>
    }
  `,
})
export class InventoryDocumentEditorComponent implements OnInit, HasUnsavedChanges {
  /** Segmento de ruta :kind (saldo-inicial, ajuste, traslado, conteo). */
  readonly kind = input.required<string>();

  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);

  protected readonly labels = DOCUMENT_LABEL;
  protected readonly help: Record<InventoryDocumentType, string> = {
    INITIAL: 'Carga la existencia con la que arrancas en una sucursal, con su costo. Solo para productos sin movimientos en esa sucursal.',
    ADJUSTMENT: 'Entradas o salidas por daño, vencimiento, donación, etc. Las salidas se valoran al costo promedio.',
    TRANSFER: 'Mueve mercancía de una sucursal a otra al instante.',
    COUNT: 'Escribe lo que contaste: el sistema ajusta la diferencia con lo registrado.',
  };
  protected readonly q = formatQuantity;
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
    return linesProblem(t, this.lines());
  }

  protected difference(line: DraftLine): number {
    const counted = baseQuantity(line);
    return counted === null || line.currentQuantity === null ? 0 : counted - line.currentQuantity;
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && (this.lines().length > 0 || this.reason.trim() !== '' || this.notes.trim() !== '');
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
    this.lines.update((list) => [...list, line]);
    if (this.type() === 'COUNT' && this.branchId) {
      this.loadCurrent(this.branchId, product.id);
    }
  }

  remove(index: number): void {
    this.lines.update((list) => list.filter((_, i) => i !== index));
  }

  refreshBalances(): void {
    if (this.type() !== 'COUNT' || !this.branchId) {
      return;
    }
    // Lo de la sucursal anterior no sirve: sin dato, el servidor compara con el saldo actual (nunca con otra sucursal).
    this.lines.update((list) => list.map((l) => ({ ...l, currentQuantity: null })));
    for (const line of this.lines()) {
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
