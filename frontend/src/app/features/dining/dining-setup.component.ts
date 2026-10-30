import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, concatMap, from, last } from 'rxjs';
import { BranchOption, DiningApi, DiningTable, DiningZone } from '../../core/api/dining.api';
import { problemMessage } from '../../core/errors/problem';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

/** Nombres "1".."n" que aún no existen en la sucursal, empezando en {@code from}. */
export function nextTableNames(existing: readonly string[], fromNumber: number, count: number): string[] {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const names: string[] = [];
  for (let n = Math.max(1, fromNumber); names.length < count && n < fromNumber + 500; n++) {
    if (!taken.has(String(n))) {
      names.push(String(n));
    }
  }
  return names;
}

/**
 * Configurar mesas (Fase 12b-2, decisión 269): zonas de la sucursal (Salón, Terraza, Barra) y sus mesas con nombre y
 * puestos. Varias mesas numeradas se crean de una vez. Desactivar oculta del salón sin borrar el historial.
 */
@Component({
  selector: 'app-dining-setup',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SkeletonModule, PageHeaderComponent,
    FormDialogComponent, EmptyStateComponent],
  template: `
    <app-page-header title="Configurar mesas" description="Zonas de tu local y sus mesas. El nombre de la mesa es el que ve el mesero (4, Barra 2, Terraza A).">
      <a pButton routerLink="/app/mesas" label="Ver el salón" icon="pi pi-arrow-left" severity="secondary" [outlined]="true"></a>
      <p-button label="Nueva zona" icon="pi pi-plus" (onClick)="openZone(null)" />
    </app-page-header>

    @if (branches().length > 1) {
      <label class="flex items-center gap-2 text-sm mb-4">
        <span class="font-semibold">Sucursal</span>
        <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="branchId()" (ngModelChange)="changeBranch($event)">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    }

    @if (zones(); as list) {
      @if (list.length === 0) {
        <app-empty-state icon="pi pi-table" title="Crea tu primera zona"
                         message="Por ejemplo Salón o Terraza. Luego agregas sus mesas de una vez (1 a 10)."
                         actionLabel="Nueva zona" (action)="openZone(null)" />
      }
      <div class="flex flex-col gap-4">
        @for (z of list; track z.id) {
          <section class="card p-5 flex flex-col gap-3" [class.opacity-60]="!z.active" [attr.aria-labelledby]="'z-' + z.id">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 [id]="'z-' + z.id" class="text-lg font-extrabold tracking-tight">{{ z.name }}{{ z.active ? '' : ' · Inactiva' }}</h2>
              <div class="flex flex-wrap gap-2">
                <p-button label="Agregar mesas" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openBulk(z)" />
                <p-button icon="pi pi-pencil" size="small" [text]="true" severity="secondary" [ariaLabel]="'Editar zona ' + z.name"
                          (onClick)="openZone(z)" />
              </div>
            </div>
            @if (z.tables.length === 0) {
              <p class="text-sm text-muted">Sin mesas todavía.</p>
            }
            <ul class="flex flex-wrap gap-2" [attr.aria-label]="'Mesas de ' + z.name">
              @for (t of z.tables; track t.id) {
                <li>
                  <button type="button" class="table-chip" [class.opacity-50]="!t.active" (click)="openTable(t)"
                          [attr.aria-label]="'Editar mesa ' + t.name">
                    <span class="font-extrabold">{{ t.name }}</span>
                    <span class="text-xs text-muted">{{ t.seats ? t.seats + ' p.' : '' }}{{ t.active ? '' : ' inactiva' }}</span>
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    } @else {
      <p-skeleton height="10rem" borderRadius="1.25rem" />
    }

    <app-form-dialog [(visible)]="zoneOpen" [header]="editingZone() ? 'Editar zona' : 'Nueva zona'" width="26rem"
                     [dirty]="true" [invalidMessage]="zoneName.trim() ? null : 'Escribe el nombre de la zona.'"
                     [save]="zoneRequest" [successMessage]="editingZone() ? 'Zona guardada' : 'Zona creada'" (saved)="load()">
      <div class="flex flex-col gap-1">
        <label for="zone-name" class="text-sm font-semibold">Nombre</label>
        <input pInputText id="zone-name" maxlength="40" placeholder="Salón, Terraza, Barra" [(ngModel)]="zoneName" />
      </div>
      @if (editingZone()) {
        <div class="flex flex-col gap-1">
          <label for="zone-position" class="text-sm font-semibold">Orden</label>
          <input pInputText id="zone-position" type="number" min="0" max="1000" [(ngModel)]="zonePosition" />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="size-4" [(ngModel)]="zoneActive" />Activa (sale en el salón)
        </label>
      }
    </app-form-dialog>

    <app-form-dialog [(visible)]="bulkOpen" [header]="'Agregar mesas a ' + (bulkZone()?.name ?? '')" width="26rem"
                     submitLabel="Crear mesas" [dirty]="true" [invalidMessage]="bulkProblem()" [save]="bulkRequest"
                     successMessage="Mesas creadas" (saved)="load()"
                     description="Se crean numeradas; los números que ya existen en la sucursal se saltan. Después puedes renombrarlas.">
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for="bulk-from" class="text-sm font-semibold">Desde el número</label>
          <input pInputText id="bulk-from" type="number" min="1" [(ngModel)]="bulkFrom" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="bulk-count" class="text-sm font-semibold">Cuántas</label>
          <input pInputText id="bulk-count" type="number" min="1" max="50" [(ngModel)]="bulkCount" />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label for="bulk-seats" class="text-sm font-semibold">Puestos de cada una <span class="font-normal text-muted">(opcional)</span></label>
        <input pInputText id="bulk-seats" type="number" min="1" max="99" [(ngModel)]="bulkSeats" />
      </div>
    </app-form-dialog>

    <app-form-dialog [(visible)]="tableOpen" [header]="'Mesa ' + (editingTable()?.name ?? '')" width="26rem" [dirty]="true"
                     [invalidMessage]="tableName.trim() ? null : 'Escribe el nombre de la mesa.'" [save]="tableRequest"
                     successMessage="Mesa guardada" (saved)="load()">
      <div class="flex flex-col gap-1">
        <label for="table-name" class="text-sm font-semibold">Nombre</label>
        <input pInputText id="table-name" maxlength="20" [(ngModel)]="tableName" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label for="table-seats" class="text-sm font-semibold">Puestos</label>
          <input pInputText id="table-seats" type="number" min="1" max="99" [(ngModel)]="tableSeats" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="table-zone" class="text-sm font-semibold">Zona</label>
          <select id="table-zone" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="tableZone">
            @for (z of zones() ?? []; track z.id) {
              <option [value]="z.id">{{ z.name }}</option>
            }
          </select>
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="size-4" [(ngModel)]="tableActive" />Activa (sale en el salón)
      </label>
    </app-form-dialog>
  `,
  styles: `
    .table-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 4rem;
      min-height: 3.5rem;
      padding: 0.375rem 0.75rem;
      border-radius: 1rem;
      border: 1px solid var(--surface-border);
      background: var(--surface-alt);
    }
    .table-chip:hover { border-color: var(--brand); }
  `,
})
export class DiningSetupComponent implements OnInit {
  private readonly api = inject(DiningApi);
  private readonly messages = inject(MessageService);

  protected readonly branches = signal<BranchOption[]>([]);
  protected readonly branchId = signal<string | null>(null);
  protected readonly zones = signal<DiningZone[] | null>(null);
  protected readonly editingZone = signal<DiningZone | null>(null);
  protected readonly editingTable = signal<DiningTable | null>(null);
  protected readonly bulkZone = signal<DiningZone | null>(null);

  protected zoneOpen = false;
  protected zoneName = '';
  protected zonePosition = 0;
  protected zoneActive = true;
  protected bulkOpen = false;
  protected bulkFrom = 1;
  protected bulkCount = 10;
  protected bulkSeats: number | null = 4;
  protected tableOpen = false;
  protected tableName = '';
  protected tableSeats: number | null = null;
  protected tableZone = '';
  protected tableActive = true;

  ngOnInit(): void {
    // El salón dice qué sucursales atiende el usuario y cuál va primero.
    this.api.floor(null).subscribe({
      next: (f) => {
        this.branches.set(f.branches);
        this.branchId.set(f.branchId);
        this.load();
      },
      error: (e: unknown) => {
        this.zones.set([]);
        this.messages.add({ severity: 'error', summary: 'No se pudieron cargar las mesas', detail: problemMessage(e) });
      },
    });
  }

  load(): void {
    this.api.zones(this.branchId()).subscribe((z) => this.zones.set(z));
  }

  protected changeBranch(id: string): void {
    this.branchId.set(id);
    this.zones.set(null);
    this.load();
  }

  protected openZone(zone: DiningZone | null): void {
    this.editingZone.set(zone);
    this.zoneName = zone?.name ?? '';
    this.zonePosition = zone?.position ?? 0;
    this.zoneActive = zone?.active ?? true;
    this.zoneOpen = true;
  }

  protected readonly zoneRequest = (): Observable<DiningZone> => {
    const zone = this.editingZone();
    return zone
      ? this.api.updateZone(zone.id, this.zoneName.trim(), Number(this.zonePosition) || 0, this.zoneActive)
      : this.api.createZone(this.branchId() ?? '', this.zoneName.trim());
  };

  protected openBulk(zone: DiningZone): void {
    this.bulkZone.set(zone);
    const numbers = (this.zones() ?? []).flatMap((z) => z.tables.map((t) => Number(t.name))).filter((n) => Number.isInteger(n));
    this.bulkFrom = numbers.length ? Math.max(...numbers) + 1 : 1;
    this.bulkCount = 10;
    this.bulkOpen = true;
  }

  protected bulkProblem(): string | null {
    if (!(this.bulkCount >= 1 && this.bulkCount <= 50)) {
      return 'Crea de 1 a 50 mesas a la vez.';
    }
    if (this.bulkSeats !== null && !(this.bulkSeats >= 1 && this.bulkSeats <= 99)) {
      return 'Los puestos van de 1 a 99.';
    }
    return null;
  }

  /** Una por una, en orden (así quedan numeradas en el salón). */
  protected readonly bulkRequest = (): Observable<DiningTable> => {
    const zone = this.bulkZone();
    const existing = (this.zones() ?? []).flatMap((z) => z.tables.map((t) => t.name));
    const names = nextTableNames(existing, Number(this.bulkFrom) || 1, Number(this.bulkCount));
    return from(names).pipe(concatMap((name) => this.api.createTable(zone?.id ?? '', name, this.bulkSeats || null)), last());
  };

  protected openTable(table: DiningTable): void {
    this.editingTable.set(table);
    this.tableName = table.name;
    this.tableSeats = table.seats;
    this.tableZone = table.zoneId;
    this.tableActive = table.active;
    this.tableOpen = true;
  }

  protected readonly tableRequest = (): Observable<DiningTable> => {
    const table = this.editingTable();
    return this.api.updateTable(table?.id ?? '', {
      zoneId: this.tableZone, name: this.tableName.trim(), seats: this.tableSeats || null, position: table?.position ?? 0,
      active: this.tableActive,
    });
  };
}
