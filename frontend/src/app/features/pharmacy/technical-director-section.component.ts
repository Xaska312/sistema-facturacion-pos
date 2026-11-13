import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { PharmacyApi, Profession, TechnicalDirector } from '../../core/api/pharmacy.api';
import { AuthService } from '../../core/auth/auth.service';
import { PROFESSION_OPTIONS } from '../pos/dispensation';

/**
 * Director técnico del establecimiento (Fase 13-4, decisión 282): nombre, profesión y tarjeta profesional. Salen en el
 * acta de baja y saldrán en el libro de control especial. Lo exige la visita de la Secretaría de Salud.
 */
@Component({
  selector: 'app-technical-director-section',
  imports: [FormsModule, ButtonModule, AppInputDirective],
  template: `
    <section class="card p-4 flex flex-col gap-3 max-w-3xl" aria-labelledby="dt-title">
      <header>
        <h2 id="dt-title" class="text-base font-semibold">Director técnico</h2>
        <p class="text-xs text-muted">Quien responde por la droguería ante la Secretaría de Salud. Sale en las actas.</p>
      </header>
      <fieldset class="grid gap-3 md:grid-cols-3" [disabled]="!canEdit()">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre</span>
          <input appInput maxlength="160" [(ngModel)]="name" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Profesión</span>
          <select class="border rounded px-2 py-2" [(ngModel)]="profession">
            <option value="">Elige…</option>
            @for (p of professions; track p.code) {
              <option [value]="p.code">{{ p.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Tarjeta profesional</span>
          <input appInput maxlength="40" [(ngModel)]="license" placeholder="Número o resolución" />
        </label>
      </fieldset>
      @if (canEdit()) {
        <div class="flex justify-end">
          <p-button label="Guardar director técnico" [loading]="saving()" (onClick)="save()" />
        </div>
      }
    </section>
  `,
})
export class TechnicalDirectorSectionComponent implements OnInit {
  private readonly api = inject(PharmacyApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  protected readonly canEdit = computed(() => this.auth.hasPermission('settings:manage'));
  protected readonly professions = PROFESSION_OPTIONS;
  protected readonly saving = signal(false);
  protected name = '';
  protected profession: Profession | '' = '';
  protected license = '';

  ngOnInit(): void {
    this.api.technicalDirector().subscribe((dt) => this.fill(dt));
  }

  private fill(dt: TechnicalDirector): void {
    this.name = dt.name ?? '';
    this.profession = dt.profession ?? '';
    this.license = dt.license ?? '';
  }

  save(): void {
    this.saving.set(true);
    this.api.saveTechnicalDirector({ name: this.name.trim() || null, profession: this.profession || null,
      license: this.license.trim() || null }).subscribe({
      next: (dt) => {
        this.fill(dt);
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Director técnico guardado', life: 3000 });
      },
      error: () => this.saving.set(false),
    });
  }
}
