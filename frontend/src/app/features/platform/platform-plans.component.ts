import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { AiAllowance, Plan, PlanFeature, PlanInput } from '../../core/api/api.models';
import { BUSINESS_MODULES } from '../../shared/business-types';
import { PLAN_ONLY_FEATURES, includedText, toggle } from './plan-features';
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
  maxRegisters: number | null;
  modules: string[];
  features: PlanFeature[];
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
                     description="Límites, lo que incluye y precios de cada plan. Un cambio aplica en la siguiente renovación de la sesión de cada usuario; lo que ya existe sigue funcionando." />

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

    <section class="card p-4 mt-4 flex flex-col gap-3" aria-labelledby="ai-title">
      <div>
        <h2 id="ai-title" class="font-bold tracking-tight">XASKA IA (adicional)</h2>
        <p class="text-xs text-muted">Ningún plan lo trae: se le da a cada negocio en Suscripciones → Dar extras →
          "XASKA IA". Estos son los topes al mes de cada función, iguales para todos los que lo tienen.</p>
      </div>
      @for (a of allowances(); track a.code) {
        <form class="flex flex-wrap items-end gap-3" (ngSubmit)="saveAllowance(a.code)">
          <label class="flex flex-col gap-1 flex-1 min-w-56">
            <span class="text-sm font-medium">{{ a.name }} al mes</span>
            <input pInputText type="number" min="0" max="100000" [name]="'ai-' + a.code"
                   [(ngModel)]="allowanceDrafts[a.code]" />
          </label>
          <p-button type="submit" label="Guardar" icon="pi pi-check" [outlined]="true"
                    [loading]="savingAllowance() === a.code"
                    [disabled]="allowanceDrafts[a.code] === a.monthlyLimit" />
        </form>
      } @empty {
        <p class="text-sm text-muted">Cargando…</p>
      }
    </section>

    <app-form-dialog [(visible)]="editOpen" [header]="'Editar plan ' + (target()?.name ?? '')" width="36rem"
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
          <div class="flex flex-col gap-1">
            <label for="plan-registers" class="text-sm font-medium">Máximo de cajas</label>
            <input pInputText id="plan-registers" type="number" min="1" [(ngModel)]="draft.maxRegisters" />
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
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Módulos que incluye</legend>
          <div class="grid grid-cols-2 gap-1">
            @for (m of modules; track m.code) {
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" [ngModel]="draft.modules.includes(m.code)"
                       (ngModelChange)="draft.modules = toggleIn(draft.modules, m.code, $event)" />{{ m.label }}
              </label>
            }
          </div>
        </fieldset>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Funciones que incluye</legend>
          <div class="grid grid-cols-2 gap-1">
            @for (f of features; track f.code) {
              <label class="flex items-center gap-2 text-sm" [title]="f.description">
                <input type="checkbox" [ngModel]="draft.features.includes(f.code)"
                       (ngModelChange)="draft.features = toggleIn(draft.features, f.code, $event)" />{{ f.label }}
              </label>
            }
          </div>
        </fieldset>
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
  private readonly messages = inject(MessageService);

  protected readonly plans = signal<Plan[]>([]);
  protected readonly loading = signal(true);
  protected readonly target = signal<Plan | null>(null);
  protected readonly allowances = signal<AiAllowance[]>([]);
  protected readonly savingAllowance = signal<string | null>(null);
  protected allowanceDrafts: Record<string, number> = {};
  protected editOpen = false;
  protected draft: PlanDraft = emptyDraft();
  private snapshot = '';

  protected readonly modules = BUSINESS_MODULES;
  protected readonly features = PLAN_ONLY_FEATURES;
  protected readonly toggleIn = toggle;
  protected readonly trackByCode = (row: Plan): string => row.code;
  protected readonly columns: ColumnDef<Plan>[] = [
    { header: 'Plan', cell: (p) => p.name },
    { header: 'Sucursales', cell: (p) => limitText(p.maxBranches) },
    { header: 'Usuarios', cell: (p) => limitText(p.maxUsers) },
    { header: 'Cajas', cell: (p) => limitText(p.maxRegisters) },
    { header: 'Incluye', cell: (p) => includedText(p.modules, p.features) + (p.legacy ? ' (plan anterior)' : '') },
    { header: 'Precio mensual', cell: (p) => p.monthlyPrice, template: 'monthly' },
    { header: 'Precio anual', cell: (p) => p.annualPrice, template: 'annual' },
    { header: 'Estado', cell: (p) => activeStatus(p.active), kind: 'status' },
  ];

  ngOnInit(): void {
    this.load();
    this.loadAllowances();
  }

  private loadAllowances(): void {
    this.platform.aiAllowances().subscribe((list) => {
      this.allowances.set(list);
      this.allowanceDrafts = Object.fromEntries(list.map((a) => [a.code, a.monthlyLimit]));
    });
  }

  saveAllowance(code: string): void {
    const value = Number(this.allowanceDrafts[code]);
    if (!Number.isInteger(value) || value < 0 || value > 100000) {
      this.messages.add({ severity: 'warn', summary: 'XASKA IA', detail: 'El tope al mes va de 0 a 100.000.' });
      return;
    }
    this.savingAllowance.set(code);
    this.platform.updateAiAllowance(code, value).subscribe({
      next: (saved) => {
        this.savingAllowance.set(null);
        this.allowances.update((list) => list.map((a) => (a.code === code ? saved : a)));
        this.allowanceDrafts[code] = saved.monthlyLimit;
        this.messages.add({ severity: 'success', summary: 'Tope guardado', detail: saved.name, life: 3000 });
      },
      error: () => this.savingAllowance.set(null),
    });
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
      maxRegisters: plan.maxRegisters, modules: [...plan.modules], features: [...plan.features],
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
    if (!validLimit(this.draft.maxBranches) || !validLimit(this.draft.maxUsers) || !validLimit(this.draft.maxRegisters)) {
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
      maxRegisters: toLimit(this.draft.maxRegisters),
      modules: this.draft.modules,
      features: this.draft.features,
      monthlyPrice: this.draft.monthlyPrice,
      annualPrice: this.draft.annualPrice,
      active: this.draft.active,
    };
    return this.platform.updatePlan(target.code, input);
  };
}

function emptyDraft(): PlanDraft {
  return { name: '', maxBranches: null, maxUsers: null, maxRegisters: null, modules: [], features: [], monthlyPrice: null,
    annualPrice: null, active: true };
}

/** El campo numérico vacío llega como null o ''. */
function toLimit(value: number | null): number | null {
  return value === null || String(value) === '' ? null : Number(value);
}

function validLimit(value: number | null): boolean {
  const limit = toLimit(value);
  return limit === null || (Number.isInteger(limit) && limit >= 1);
}
