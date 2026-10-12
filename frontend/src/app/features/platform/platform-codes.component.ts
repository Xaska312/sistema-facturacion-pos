import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { ActivationCode, CodeInput, CreatedCodes, Plan } from '../../core/api/api.models';
import { PlatformApi } from '../../core/api/platform.api';
import { copyToClipboard } from '../../shared/clipboard';
import { ConfirmService } from '../../shared/confirm';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';
import { CODE_STATUS_LABEL, codeStatusKey } from './platform-labels';

interface CodeDraft {
  planCode: string;
  months: number | null;
  validDays: number | null;
  quantity: number | null;
  note: string;
}

/**
 * Códigos de activación (fase 8b): se generan al vender un plan y el cliente los usa al crear su negocio. El código
 * completo se muestra una sola vez (el servidor guarda solo el hash).
 */
@Component({
  selector: 'app-platform-codes',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, FormDialogComponent, PageHeaderComponent,
    DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Códigos de activación"
                     description="Genera un código al vender un plan: el cliente lo escribe al crear su negocio. Cada código sirve una sola vez.">
      <p-button label="Generar códigos" icon="pi pi-plus" (onClick)="openGenerate()" [disabled]="plans().length === 0" />
    </app-page-header>

    <app-data-table [columns]="columns" [items]="codes()" [loading]="loading()" [trackBy]="trackById"
                    caption="Códigos de activación" emptyIcon="pi pi-key" emptyTitle="Aún no hay códigos"
                    emptyMessage="Genera uno cuando vendas un plan.">
      <ng-template appCell="code" let-row>
        <span class="font-mono">…{{ row.hint }}</span>
      </ng-template>
      <ng-template #actions let-row>
        @if (row.status === 'AVAILABLE') {
          <p-button label="Anular" icon="pi pi-ban" size="small" severity="danger" [text]="true" (onClick)="revoke(row)"
                    [ariaLabel]="'Anular el código terminado en ' + row.hint" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="generateOpen" header="Generar códigos" width="30rem" submitLabel="Generar"
                     submitIcon="pi pi-key" [dirty]="dirty()" [invalidMessage]="problem()" [save]="generateRequest"
                     [successMessage]="null" (saved)="onGenerated($event)">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label for="code-plan" class="text-sm font-medium">Plan</label>
          <select id="code-plan" class="border rounded-md px-2 py-2" [(ngModel)]="draft.planCode">
            @for (plan of plans(); track plan.code) {
              <option [value]="plan.code">{{ plan.name }}</option>
            }
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="code-months" class="text-sm font-medium">Meses incluidos</label>
            <input pInputText id="code-months" type="number" min="1" max="36" [(ngModel)]="draft.months" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="code-days" class="text-sm font-medium">Vigencia (días)</label>
            <input pInputText id="code-days" type="number" min="1" max="365" [(ngModel)]="draft.validDays" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="code-quantity" class="text-sm font-medium">Cantidad</label>
          <input pInputText id="code-quantity" type="number" min="1" max="20" [(ngModel)]="draft.quantity" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="code-note" class="text-sm font-medium">Nota (opcional)</label>
          <input pInputText id="code-note" maxlength="200" [(ngModel)]="draft.note"
                 placeholder="A quién se lo vendiste" />
        </div>
      </div>
    </app-form-dialog>

    <p-dialog header="Códigos generados" [(visible)]="resultOpen" [modal]="true" [closable]="false"
              [closeOnEscape]="false" [style]="{ width: 'min(30rem, 95vw)' }">
      <p class="text-danger font-medium text-sm mb-3">Cópialos ahora: por seguridad no se vuelven a mostrar.</p>
      <ul class="flex flex-col gap-2">
        @for (code of generated(); track code) {
          <li class="flex items-center gap-2">
            <code class="flex-1 rounded-md bg-surface-alt px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest">{{ code }}</code>
            <p-button icon="pi pi-copy" [text]="true" [ariaLabel]="'Copiar ' + code" (onClick)="copy(code)" />
          </li>
        }
      </ul>
      <ng-template #footer>
        <p-button label="Ya los copié" icon="pi pi-check" (onClick)="closeResult()" />
      </ng-template>
    </p-dialog>
  `,
})
export class PlatformCodesComponent implements OnInit {
  private readonly platform = inject(PlatformApi);
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(MessageService);

  protected readonly codes = signal<ActivationCode[]>([]);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly loading = signal(true);
  protected readonly generated = signal<string[]>([]);
  protected generateOpen = false;
  protected resultOpen = false;
  protected draft: CodeDraft = emptyDraft('');
  private snapshot = '';

  protected readonly trackById = (row: ActivationCode): string => row.id;
  protected readonly columns: ColumnDef<ActivationCode>[] = [
    { header: 'Código', cell: (c) => c.hint, template: 'code' },
    { header: 'Plan', cell: (c) => c.planName },
    { header: 'Meses', cell: (c) => c.months, kind: 'number' },
    { header: 'Estado', cell: (c) => codeStatusKey(c.status), kind: 'status', statusLabel: (c) => CODE_STATUS_LABEL[c.status] },
    { header: 'Vence', cell: (c) => c.expiresAt, kind: 'date', hideOnMobile: true },
    { header: 'Usado en', cell: (c) => c.usedTenantName ?? '—' },
    { header: 'Nota', cell: (c) => c.note ?? '—', hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.platform.plans().subscribe((plans) => this.plans.set(plans.filter((p) => p.active)));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.platform.codes().subscribe({
      next: (codes) => {
        this.codes.set(codes);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openGenerate(): void {
    this.draft = emptyDraft(this.plans()[0]?.code ?? '');
    this.snapshot = JSON.stringify(this.draft);
    this.generateOpen = true;
  }

  protected dirty(): boolean {
    return JSON.stringify(this.draft) !== this.snapshot;
  }

  protected problem(): string | null {
    const d = this.draft;
    if (!d.planCode) {
      return 'Elige el plan.';
    }
    if (!inRange(d.months, 1, 36)) {
      return 'Los meses incluidos van de 1 a 36.';
    }
    if (!inRange(d.validDays, 1, 365)) {
      return 'La vigencia va de 1 a 365 días.';
    }
    if (!inRange(d.quantity, 1, 20)) {
      return 'Se generan de 1 a 20 códigos a la vez.';
    }
    return null;
  }

  protected readonly generateRequest = (): Observable<CreatedCodes> => {
    const d = this.draft;
    const input: CodeInput = {
      planCode: d.planCode,
      months: Number(d.months),
      validDays: Number(d.validDays),
      quantity: Number(d.quantity),
      note: d.note.trim() || null,
    };
    return this.platform.createCodes(input);
  };

  onGenerated(result: unknown): void {
    this.generated.set((result as CreatedCodes).codes);
    this.resultOpen = true;
    this.load();
  }

  closeResult(): void {
    this.resultOpen = false;
    this.generated.set([]);
  }

  copy(code: string): void {
    void copyToClipboard(code).then((ok) =>
      this.messages.add(ok
        ? { severity: 'success', summary: 'Código copiado', detail: code }
        : { severity: 'warn', summary: 'No se pudo copiar', detail: 'Selecciónalo y cópialo a mano.' }));
  }

  revoke(row: ActivationCode): void {
    this.confirm.ask({
      header: 'Anular código',
      message: `El código terminado en ${row.hint} dejará de servir. Esto no se puede deshacer.`,
      acceptLabel: 'Anular código',
      danger: true,
      accept: () => this.platform.revokeCode(row.id).subscribe(() => {
        this.messages.add({ severity: 'success', summary: 'Código anulado' });
        this.load();
      }),
    });
  }
}

function emptyDraft(planCode: string): CodeDraft {
  return { planCode, months: 1, validDays: 30, quantity: 1, note: '' };
}

function inRange(value: number | null, min: number, max: number): boolean {
  if (value === null || String(value) === '') {
    return false;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}
