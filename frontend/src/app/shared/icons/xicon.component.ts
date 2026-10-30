import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { XIconName, xiconMarkup } from './xicons';

/**
 * Ícono de XASKA (duotono desplazado): el trazo toma el color del texto y la forma de relleno el color de marca
 * del negocio ({@code --brand}), así cada negocio ve sus íconos con su color. Decorativo: el texto vecino lo nombra.
 * El SVG sale de una tabla fija del código (xicons.ts), nunca de datos del usuario.
 */
@Component({
  selector: 'app-xicon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
         [innerHTML]="markup()"></svg>
  `,
  styles: `
    :host { display: inline-flex; flex-shrink: 0; line-height: 0; }
    :host ::ng-deep .xicon-fill { fill: var(--xicon-fill, var(--brand)); fill-opacity: 0.55; stroke: none; }
  `,
})
export class XIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<XIconName>();
  /** Lado en px. */
  readonly size = input(22);

  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(xiconMarkup(this.name())));
}
