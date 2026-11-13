import {
  ChangeDetectionStrategy,
  Component,
  EmbeddedViewRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { OVERLAY_Z_INDEX, attachToBody, clearZIndex, placeBelow, scrollableParents, setZIndex } from './overlay';

/**
 * Cuadro flotante con flecha junto a un botón (decisión 339; reemplaza a `p-popover`). Se abre con `toggle($event)` o
 * `show($event)`, se dibuja sobre <body> debajo del botón (o encima si no cabe) y se cierra con `hide()`, Escape (el
 * foco vuelve al botón), clic fuera o al desplazar su contenedor. `(shown)`/`(hidden)` avisan al abrir y cerrar.
 */
@Component({
  selector: 'app-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #overlay>
      <div class="ui-popover" role="dialog" [attr.aria-label]="ariaLabel()" (keydown.escape)="hide(true)">
        <div class="ui-popover-content"><ng-content /></div>
      </div>
    </ng-template>
  `,
})
export class PopoverComponent implements OnDestroy {
  readonly ariaLabel = input<string | null | undefined>(undefined);
  /** Se acepta por compatibilidad: siempre se dibuja sobre <body>. */
  readonly appendTo = input<string | null | undefined>(undefined);
  readonly shown = output<void>();
  readonly hidden = output<void>();

  private readonly overlayTemplate = viewChild.required<TemplateRef<unknown>>('overlay');
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<unknown> | null = null;
  private target: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];

  get visible(): boolean {
    return this.view !== null;
  }

  toggle(event: Event, target?: HTMLElement): void {
    if (this.view) {
      this.hide();
    } else {
      this.show(event, target);
    }
  }

  show(event: Event | null, target?: HTMLElement): void {
    this.hide();
    this.target = target ?? ((event?.currentTarget ?? event?.target) as HTMLElement | null);
    this.view = attachToBody(this.container, this.overlayTemplate());
    const panel = this.panel();
    if (!panel || !this.target) {
      return;
    }
    setZIndex('overlay', panel, OVERLAY_Z_INDEX);
    this.align(panel, this.target);
    // Como PrimeNG: solo toma el foco lo marcado con autofocus (el resto lo decide quien lo abre, con (shown)).
    panel.querySelector<HTMLElement>('[autofocus]')?.focus();
    this.listen();
    this.shown.emit();
  }

  hide(restoreFocus = false): void {
    if (!this.view) {
      return;
    }
    const panel = this.panel();
    if (panel) {
      clearZIndex(panel);
    }
    this.view.destroy();
    this.view = null;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (restoreFocus) {
      this.target?.focus({ preventScroll: true });
    }
    this.hidden.emit();
  }

  ngOnDestroy(): void {
    this.hide();
  }

  /** Como PrimeNG: debajo del botón con la flecha apuntándole; arriba (volteado) si abajo no cabe. */
  private align(panel: HTMLElement, target: HTMLElement): void {
    placeBelow(panel, target, null, false);
    const panelRect = panel.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
    const arrowLeft = panelRect.left < targetRect.left ? targetRect.left - panelRect.left - radius * 2 : 0;
    panel.style.setProperty('--ui-popover-arrow-left', `${arrowLeft}px`);
    panel.classList.toggle('ui-popover-flipped', panelRect.top < targetRect.top);
  }

  private panel(): HTMLElement | null {
    return (this.view?.rootNodes.find((n: Node) => n instanceof HTMLElement) as HTMLElement | undefined) ?? null;
  }

  private listen(): void {
    const onDocumentClick = (event: MouseEvent): void => {
      const node = event.target as Node;
      if (!this.panel()?.contains(node) && !this.target?.contains(node)) {
        this.hide();
      }
    };
    const onClose = (): void => this.hide();
    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('resize', onClose);
    const parents = this.target ? scrollableParents(this.target) : [];
    parents.forEach((p) => p.addEventListener('scroll', onClose));
    this.cleanups.push(
      () => document.removeEventListener('click', onDocumentClick, true),
      () => window.removeEventListener('resize', onClose),
      () => parents.forEach((p) => p.removeEventListener('scroll', onClose)),
    );
  }
}
