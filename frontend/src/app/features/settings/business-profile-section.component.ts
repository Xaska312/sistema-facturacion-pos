import { Component, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { map, switchMap } from 'rxjs';
import { BusinessType } from '../../core/api/api.models';
import { BusinessProfile, BusinessProfileApi } from '../../core/api/business-profile.api';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import {
  BUSINESS_MODULES,
  BusinessModule,
  BusinessTypeInfo,
  businessTypeInfo,
  sortModules,
  withRequirements,
} from '../../shared/business-types';
import { BusinessTypePickerComponent } from '../../shared/business-type-picker.component';
import { XIconComponent } from '../../shared/icons/xicon.component';

/**
 * Ajustes → Tipo y módulos (Fase 12a, decisión 267): el tipo de negocio propone los módulos y el dueño los prende o
 * apaga. Solo el dueño guarda; los demás lo ven. Al guardar se renueva la sesión para que el dock, "Todo" y el inicio
 * cambien de una vez (los demás usuarios lo ven en su siguiente renovación, en minutos).
 */
@Component({
  selector: 'app-business-profile-section',
  imports: [ButtonComponent, SkeletonComponent, XIconComponent, BusinessTypePickerComponent],
  template: `
    <section class="card p-4 md:p-6 mb-6 flex flex-col gap-5 max-w-3xl" aria-labelledby="profile-title">
      <div>
        <h2 id="profile-title" class="text-base font-bold tracking-tight">Tipo de negocio y módulos</h2>
        <p class="text-sm text-muted mt-1">
          El tipo decide qué ves en el dock y en el inicio. Apagar un módulo no borra nada: sale de las pantallas y
          vuelve con todos sus datos al prenderlo.
        </p>
      </div>

      @if (profile(); as p) {
        <fieldset [disabled]="!p.canEdit || saving()" class="flex flex-col gap-5">
          <legend class="sr-only">Tipo de negocio y módulos</legend>
          <div>
            <p id="type-title" class="text-sm font-bold mb-2">Tipo</p>
            <app-business-type-picker [value]="type()" [current]="p.businessType" [disabled]="!p.canEdit || saving()"
                                      labelledBy="type-title" (pick)="chooseType($event)" />
          </div>

          <div>
            <p id="modules-title" class="text-sm font-bold mb-2">Módulos</p>
            @if (proposed(); as label) {
              <p class="text-sm rounded-xl bg-brand-soft text-brand-soft-fg px-3 py-2 mb-3" role="status">
                Te propusimos los módulos de {{ label }}. Ajústalos antes de guardar.
              </p>
            }
            <ul class="flex flex-col gap-2" aria-labelledby="modules-title">
              @for (m of modules; track m.code) {
                <li>
                  <label class="module-row" [class.opacity-60]="locked(m.code)">
                    <input type="checkbox" class="size-5 shrink-0" [checked]="enabled().has(m.code)"
                           [disabled]="locked(m.code)" (change)="toggle(m.code)" />
                    <app-xicon [name]="m.glyph" [size]="26" />
                    <span class="min-w-0">
                      <span class="block font-semibold">{{ m.label }}</span>
                      <span class="block text-xs text-muted">{{ m.description }}@if (m.requires) { Necesita {{ label(m.requires) }}.}</span>
                      @if (!allowed(m.code)) {
                        <span class="block text-xs font-semibold text-warning">No está en tu plan {{ p.planName }}{{ enabled().has(m.code) ? ': no funciona hasta cambiar de plan' : '' }}.</span>
                      }
                    </span>
                  </label>
                </li>
              }
            </ul>
            <p class="text-xs text-muted mt-2">
              Vender, caja, ventas, productos, inventario, clientes, proveedores y reportes están siempre.
            </p>
          </div>
        </fieldset>

        @if (p.canEdit) {
          <div class="flex flex-wrap items-center justify-end gap-3">
            @if (dirty()) {
              <app-button label="Deshacer" [text]="true" severity="secondary" [disabled]="saving()" (clicked)="reset(p)" />
            }
            <app-button label="Guardar tipo y módulos" [loading]="saving()" [disabled]="!dirty()" (clicked)="save()" />
          </div>
        } @else {
          <p class="text-sm text-muted">Solo el dueño del negocio cambia el tipo y los módulos.</p>
        }
      } @else if (failed()) {
        <p class="text-sm text-danger" role="alert">No pudimos cargar el tipo de negocio. Recarga la página.</p>
      } @else {
        <app-skeleton height="10rem" borderRadius="1.25rem" />
      }
    </section>
  `,
  styles: `
    .module-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3.25rem;
      padding: 0.5rem 0.75rem;
      border-radius: 1rem;
      border: 1px solid var(--surface-border);
      cursor: pointer;
    }
    .module-row:hover { background: var(--surface-alt); }
    fieldset:disabled .module-row { cursor: default; }
  `,
})
export class BusinessProfileSectionComponent {
  private readonly api = inject(BusinessProfileApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  protected readonly modules = BUSINESS_MODULES;

  protected readonly profile = signal<BusinessProfile | null>(null);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly type = signal<BusinessType>('RETAIL');
  protected readonly enabled = signal<ReadonlySet<BusinessModule>>(new Set());
  /** Nombre del tipo cuyos módulos se acaban de proponer (al cambiar de tipo). */
  protected readonly proposed = signal<string | null>(null);

  protected readonly dirty = computed(() => {
    const p = this.profile();
    return !!p && (p.businessType !== this.type()
      || sortModules(p.modules).join() !== sortModules(this.enabled()).join());
  });

  constructor() {
    this.api.get().subscribe({
      next: (p) => this.reset(p),
      error: () => this.failed.set(true),
    });
  }

  /** Lo incluye el plan (con extras). */
  protected allowed(module: BusinessModule): boolean {
    const list = this.profile()?.allowedModules;
    return !list || list.includes(module);
  }

  /** No se puede prender: el plan no lo incluye y no estaba prendido (uno prendido sí se puede apagar). */
  protected locked(module: BusinessModule): boolean {
    return !this.allowed(module) && !this.enabled().has(module);
  }

  protected reset(p: BusinessProfile): void {
    this.profile.set(p);
    this.type.set(p.businessType);
    this.enabled.set(new Set(p.modules));
    this.proposed.set(null);
  }

  protected chooseType(t: BusinessTypeInfo): void {
    if (t.code === this.type()) {
      return;
    }
    this.type.set(t.code);
    const p = this.profile();
    // Al volver al tipo guardado se recuperan sus módulos; a otro tipo, se proponen los de ese tipo.
    if (p && t.code === p.businessType) {
      this.enabled.set(new Set(p.modules));
      this.proposed.set(null);
    } else {
      // Solo los que incluye el plan (decisión 288); los que ya estaban prendidos se quedan.
      this.enabled.set(new Set(t.defaultModules.filter((m) => this.allowed(m) || (p?.modules ?? []).includes(m))));
      this.proposed.set(t.label);
    }
  }

  protected toggle(module: BusinessModule): void {
    const next = new Set(this.enabled());
    if (next.has(module)) {
      next.delete(module);
    } else {
      next.add(module);
      // Prender Cocina prende Mesas; apagar Mesas apaga Cocina (withRequirements).
      const needs = this.modules.find((m) => m.code === module)?.requires;
      if (needs) {
        next.add(needs);
      }
    }
    this.enabled.set(new Set(withRequirements(next)));
  }

  protected label(module: BusinessModule): string {
    return this.modules.find((m) => m.code === module)?.label ?? module;
  }

  protected save(): void {
    this.saving.set(true);
    this.api.change(this.type(), sortModules(this.enabled()))
      // Los permisos de los módulos van en la sesión: se renueva y se recarga la lista para el tipo nuevo.
      .pipe(switchMap((saved) => this.auth.renew().pipe(switchMap(() => this.auth.loadTenants()), map(() => saved))))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.reset(saved);
          this.messages.add({
            severity: 'success',
            summary: 'Tipo y módulos guardados',
            detail: `${businessTypeInfo(saved.businessType).label}. Los demás usuarios lo verán en unos minutos.`,
          });
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.messages.add({ severity: 'error', summary: 'No se guardó', detail: problemMessage(err) });
        },
      });
  }
}
