import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/**
 * Estado vacío con guía: icono, título, explicación y la acción principal
 * ("Aún no hay productos · Crear producto").
 */
@Component({
  selector: 'app-empty-state',
  imports: [ButtonModule],
  template: `
    <div class="flex flex-col items-center text-center gap-2 py-10 px-4" role="status">
      <span class="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg mb-1"
            aria-hidden="true">
        <i [class]="icon()" class="text-xl"></i>
      </span>
      <p class="font-semibold">{{ title() }}</p>
      @if (message()) {
        <p class="text-sm text-muted max-w-md">{{ message() }}</p>
      }
      @if (actionLabel(); as label) {
        <p-button class="mt-2" [label]="label" [icon]="actionIcon()" (onClick)="action.emit()" />
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly icon = input('pi pi-inbox');
  /** Sin texto no se muestra el botón (p. ej. si no hay permiso para crear). */
  readonly actionLabel = input<string | null>(null);
  readonly actionIcon = input('pi pi-plus');
  readonly action = output<void>();
}
