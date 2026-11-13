import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DialogComponent } from '../../shared/ui/dialog.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { BillingApi, Partner, PartnerInput, PartnerKind, ReferralRow } from '../../core/api/billing.api';
import { problemMessage } from '../../core/errors/problem';
import { copyToClipboard } from '../../shared/clipboard';
import { formatDate } from '../../shared/format';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';

const EMPTY: PartnerInput = { name: '', kind: 'ACCOUNTANT', phone: null, email: null, payoutKey: null, note: null, active: true };

/**
 * Referidos y aliados en la Consola (decisión 312): los contadores y distribuidores con su código y lo que se les debe,
 * y los negocios que entraron con un código. La comisión del aliado (20 % del primer pago) se paga por Bre-B y se marca
 * aquí con la referencia.
 */
@Component({
  selector: 'app-platform-referrals',
  imports: [FormsModule, ButtonComponent, DialogComponent, AppInputDirective, PageHeaderComponent],
  template: `
    <app-page-header title="Referidos y aliados"
                     description="Contadores y distribuidores que traen negocios (20 % del primer pago) y los negocios que entraron con un código.">
      <app-button label="Nuevo aliado" icon="pi pi-plus" (clicked)="edit(null)" />
    </app-page-header>

    @if (owed() > 0) {
      <p class="card p-3 mb-4 text-sm font-semibold">Comisiones por pagar a aliados: {{ cop(owed()) }}</p>
    }

    <section class="card p-4 mb-4 overflow-x-auto" aria-labelledby="partners-title">
      <h2 id="partners-title" class="font-bold tracking-tight mb-2">Aliados</h2>
      @if (partners().length === 0) {
        <p class="text-sm text-muted">Aún no hay aliados. Crea uno para darle su código.</p>
      } @else {
        <table class="w-full text-sm">
          <thead><tr class="text-left text-muted">
            <th class="py-2 pr-3">Aliado</th><th class="pr-3">Código</th><th class="pr-3">Trajo</th>
            <th class="pr-3">Pagan</th><th class="pr-3">Por pagarle</th><th class="pr-3">Llave Bre-B</th><th></th>
          </tr></thead>
          <tbody>
            @for (p of partners(); track p.id) {
              <tr class="border-t border-line" [class.opacity-60]="!p.active">
                <td class="py-2 pr-3"><span class="font-semibold">{{ p.name }}</span>
                  <span class="block text-xs text-muted">{{ kind(p.kind) }}{{ p.active ? '' : ' · inactivo' }}</span></td>
                <td class="pr-3"><button type="button" class="font-mono underline" (click)="copy(p.code)"
                                         [attr.aria-label]="'Copiar el código ' + p.code">{{ p.code }}</button></td>
                <td class="pr-3">{{ p.referred }}</td>
                <td class="pr-3">{{ p.paid }}</td>
                <td class="pr-3 font-semibold">{{ cop(p.commissionOwed) }}</td>
                <td class="pr-3 font-mono">{{ p.payoutKey ?? '—' }}</td>
                <td><app-button label="Editar" size="small" [text]="true" (clicked)="edit(p)" /></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <section class="card p-4 overflow-x-auto" aria-labelledby="refs-title">
      <h2 id="refs-title" class="font-bold tracking-tight mb-2">Negocios referidos</h2>
      @if (rows().length === 0) {
        <p class="text-sm text-muted">Aún nadie ha entrado con un código.</p>
      } @else {
        <table class="w-full text-sm">
          <thead><tr class="text-left text-muted">
            <th class="py-2 pr-3">Negocio</th><th class="pr-3">Lo trajo</th><th class="pr-3">Estado</th>
            <th class="pr-3">Primer pago</th><th class="pr-3">Comisión</th><th></th>
          </tr></thead>
          <tbody>
            @for (r of rows(); track r.referredTenantId) {
              <tr class="border-t border-line">
                <td class="py-2 pr-3"><span class="font-semibold">{{ r.referredName }}</span>
                  <span class="block text-xs text-muted">Desde el {{ date(r.createdAt) }} · {{ r.code }}</span></td>
                <td class="pr-3">{{ r.partnerName ?? r.referrerName }}
                  <span class="block text-xs text-muted">{{ r.partnerName ? 'Aliado' : 'Negocio: 1 mes de IA' }}</span></td>
                <td class="pr-3">{{ r.status === 'QUALIFIED' ? 'Pagó el ' + date(r.qualifiedAt) : 'En prueba' }}</td>
                <td class="pr-3">{{ r.firstAmount === null ? '—' : cop(r.firstAmount) }}</td>
                <td class="pr-3">
                  @if (r.commission !== null) {
                    {{ cop(r.commission) }}
                    <span class="block text-xs text-muted">{{ r.paidAt ? 'Pagada · ' + r.paidReference : 'Por pagar a ' + (r.partnerPayoutKey ?? 'la llave del aliado') }}</span>
                  } @else { — }
                </td>
                <td>
                  @if (r.commission !== null && !r.paidAt) {
                    <app-button label="Marcar pagada" size="small" [text]="true" (clicked)="openPaid(r)" />
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <app-dialog [(visible)]="editOpen" [modal]="true" [header]="editingId ? 'Editar aliado' : 'Nuevo aliado'"
              [style]="{ width: '28rem', maxWidth: '94vw' }">
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1"><span class="text-sm font-medium">Nombre</span>
          <input appInput [(ngModel)]="draft.name" maxlength="120" /></label>
        <label class="flex flex-col gap-1"><span class="text-sm font-medium">Tipo</span>
          <select class="border border-line rounded-[10px] px-3 min-h-11 bg-surface" [(ngModel)]="draft.kind">
            <option value="ACCOUNTANT">Contador</option><option value="DISTRIBUTOR">Distribuidor</option>
          </select></label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1"><span class="text-sm font-medium">Teléfono</span>
            <input appInput [(ngModel)]="draft.phone" maxlength="30" /></label>
          <label class="flex flex-col gap-1"><span class="text-sm font-medium">Llave Bre-B</span>
            <input appInput [(ngModel)]="draft.payoutKey" maxlength="64" placeholder="@LLAVE" /></label>
        </div>
        <label class="flex flex-col gap-1"><span class="text-sm font-medium">Correo</span>
          <input appInput type="email" [(ngModel)]="draft.email" maxlength="160" /></label>
        <label class="flex flex-col gap-1"><span class="text-sm font-medium">Nota</span>
          <input appInput [(ngModel)]="draft.note" maxlength="300" /></label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="draft.active" /> Activo (su código
          sirve para registrarse)</label>
        <div class="flex justify-end gap-2 mt-2">
          <app-button label="Cancelar" [text]="true" (clicked)="editOpen = false" />
          <app-button label="Guardar" [loading]="saving()" (clicked)="save()" />
        </div>
      </div>
    </app-dialog>

    <app-dialog [(visible)]="paidOpen" [modal]="true" header="Marcar comisión pagada" [style]="{ width: '24rem', maxWidth: '94vw' }">
      @if (paying(); as r) {
        <p class="text-sm mb-3">{{ cop(r.commission ?? 0) }} a {{ r.partnerName }} por {{ r.referredName }}.
          Paga a {{ r.partnerPayoutKey ?? 'su llave' }} y escribe la referencia del pago.</p>
        <input appInput class="w-full" [(ngModel)]="reference" maxlength="60" placeholder="Referencia Bre-B" />
        <div class="flex justify-end gap-2 mt-4">
          <app-button label="Cancelar" [text]="true" (clicked)="paidOpen = false" />
          <app-button label="Marcar pagada" [loading]="saving()" [disabled]="!reference.trim()" (clicked)="markPaid(r)" />
        </div>
      }
    </app-dialog>
  `,
})
export class PlatformReferralsComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly messages = inject(MessageService);

  protected readonly partners = signal<Partner[]>([]);
  protected readonly rows = signal<ReferralRow[]>([]);
  protected readonly saving = signal(false);
  protected readonly paying = signal<ReferralRow | null>(null);
  protected readonly owed = computed(() => this.partners().reduce((sum, p) => sum + (p.commissionOwed ?? 0), 0));
  protected editOpen = false;
  protected paidOpen = false;
  protected editingId: string | null = null;
  protected draft: PartnerInput = { ...EMPTY };
  protected reference = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.adminPartners().subscribe((p) => this.partners.set(p));
    this.api.adminReferrals().subscribe((r) => this.rows.set(r));
  }

  protected kind(k: PartnerKind): string {
    return k === 'ACCOUNTANT' ? 'Contador' : 'Distribuidor';
  }

  protected edit(p: Partner | null): void {
    this.editingId = p?.id ?? null;
    this.draft = p ? { name: p.name, kind: p.kind, phone: p.phone, email: p.email, payoutKey: p.payoutKey, note: p.note,
      active: p.active } : { ...EMPTY };
    this.editOpen = true;
  }

  protected save(): void {
    this.saving.set(true);
    this.api.savePartner(this.editingId, this.draft).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.editOpen = false;
        this.messages.add({ severity: 'success', summary: 'Aliado guardado', detail: `Su código es ${p.code}.`, life: 6000 });
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.messages.add({ severity: 'warn', summary: 'No se guardó', detail: problemMessage(e), life: 6000 });
      },
    });
  }

  protected openPaid(r: ReferralRow): void {
    this.paying.set(r);
    this.reference = '';
    this.paidOpen = true;
  }

  protected markPaid(r: ReferralRow): void {
    this.saving.set(true);
    this.api.markCommissionPaid(r.referredTenantId, this.reference.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.paidOpen = false;
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.messages.add({ severity: 'warn', summary: 'No se marcó', detail: problemMessage(e), life: 6000 });
      },
    });
  }

  protected async copy(code: string | null): Promise<void> {
    if (code && (await copyToClipboard(code))) {
      this.messages.add({ severity: 'success', summary: 'Código copiado', detail: code, life: 3000 });
    }
  }

  protected cop(v: number): string {
    return formatCop(v);
  }

  protected date(iso: string | null): string {
    return formatDate(iso);
  }
}
