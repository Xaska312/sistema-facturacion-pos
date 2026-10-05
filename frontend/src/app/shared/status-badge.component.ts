import { Component, computed, input } from '@angular/core';
import { STATUS, StatusKey, StatusTone } from './status';

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success-soft-fg',
  warning: 'bg-warning-soft text-warning-soft-fg',
  danger: 'bg-danger-soft text-danger-soft-fg',
  info: 'bg-info-soft text-info-soft-fg',
  neutral: 'bg-surface-alt text-muted',
};

/** Insignia de estado con el mapa único de colores ({@link STATUS}). */
@Component({
  selector: 'app-status-badge',
  template: `
    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
          [class]="toneClass()">
      <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
      {{ text() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<StatusKey>();
  /** Texto en lugar del predeterminado del estado (mismo color). */
  readonly label = input<string | null>(null);

  protected readonly text = computed(() => this.label() ?? STATUS[this.status()].label);
  protected readonly toneClass = computed(() => TONE_CLASS[STATUS[this.status()].tone]);
}
