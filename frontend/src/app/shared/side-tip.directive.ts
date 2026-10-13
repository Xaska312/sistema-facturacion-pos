import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Nombre de la opción a la derecha del menú contraído. Reemplaza al tooltip de PrimeNG, que en el menú lateral se
 * abría hacia la izquierda y quedaba cortado contra el borde de la pantalla. Es solo visual: el nombre ya está en el
 * enlace para lectores de pantalla.
 */
@Directive({
  selector: '[appSideTip]',
  host: {
    '(mouseenter)': 'show()',
    '(focusin)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusout)': 'hide()',
    '(click)': 'hide()',
  },
})
export class SideTipDirective implements OnDestroy {
  readonly appSideTip = input.required<string>();
  readonly sideTipDisabled = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tip: HTMLElement | null = null;

  show(): void {
    if (this.sideTipDisabled() || this.tip) {
      return;
    }
    const rect = this.host.nativeElement.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.className = 'side-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.textContent = this.appSideTip();
    tip.style.left = `${Math.round(rect.right + 8)}px`;
    tip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    document.body.appendChild(tip);
    this.tip = tip;
  }

  hide(): void {
    this.tip?.remove();
    this.tip = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
