import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Barra de carga con brillo (decisión 335, fase A1; reemplaza a `p-skeleton` de PrimeNG con las mismas entradas).
 * Es decorativa: queda oculta para lectores de pantalla (quien la usa anuncia la carga con `aria-busy` o texto).
 */
@Component({
  selector: 'app-skeleton',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-skeleton',
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'borderRadius()',
  },
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly borderRadius = input<string | undefined>(undefined);
}
