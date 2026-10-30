import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable } from 'rxjs';
import { TipPayout, TipSummary, TipsApi } from '../../core/api/tips.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { shareTips } from './tip-shares';

/**
 * Propinas (Fase 12b-5, decisión 272; ley 1935 de 2018): son del equipo de trabajo. Lo recogido en un periodo (máximo
 * un mes), lo pendiente por repartir y el registro del reparto en partes iguales entre quienes se elija; si se entrega
 * en efectivo sale de la caja como "Reparto de propinas".
 */
@Component({
  selector: 'app-tips',
  imports: [FormsModule, ButtonModule, InputTextModule, SkeletonModule, PageHeaderComponent, FormDialogComponent,
    XIconComponent, PesosInputDirective],
  template: `
    <app-page-header title="Propinas" description="Lo que dejan los clientes es del equipo: aquí ves lo recogido y registras su reparto.">
      @if (summary(); as s) {
        <p-button label="Repartir" icon="pi pi-users" [disabled]="s.pending <= 0 || s.people.length === 0" (onClick)="openPayout(s)" />
      }
    </app-page-header>

    <div class="flex flex-wrap items-end gap-3 mb-5">
      @if ((summary()?.branches?.length ?? 0) > 1) {
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-semibold">Sucursal</span>
          <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="branchId()" (ngModelChange)="branchId.set($event); load()">
            @for (b of summary()!.branches; track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </label>
      }
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-semibold">Desde</span>
        <input pInputText type="date" [ngModel]="from()" (ngModelChange)="from.set($event)" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-semibold">Hasta</span>
        <input pInputText type="date" [ngModel]="to()" (ngModelChange)="to.set($event)" />
      </label>
      <p-button label="Ver" icon="pi pi-search" severity="secondary" [outlined]="true" (onClick)="load()" />
      <span class="text-xs text-muted">Máximo un mes.</span>
    </div>

    @if (error(); as e) {
      <p class="card p-4 mb-4 text-danger" role="alert">{{ e }}</p>
    }

    @if (summary(); as s) {
      <div class="grid gap-4 md:grid-cols-3 mb-6">
        <div class="card p-5">
          <app-xicon name="tips" [size]="32" />
          <p class="text-sm text-muted mt-2">Recogido del {{ day(s.from) }} al {{ day(s.to) }}</p>
          <p class="text-3xl font-extrabold tracking-tight tabular-nums">{{ cop(s.collected) }}</p>
          <p class="text-xs text-muted">{{ s.count === 1 ? '1 propina' : s.count + ' propinas' }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm font-semibold mb-2">Por medio de pago</p>
          @for (m of s.byMethod; track m.methodName) {
            <p class="flex justify-between text-sm"><span>{{ m.methodName }}</span><span class="tabular-nums">{{ cop(m.amount) }}</span></p>
          } @empty {
            <p class="text-sm text-muted">Sin propinas en el periodo.</p>
          }
        </div>
        <div class="card p-5 border-brand">
          <p class="text-sm text-muted">Pendiente por repartir</p>
          <p class="text-3xl font-extrabold tracking-tight tabular-nums text-brand">{{ cop(s.pending) }}</p>
          <p class="text-xs text-muted">Todo lo recogido en la sucursal menos lo ya repartido.</p>
        </div>
      </div>

      <section aria-labelledby="payouts-title">
        <h2 id="payouts-title" class="text-base font-bold tracking-tight mb-3">Repartos</h2>
        @if (s.payouts.length === 0) {
          <p class="text-sm text-muted">Aún no has registrado repartos.</p>
        }
        <ul class="grid gap-3 md:grid-cols-2" aria-label="Repartos registrados">
          @for (p of s.payouts; track p.id) {
            <li class="card p-4">
              <p class="flex justify-between gap-2">
                <span class="font-bold">#{{ p.number }} · {{ day(p.from) }} al {{ day(p.to) }}</span>
                <span class="font-extrabold tabular-nums">{{ cop(p.amount) }}</span>
              </p>
              <p class="text-xs text-muted">{{ p.fromCash ? 'En efectivo, desde la caja' : 'Por fuera de la caja' }} · {{ p.createdByName }}</p>
              <ul class="mt-2 text-sm">
                @for (sh of p.shares; track sh.memberId) {
                  <li class="flex justify-between"><span>{{ sh.name }}</span><span class="tabular-nums">{{ cop(sh.amount) }}</span></li>
                }
              </ul>
              @if (p.notes) { <p class="text-xs mt-1">{{ p.notes }}</p> }
            </li>
          }
        </ul>
      </section>
    } @else if (!error()) {
      <div class="grid gap-4 md:grid-cols-3" aria-busy="true">
        @for (i of [0, 1, 2]; track i) {
          <p-skeleton height="9rem" borderRadius="1.25rem" />
        }
      </div>
    }

    <app-form-dialog [(visible)]="payoutOpen" header="Repartir propinas" width="34rem" [dirty]="true"
                     submitLabel="Registrar reparto" submitIcon="pi pi-check" [invalidMessage]="payoutProblem()"
                     [save]="payoutRequest" successMessage="Reparto registrado" (saved)="load()"
                     description="Se reparte en partes iguales. Queda registrado y no se puede cambiar.">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">Valor a repartir</span>
        <input appPesos class="h-11 border rounded-lg px-3 text-lg text-right tabular-nums" [ngModel]="amount()"
               (ngModelChange)="amount.set($event)" aria-label="Valor a repartir" />
        <span class="text-xs text-muted">Pendiente: {{ cop(summary()?.pending ?? 0) }}</span>
      </label>
      <fieldset class="flex flex-col gap-1">
        <legend class="text-sm font-semibold mb-1">Entre quiénes</legend>
        @for (p of summary()?.people ?? []; track p.memberId) {
          <label class="flex items-center justify-between gap-2 min-h-10">
            <span class="flex items-center gap-2">
              <input type="checkbox" class="size-4" [checked]="chosen().has(p.memberId)" (change)="toggle(p.memberId)" />
              {{ p.name }}
            </span>
            @if (chosen().has(p.memberId)) {
              <span class="tabular-nums text-sm">{{ cop(shareOf(p.memberId)) }}</span>
            }
          </label>
        }
      </fieldset>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" class="mt-1 size-4" [ngModel]="fromCash()" (ngModelChange)="fromCash.set($event)" />
        <span><span class="font-semibold">Lo entrego en efectivo desde mi caja</span>
          <span class="block text-xs text-muted">Sale de tu caja abierta como "Reparto de propinas". Si no, queda
            registrado como entregado por fuera (transferencia, sobre).</span></span>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">Nota (opcional)</span>
        <input pInputText maxlength="200" [ngModel]="notes()" (ngModelChange)="notes.set($event)" />
      </label>
    </app-form-dialog>
  `,
})
export class TipsComponent implements OnInit {
  private readonly api = inject(TipsApi);

  protected readonly summary = signal<TipSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly branchId = signal<string | null>(null);
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly cop = formatCop;

  protected payoutOpen = false;
  protected readonly amount = signal<number | null>(null);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly fromCash = signal(true);
  protected readonly notes = signal('');
  private readonly shares = computed(() => {
    const ids = (this.summary()?.people ?? []).map((p) => p.memberId).filter((id) => this.chosen().has(id));
    const amounts = shareTips(Number(this.amount() ?? 0), ids.length);
    return new Map(ids.map((id, i) => [id, amounts[i]]));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set(null);
    this.api.summary(this.branchId(), this.from(), this.to()).subscribe({
      next: (s) => {
        this.summary.set(s);
        this.branchId.set(s.branchId);
        this.from.set(s.from);
        this.to.set(s.to);
      },
      error: (e: { error?: { detail?: string } }) => this.error.set(e?.error?.detail ?? 'No se pudieron cargar las propinas.'),
    });
  }

  protected day(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  protected openPayout(s: TipSummary): void {
    this.amount.set(Math.floor(s.pending));
    this.chosen.set(new Set(s.people.map((p) => p.memberId)));
    this.fromCash.set(true);
    this.notes.set('');
    this.payoutOpen = true;
  }

  protected toggle(id: string): void {
    const next = new Set(this.chosen());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.chosen.set(next);
  }

  protected shareOf(id: string): number {
    return this.shares().get(id) ?? 0;
  }

  protected payoutProblem(): string | null {
    const amount = Number(this.amount() ?? 0);
    const pending = this.summary()?.pending ?? 0;
    if (!(amount > 0) || !Number.isInteger(amount)) {
      return 'Escribe el valor a repartir en pesos enteros.';
    }
    if (amount > pending) {
      return `Solo hay ${formatCop(pending)} pendientes.`;
    }
    return this.chosen().size === 0 ? 'Elige al menos una persona.' : null;
  }

  protected readonly payoutRequest = (): Observable<TipPayout> => {
    const s = this.summary()!;
    return this.api.payout({
      branchId: s.branchId, from: s.from, to: s.to, amount: Number(this.amount()),
      memberIds: s.people.map((p) => p.memberId).filter((id) => this.chosen().has(id)),
      fromCash: this.fromCash(), notes: this.notes().trim() || null,
    });
  };
}
