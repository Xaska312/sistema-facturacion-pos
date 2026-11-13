import { Directive } from '@angular/core';

/**
 * Campo de texto con el estilo de la app (decisión 335, fase A1; reemplaza a `pInputText` de PrimeNG).
 * El estilo vive en `styles.css` (`.app-input`) con los tokens `--field-*`: borde, foco con el color del negocio,
 * error cuando el control es inválido y ya se tocó (`ng-invalid ng-dirty`), desactivado y placeholder.
 */
@Directive({
  selector: '[appInput]',
  host: { class: 'app-input' },
})
export class AppInputDirective {}
