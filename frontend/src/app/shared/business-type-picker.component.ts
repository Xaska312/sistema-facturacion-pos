import { Component, input, output } from '@angular/core';
import { BusinessType } from '../core/api/api.models';
import { BUSINESS_TYPES, BusinessTypeInfo } from './business-types';
import { XIconComponent } from './icons/xicon.component';

/** ¿Se puede elegir este tipo? Los abiertos, y el que ya tiene el negocio (un piloto de Restaurante lo conserva). */
export function canChooseType(type: BusinessTypeInfo, current: BusinessType | null): boolean {
  return type.open || type.code === current;
}

/**
 * Tipo de negocio en baldosas (Fase 12a, decisión 267): al crear el negocio y en Ajustes. Los tipos "Pronto"
 * (Restaurante, Farmacia) salen deshabilitados, salvo el que ya tiene el negocio.
 */
@Component({
  selector: 'app-business-type-picker',
  imports: [XIconComponent],
  template: `
    <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" [attr.aria-labelledby]="labelledBy()">
      @for (t of types; track t.code) {
        @let choosable = allowSoon() || canChoose(t, current());
        <button type="button" role="radio" class="type-tile" [attr.aria-checked]="value() === t.code"
                [disabled]="disabled() || !choosable" (click)="pick.emit(t)">
          <app-xicon [name]="t.glyph" [size]="30" />
          <span class="min-w-0 flex-1 text-left">
            <span class="flex items-center gap-2 font-bold">
              {{ t.label }}
              @if (!choosable) {
                <span class="soon">Pronto</span>
              }
            </span>
            <span class="block text-xs text-muted">{{ t.description }}</span>
          </span>
        </button>
      }
    </div>
  `,
  styles: `
    .type-tile {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      min-height: 4rem;
      padding: 0.625rem 0.875rem;
      border-radius: 1.125rem;
      border: 2px solid var(--surface-border);
      background: var(--surface);
      color: var(--text);
      transition: border-color 150ms, background-color 150ms;
    }
    .type-tile:hover:not(:disabled) { border-color: var(--brand); }
    .type-tile[aria-checked='true'] {
      border-color: var(--brand);
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .type-tile[aria-checked='true'] .text-muted { color: var(--brand-soft-text); }
    .type-tile:disabled { opacity: 0.6; cursor: not-allowed; }
    .type-tile[aria-checked='true']:disabled { opacity: 0.85; }
    .soon {
      padding: 0.0625rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 700;
      background: var(--surface-alt);
      color: var(--text-muted);
    }
  `,
})
export class BusinessTypePickerComponent {
  /** Tipo marcado. */
  readonly value = input.required<BusinessType>();
  /** Tipo que ya tiene el negocio (se puede conservar aunque sea "Pronto"); null al crear. */
  readonly current = input<BusinessType | null>(null);
  readonly disabled = input(false);
  /** Consola de plataforma: también los "Pronto", para negocios piloto. */
  readonly allowSoon = input(false);
  readonly labelledBy = input<string | null>(null);
  readonly pick = output<BusinessTypeInfo>();

  protected readonly types = BUSINESS_TYPES;
  protected readonly canChoose = canChooseType;
}
