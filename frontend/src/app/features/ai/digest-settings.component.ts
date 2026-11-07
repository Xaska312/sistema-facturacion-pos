import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AccessApi } from '../../core/api/access.api';
import { AiApi, DigestSettings } from '../../core/api/ai.api';
import { Member } from '../../core/api/api.models';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';

/**
 * Ajustes del Resumen del día de Aska (decisión 299): prendido, a qué hora y quién más lo recibe por correo (el
 * propietario siempre). "Enviar ahora" lo arma y lo envía para probarlo.
 */
@Component({
  selector: 'app-digest-settings',
  imports: [FormsModule, ButtonModule, XaskaIaLogoComponent],
  template: `
    <section class="card p-4 md:p-6 mt-6 max-w-2xl flex flex-col gap-4" aria-labelledby="digest-settings-title">
      <div class="flex items-center gap-3">
        <app-xaska-ia-logo size="md" />
        <div>
          <h2 id="digest-settings-title" class="text-lg font-bold tracking-tight">Resumen del día</h2>
          <p class="text-sm text-muted">Aska te escribe cómo le fue al negocio: ventas, caja, inventario y lo que hay por
            cobrar o pagar. Llega por correo y queda en Inicio.</p>
        </div>
      </div>
      @if (form(); as f) {
        <label class="flex items-center gap-3 text-sm">
          <input type="checkbox" [(ngModel)]="f.enabled" name="digest-enabled" class="w-5 h-5" />
          <span class="font-medium">Enviarme el resumen todos los días</span>
        </label>
        <label class="flex flex-wrap items-center gap-3 text-sm">
          <span class="font-medium">Hora</span>
          <input type="time" name="digest-time" class="min-h-11 rounded-lg border border-line bg-surface px-3"
                 [(ngModel)]="f.sendTime" [disabled]="!f.enabled" />
          <span class="text-muted text-xs">Antes del mediodía resume el día anterior.</span>
        </label>
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-medium mb-1">También lo reciben</legend>
          @for (m of others(); track m.id) {
            <label class="flex items-center gap-3 text-sm min-h-9">
              <input type="checkbox" class="w-5 h-5" [checked]="f.recipients.includes(m.id)" [disabled]="!f.enabled"
                     (change)="toggle(m.id, $event)" />
              <span>{{ m.displayName }} <span class="text-muted">· {{ roles(m) }}</span></span>
            </label>
          } @empty {
            <p class="text-sm text-muted">Solo tú. Cuando invites a tu equipo, aquí eliges quién más lo recibe.</p>
          }
          <p class="text-xs text-muted">El propietario siempre lo recibe. Cada persona solo ve lo que su rol le deja ver.</p>
        </fieldset>
        <div class="flex flex-wrap items-center gap-2">
          <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save(f)" />
          <p-button label="Enviar ahora" icon="pi pi-send" [outlined]="true" [loading]="running()" (onClick)="run()" />
          <span class="text-xs text-muted ml-auto">{{ f.used }} de {{ f.limit }} resúmenes este mes</span>
        </div>
      } @else {
        <p class="text-sm text-muted" role="status">Cargando…</p>
      }
    </section>
  `,
})
export class DigestSettingsComponent implements OnInit {
  private readonly api = inject(AiApi);
  private readonly access = inject(AccessApi);
  private readonly messages = inject(MessageService);

  protected readonly form = signal<DigestSettings | null>(null);
  protected readonly others = signal<Member[]>([]);
  protected readonly saving = signal(false);
  protected readonly running = signal(false);

  ngOnInit(): void {
    this.api.digestSettings().subscribe((s) => this.form.set({ ...s, recipients: [...s.recipients] }));
    this.access.members({ page: 0, size: 100 }, null).subscribe((p) =>
      this.others.set(p.content.filter((m) => m.active && !m.owner)));
  }

  protected roles(m: Member): string {
    return m.roles.map((r) => r.name).join(', ');
  }

  protected toggle(id: string, event: Event): void {
    const f = this.form();
    if (!f) {
      return;
    }
    const on = (event.target as HTMLInputElement).checked;
    f.recipients = on ? [...new Set([...f.recipients, id])] : f.recipients.filter((r) => r !== id);
  }

  protected save(f: DigestSettings): void {
    this.saving.set(true);
    this.api.saveDigestSettings(f.enabled, f.sendTime, f.recipients).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.form.set({ ...s, recipients: [...s.recipients] });
        this.messages.add({ severity: 'success', summary: 'Resumen del día', detail: 'Ajustes guardados.', life: 3000 });
      },
      error: () => this.saving.set(false),
    });
  }

  protected run(): void {
    this.running.set(true);
    this.api.runDigest().subscribe({
      next: () => {
        this.running.set(false);
        const f = this.form();
        if (f) {
          this.form.set({ ...f, used: f.used + 1 });
        }
        this.messages.add({ severity: 'success', summary: 'Resumen enviado',
          detail: 'Revisa tu correo; también quedó en Inicio.', life: 5000 });
      },
      error: () => this.running.set(false),
    });
  }
}
