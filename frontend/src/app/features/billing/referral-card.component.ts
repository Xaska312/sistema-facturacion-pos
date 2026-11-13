import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../shared/ui/toast.service';
import { BillingApi, MyReferrals } from '../../core/api/billing.api';
import { AuthService } from '../../core/auth/auth.service';
import { copyToClipboard } from '../../shared/clipboard';
import { formatDate } from '../../shared/format';
import { referralMessage } from './referral-code';

/**
 * "Invita y gana" en Planes y pagos (decisión 312): el código del negocio, su enlace, compartir por WhatsApp y a quién
 * invitó. Por cada negocio que entre con el código y pague su primer mes, un mes de XASKA IA gratis.
 */
@Component({
  selector: 'app-referral-card',
  template: `
    @if (data(); as d) {
      <section class="card p-4 md:p-5 flex flex-col gap-3 invite" aria-labelledby="invite-title">
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex-1 min-w-60">
            <p class="invite-kicker">Invita y gana</p>
            <h2 id="invite-title" class="text-lg font-bold tracking-tight">Un mes de XASKA IA gratis por cada negocio
              que traigas</h2>
            <p class="text-sm text-muted mt-1">Cuando entre con tu enlace y pague su primer mes, te regalamos un mes de
              XASKA IA. Tu invitado prueba 14 días gratis con la IA incluida.</p>
          </div>
          <div class="invite-stats" aria-label="Tus invitaciones">
            <div><span class="invite-num">{{ d.invited }}</span><span class="invite-lbl">invitados</span></div>
            <div><span class="invite-num">{{ d.paid }}</span><span class="invite-lbl">ya pagan</span></div>
            <div><span class="invite-num">{{ d.monthsEarned }}</span><span class="invite-lbl">{{ d.monthsEarned === 1 ? 'mes ganado' : 'meses ganados' }}</span></div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="invite-code" aria-label="Tu código">{{ d.code }}</span>
          <a class="invite-wa" [href]="whatsapp()" target="_blank" rel="noopener">Compartir por WhatsApp</a>
          <button type="button" class="invite-copy" (click)="copy(d.link)">Copiar enlace</button>
        </div>
        @if (d.list.length > 0) {
          <ul class="text-sm divide-y divide-line">
            @for (r of d.list; track $index) {
              <li class="py-2 flex flex-wrap justify-between gap-2">
                <span class="font-medium">{{ r.tradeName }}</span>
                <span [class.text-muted]="r.status === 'PENDING'" [class.invite-ok]="r.status === 'QUALIFIED'">
                  {{ r.status === 'QUALIFIED' ? 'Pagó · ganaste un mes' : 'En prueba desde el ' + date(r.createdAt) }}</span>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    .invite { border-color: var(--aska-line); }
    .invite-kicker { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--aska-soft-fg); }
    .invite-stats { display: flex; gap: 0.5rem; }
    .invite-stats > div { display: flex; flex-direction: column; align-items: center; min-width: 4.75rem; padding: 0.5rem 0.75rem;
      border-radius: 0.875rem; background: var(--aska-soft); }
    .invite-num { font-size: 1.375rem; font-weight: 800; color: var(--aska-soft-fg); }
    .invite-lbl { font-size: 0.6875rem; color: var(--text-muted); }
    .invite-code { font-family: ui-monospace, monospace; font-weight: 800; font-size: 1.125rem; letter-spacing: 0.06em;
      padding: 0.375rem 0.875rem; border-radius: 0.75rem; border: 1.5px dashed var(--aska); color: var(--aska-soft-fg); }
    .invite-wa, .invite-copy { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem;
      border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; }
    .invite-wa { color: var(--aska-contrast); background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to)); }
    .invite-copy { border: 1.5px solid var(--aska-line); color: var(--aska-soft-fg); background: var(--surface); }
    .invite-ok { color: var(--color-success); font-weight: 700; }
  `,
})
export class ReferralCardComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(ToastService);

  protected readonly data = signal<MyReferrals | null>(null);
  protected readonly whatsapp = computed(() => {
    const d = this.data();
    const name = this.auth.currentTenant()?.tradeName ?? 'mi negocio';
    return d ? `https://wa.me/?text=${encodeURIComponent(referralMessage(name, d.link))}` : '';
  });

  ngOnInit(): void {
    this.api.referrals().subscribe({ next: (d) => this.data.set(d), error: () => this.data.set(null) });
  }

  protected async copy(link: string): Promise<void> {
    const ok = await copyToClipboard(link);
    this.messages.add(ok ? { severity: 'success', summary: 'Enlace copiado', detail: 'Pégalo donde quieras.', life: 3000 }
      : { severity: 'warn', summary: 'No se pudo copiar', detail: link, life: 6000 });
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }
}
