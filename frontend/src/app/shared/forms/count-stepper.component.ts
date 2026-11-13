import { Component, computed, input, model } from '@angular/core';
import { ButtonComponent } from '../ui/button.component';

/**
 * Número con − y + a los lados (decisión 293): para las personas de una mesa en el celular, sin abrir el teclado.
 * Vacío muestra "—"; el primer + lo pone en {@link start} y el primer − en {@link min}.
 */
@Component({
  selector: 'app-count-stepper',
  imports: [ButtonComponent],
  template: `
    <div class="flex items-center gap-3" role="group" [attr.aria-label]="label()">
      <app-button icon="pi pi-minus" severity="secondary" [outlined]="true" [rounded]="true" styleClass="!w-12 !h-12"
                [ariaLabel]="'Menos ' + unit()" [disabled]="value() !== null && value()! <= min()" (clicked)="step(-1)" />
      <output class="text-3xl font-bold tabular-nums min-w-14 text-center" aria-live="polite">{{ shown() }}</output>
      <app-button icon="pi pi-plus" severity="secondary" [outlined]="true" [rounded]="true" styleClass="!w-12 !h-12"
                [ariaLabel]="'Más ' + unit()" [disabled]="value() !== null && value()! >= max()" (clicked)="step(1)" />
    </div>
  `,
})
export class CountStepperComponent {
  readonly value = model<number | null>(null);
  readonly min = input(1);
  readonly max = input(99);
  /** Primer valor al tocar + con el número vacío. */
  readonly start = input(2);
  readonly label = input('Personas');
  readonly unit = input('personas');

  protected readonly shown = computed(() => this.value() ?? '—');

  protected step(delta: number): void {
    const current = this.value();
    const next = current === null ? (delta > 0 ? this.start() : this.min()) : current + delta;
    this.value.set(Math.min(this.max(), Math.max(this.min(), next)));
  }
}
