import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
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
import { DraftLine, baseQuantity, draftLine, linesProblem, toLineInputs } from './document-lines';
import { DOCUMENT_LABEL, documentNumber, documentTypeFromRoute } from './labels';

/**
 * Editor de documentos de inventario: saldo inicial, ajuste, traslado o conteo físico.
 * Los productos se agregan escaneando el código de barras (o escribiendo SKU) y Enter, o buscando por nombre.
 */
@Component({
  selector: 'app-inventory-document-editor',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <a routerLink="/app/inventario/movimientos" class="text-sm text-blue-600 hover:underline">← Movimientos</a>
    @if (type(); as t) {
      <h1 class="text-2xl font-semibold mb-1">{{ labels[t] }}</h1>
      <p class="text-sm text-slate-600 mb-4">{{ help[t] }}</p>

      <section class="bg-white rounded-xl shadow p-4 grid gap-3 md:grid-cols-3 max-w-5xl">
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

      <section class="bg-white rounded-xl shadow p-4 mt-4 max-w-5xl flex flex-col gap-3">
        <div class="flex flex-wrap gap-2 items-center">
          <input pInputText class="flex-1 min-w-64" placeholder="Escanea el código o escribe SKU/nombre y presiona Enter"
                 [(ngModel)]="code" (keyup.enter)="add()" autofocus />
          <p-button label="Agregar" [loading]="adding()" (onClick)="add()" />
        </div>
        @if (results().length > 0) {
          <ul class="border rounded divide-y text-sm max-h-60 overflow-y-auto">
            @for (r of results(); track r.id) {
              <li><button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50" (click)="pick(r, null)">
                <span class="font-mono">{{ r.sku }}</span> {{ r.name }}</button></li>
            }
          </ul>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
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
                    <td class="p-2 text-right" [class.text-red-700]="difference(line) < 0"
                        [class.text-green-700]="difference(line) > 0">{{ q(difference(line)) }}</td>
                  }
                  @if (t === 'INITIAL' || t === 'ADJUSTMENT') {
                    <td class="p-2">
                      @if (t === 'INITIAL' || line.direction === 'IN') {
                        <input pInputText type="number" min="0" step="0.01" class="w-32" [(ngModel)]="line.unitCost"
                               [placeholder]="t === 'ADJUSTMENT' ? 'Costo promedio' : ''" />
                      } @else {
                        <span class="text-slate-500 text-xs">Costo promedio</span>
                      }
                    </td>
                  }
                  <td class="p-2 text-right">
                    <p-button label="Quitar" size="small" [text]="true" severity="danger" (onClick)="remove(i)" />
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="p-6 text-center text-slate-500">Agrega productos escaneando o buscando.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="flex justify-end gap-2 mt-4 max-w-5xl items-center">
        @if (problem(); as message) {
          <span class="text-sm text-amber-700">{{ message }}</span>
        }
        <a routerLink="/app/inventario/movimientos"><p-button label="Cancelar" [text]="true" severity="secondary" /></a>
        <p-button label="Registrar" [loading]="saving()" [disabled]="problem() !== null" (onClick)="save()" />
      </div>
    } @else {
      <p class="text-slate-500">Tipo de documento desconocido.</p>
    }
  `,
})
export class InventoryDocumentEditorComponent implements OnInit {
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
  /** Una clave por documento: si el envío se repite (doble clic, reintento) no se duplica. */
  private readonly idempotencyKey = newKey();

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => {
      const active = p.content.filter((b) => b.active);
      this.branches.set(active);
      this.branchId = active.find((b) => b.code === 'PRINCIPAL')?.id ?? active[0]?.id ?? '';
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

  add(): void {
    const code = this.code.trim();
    if (!code) {
      return;
    }
    this.adding.set(true);
    this.results.set([]);
    this.api.lookup(code).subscribe({
      next: (found) => this.catalog.product(found.productId).subscribe({
        next: (p) => this.pick(p, found.unitId),
        error: () => this.adding.set(false),
      }),
      error: () => {
        // No es un código: buscar por nombre.
        this.catalog.products({ page: 0, size: 10, search: code }).subscribe({
          next: (page) => {
            this.adding.set(false);
            const tracked = page.content.filter((p) => p.trackInventory);
            if (tracked.length === 1) {
              this.pick(tracked[0], null);
            } else if (tracked.length === 0) {
              this.messages.add({ severity: 'warn', summary: 'Sin resultados', detail: `No hay productos con "${code}".` });
            } else {
              this.results.set(tracked);
            }
          },
          error: () => this.adding.set(false),
        });
      },
    });
  }

  pick(product: Product, unitId: string | null): void {
    this.adding.set(false);
    this.results.set([]);
    this.code = '';
    if (!product.trackInventory) {
      this.messages.add({ severity: 'warn', summary: 'No controla inventario', detail: product.name });
      return;
    }
    if (this.lines().some((l) => l.productId === product.id)) {
      this.messages.add({ severity: 'info', summary: 'Ya está en la lista', detail: product.name });
      return;
    }
    const line = draftLine(product, unitId);
    this.lines.update((list) => [...list, line]);
    if (this.type() === 'COUNT' && this.branchId) {
      this.api.balance(this.branchId, product.id).subscribe((row) => this.setCurrent(product.id, row.quantity));
    }
  }

  remove(index: number): void {
    this.lines.update((list) => list.filter((_, i) => i !== index));
  }

  refreshBalances(): void {
    if (this.type() !== 'COUNT' || !this.branchId) {
      return;
    }
    for (const line of this.lines()) {
      this.api.balance(this.branchId, line.productId).subscribe((row) => this.setCurrent(line.productId, row.quantity));
    }
  }

  save(): void {
    const t = this.type();
    if (!t || this.problem() !== null) {
      return;
    }
    this.saving.set(true);
    this.api
      .create(t, {
        branchId: this.branchId,
        toBranchId: this.toBranchId || null,
        reason: this.reason.trim() || null,
        notes: this.notes.trim() || null,
        lines: toLineInputs(t, this.lines()),
      }, this.idempotencyKey)
      .subscribe({
        next: (doc: InventoryDocument) => {
          this.saving.set(false);
          this.messages.add({ severity: 'success', summary: `${DOCUMENT_LABEL[doc.type]} registrado`,
            detail: documentNumber(doc.number) });
          void this.router.navigate(['/app/inventario/movimientos']);
        },
        error: () => this.saving.set(false),
      });
  }

  private setCurrent(productId: string, quantity: number): void {
    this.lines.update((list) => list.map((l) => (l.productId === productId ? { ...l, currentQuantity: quantity } : l)));
  }
}

function newKey(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return 'inv-' + random;
}
