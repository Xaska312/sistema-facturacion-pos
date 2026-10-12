import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Plan, PlanInput } from '../../core/api/api.models';
import { PlatformApi } from '../../core/api/platform.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';
import { limitText } from './platform-labels';

interface PlanDraft {
  name: string;
  maxBranches: number | null;
  maxUsers: number | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  active: boolean;
}

/** Planes de suscripción: límites y precios (fase 8b). Límite vacío = sin límite; precio vacío = sin definir. */
@Component({
  selector: 'app-platform-plans',
  imports: [FormsModule, ButtonModule, InputTextModule, FormDialogComponent, PesosInputDirective, PageHeaderComponent,
    DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Planes"
                     description="Límites y precios de cada plan. Un cambio de límites aplica al crear sucursales o invitar usuarios; lo que ya existe sigue funcionando." />

    <app-data-table [columns]="columns" [items]="plans()" [loading]="loading()" [trackBy]="trackByCode"
                    caption="Planes de suscripción" emptyIcon="pi pi-tags"
                    emptyTitle="No hay planes">
      <ng-template appCell="monthly" let-row>{{ price(row.monthlyPrice) }}</ng-template>
      <ng-template appCell="annual" let-row>{{ price(row.annualPrice) }}</ng-template>
      <ng-template #actions let-row>
        <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="edit(row)"
                  [ariaLabel]="'Editar el plan ' + row.name" />
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="editOpen" [header]="'Editar plan ' + (target()?.name ?? '')" width="30rem"
                     [dirty]="dirty()" [invalidMessage]="problem()" [save]="saveRequest"
                     successMessage="Plan guardado" (saved)="load()">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label for="plan-name" class="text-sm font-medium">Nombre</label>
          <input pInputText id="plan-name" maxlength="60" [(ngModel)]="draft.name" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="plan-branches" class="text-sm font-medium">Máximo de sucursales</label>
            <input pInputText id="plan-branches" type="number" min="1" [(ngModel)]="draft.maxBranches" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="plan-users" class="text-sm font-medium">Máximo de usuarios</label>
            <input pInputText id="plan-users" type="number" min="1" [(ngModel)]="draft.maxUsers" />
          </div>
        </div>
        <small class="text-muted -mt-1">Vacío = sin límite. Los usuarios cuentan las invitaciones pendientes.</small>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="plan-monthly" class="text-sm font-medium">Precio mensual</label>
            <input pInputText id="plan-monthly" appPesos [(ngModel)]="draft.monthlyPrice" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="plan-annual" class="text-sm font-medium">Precio anual</label>
            <input pInputText id="plan-annual" appPesos [(ngModel)]="draft.annualPrice" />
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" [(ngModel)]="draft.active" />
          Activo (se puede elegir en pagos y códigos nuevos)
        </label>
      </div>
    </app-form-dialog>
  `,
})
export class PlatformPlansComponent implements OnInit {
  private readonly platform = inject(PlatformApi);

  protected readonly plans = signal<Plan[]>([]);
  protected readonly loading = signal(true);
  protected readonly target = signal<Plan | null>(null);
  protected editOpen = false;
  protected draft: PlanDraft = emptyDraft();
  private snapshot = '';

  protected readonly trackByCode = (row: Plan): string => row.code;
  protected readonly columns: ColumnDef<Plan>[] = [
    { header: 'Plan', cell: (p) => p.name },
    { header: 'Sucursales', cell: (p) => limitText(p.maxBranches) },
    { header: 'Usuarios', cell: (p) => limitText(p.maxUsers) },
    { header: 'Precio mensual', cell: (p) => p.monthlyPrice, template: 'monthly' },
    { header: 'Precio anual', cell: (p) => p.annualPrice, template: 'annual' },
    { header: 'Estado', cell: (p) => activeStatus(p.active), kind: 'status' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.platform.plans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected price(value: number | null): string {
    return value === null ? 'Sin definir' : formatCop(value);
  }

  edit(plan: Plan): void {
    this.target.set(plan);
    this.draft = { name: plan.name, maxBranches: plan.maxBranches, maxUsers: plan.maxUsers,
      monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice, active: plan.active };
    this.snapshot = JSON.stringify(this.draft);
    this.editOpen = true;
  }

  protected dirty(): boolean {
    return JSON.stringify(this.draft) !== this.snapshot;
  }

  protected problem(): string | null {
    if (!this.draft.name.trim()) {
      return 'Escribe el nombre del plan.';
    }
    if (!validLimit(this.draft.maxBranches) || !validLimit(this.draft.maxUsers)) {
      return 'Los límites son números enteros desde 1 (o vacíos, sin límite).';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<Plan> => {
    const target = this.target();
    if (!target) {
      throw new Error('Sin plan seleccionado');
    }
    const input: PlanInput = {
      name: this.draft.name.trim(),
      maxBranches: toLimit(this.draft.maxBranches),
      maxUsers: toLimit(this.draft.maxUsers),
      monthlyPrice: this.draft.monthlyPrice,
      annualPrice: this.draft.annualPrice,
      active: this.draft.active,
    };
    return this.platform.updatePlan(target.code, input);
  };
}

function emptyDraft(): PlanDraft {
  return { name: '', maxBranches: null, maxUsers: null, monthlyPrice: null, annualPrice: null, active: true };
}

/** El campo numérico vacío llega como null o ''. */
function toLimit(value: number | null): number | null {
  return value === null || String(value) === '' ? null : Number(value);
}

function validLimit(value: number | null): boolean {
  const limit = toLimit(value);
  return limit === null || (Number.isInteger(limit) && limit >= 1);
}
