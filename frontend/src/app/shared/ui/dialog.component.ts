import { CdkTrapFocus } from '@angular/cdk/a11y';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  TemplateRef,
  afterNextRender,
  booleanAttribute,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ZIndexUtils } from 'primeng/utils';

/** Elementos que pueden recibir el foco, en el orden en que se buscan al abrir. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Capa de los diálogos: la misma cuenta que usa PrimeNG para que sus menús y avisos queden encima (hasta la fase D). */
const MODAL_Z_INDEX = 1100;

let nextId = 0;
let scrollLocks = 0;

/**
 * Diálogo de la app (decisión 338, fase B; reemplaza a `p-dialog` de PrimeNG con las mismas entradas).
 * Centrado sobre un fondo oscuro, con título enlazado (`role="dialog"`, `aria-modal`), el foco atrapado adentro y
 * devuelto al cerrar, Escape para cerrar (`closeOnEscape`), clic en el fondo solo con `dismissableMask`, la página de
 * atrás sin desplazarse mientras está abierto y `breakpoints` para el ancho en pantallas angostas. El pie va en
 * `<ng-template #footer>`. Ya no se arrastra ni se agranda con el mouse (decisión del usuario).
 */
@Component({
  selector: 'app-dialog',
  imports: [NgStyle, NgTemplateOutlet, CdkTrapFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div #mask class="ui-dialog-mask" [class.ui-dialog-mask-modal]="modal()"
           (mousedown)="pressedOnMask = $event.target === mask" (click)="onMaskClick($event)">
        <div #panel [class]="panelClass()" [attr.role]="role()" aria-modal="true"
             [attr.aria-labelledby]="showHeader() && header() ? titleId : null" [ngStyle]="panelStyle()"
             cdkTrapFocus (keydown.escape)="onEscape($event)">
          @if (showHeader()) {
            <div class="ui-dialog-header">
              <span class="ui-dialog-title" [id]="titleId">{{ header() }}</span>
              <div class="ui-dialog-header-actions">
                @if (closable()) {
                  <button type="button" aria-label="Cerrar" (click)="close()"
                          class="ui-button ui-button-secondary ui-button-text ui-button-rounded ui-button-icon-only ui-dialog-close">
                    <svg class="ui-button-icon ui-dialog-close-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path fill="currentColor" [attr.d]="closePath" />
                    </svg>
                  </button>
                }
              </div>
            </div>
          }
          <div #content class="ui-dialog-content"><ng-content /></div>
          @if (footer(); as footerTemplate) {
            <div #footerBox class="ui-dialog-footer"><ng-container [ngTemplateOutlet]="footerTemplate" /></div>
          }
        </div>
      </div>
    }
  `,
})
export class DialogComponent implements OnDestroy {
  /** Lo controla quien lo usa (`[(visible)]`): la X, Escape y el fondo solo avisan con `visibleChange`, como PrimeNG. */
  readonly visible = input(false, { transform: booleanAttribute });
  readonly visibleChange = output<boolean>();
  readonly header = input<string | null | undefined>(undefined);
  readonly modal = input(false, { transform: booleanAttribute });
  /** Estilos del panel (por ejemplo `{ width: '30rem' }`). */
  readonly style = input<Record<string, string> | null | undefined>(undefined);
  /** Ancho por tamaño de pantalla: `{ '640px': '100vw' }` = hasta 640 px de ancho, el panel mide 100vw. */
  readonly breakpoints = input<Record<string, string> | null | undefined>(undefined);
  readonly styleClass = input<string | null | undefined>(undefined);
  readonly closable = input(true, { transform: booleanAttribute });
  readonly closeOnEscape = input(true, { transform: booleanAttribute });
  readonly dismissableMask = input(false, { transform: booleanAttribute });
  readonly showHeader = input(true, { transform: booleanAttribute });
  readonly focusOnShow = input(true, { transform: booleanAttribute });
  readonly role = input<'dialog' | 'alertdialog'>('dialog');

  /** Ya se ve (después de pintarse). */
  readonly shown = output<void>();
  /** Se cerró, por dentro (X, Escape, fondo) o porque `visible` pasó a falso. */
  readonly hidden = output<void>();

  protected readonly footer = contentChild<TemplateRef<unknown>>('footer');
  protected readonly titleId = `ui-dialog-title-${nextId++}`;
  protected readonly closePath = CLOSE_PATH;
  protected readonly open = signal(false);
  protected pressedOnMask = false;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly footerBox = viewChild<ElementRef<HTMLElement>>('footerBox');
  private readonly mask = viewChild<ElementRef<HTMLElement>>('mask');
  private readonly injector = inject(Injector);
  private readonly viewportWidth = signal(typeof window === 'undefined' ? 1024 : window.innerWidth);
  private previousFocus: HTMLElement | null = null;
  private zIndexElement: HTMLElement | null = null;
  private lockedScroll = false;

  protected readonly panelClass = computed(() => ['ui-dialog', this.styleClass() ?? ''].join(' ').trim());

  protected readonly panelStyle = computed(() => {
    const style: Record<string, string> = { ...(this.style() ?? {}) };
    this.viewportWidth();
    const breakpoints = this.breakpoints();
    if (breakpoints && typeof window !== 'undefined') {
      // Como las media queries de PrimeNG: si varias aplican, gana la más angosta.
      const matching = Object.keys(breakpoints)
        .filter((bp) => window.matchMedia(`screen and (max-width: ${bp})`).matches)
        .sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const bp of matching) {
        style['width'] = breakpoints[bp];
      }
    }
    return style;
  });

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => (visible ? this.show() : this.hide()));
    });
    if (typeof window !== 'undefined') {
      const onResize = (): void => this.viewportWidth.set(window.innerWidth);
      window.addEventListener('resize', onResize);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize));
    }
  }

  close(): void {
    this.visibleChange.emit(false);
  }

  protected onEscape(event: Event): void {
    if (this.closeOnEscape()) {
      event.stopPropagation();
      this.close();
    }
  }

  protected onMaskClick(event: MouseEvent): void {
    if (this.dismissableMask() && this.pressedOnMask && event.target === this.mask()?.nativeElement) {
      this.close();
    }
  }

  ngOnDestroy(): void {
    this.release();
  }

  private show(): void {
    if (this.open()) {
      return;
    }
    const active = document.activeElement;
    this.previousFocus = active instanceof HTMLElement ? active : null;
    this.open.set(true);
    if (this.modal()) {
      lockScroll();
      this.lockedScroll = true;
    }
    afterNextRender(
      {
        write: () => {
          const panel = this.panel()?.nativeElement;
          const mask = this.mask()?.nativeElement;
          if (!panel || !mask || !this.open()) {
            return;
          }
          ZIndexUtils.set('modal', panel, MODAL_Z_INDEX);
          mask.style.zIndex = String(parseInt(panel.style.zIndex, 10) - 1);
          this.zIndexElement = panel;
          if (this.focusOnShow()) {
            this.focusFirst();
          }
          this.shown.emit();
        },
      },
      { injector: this.injector },
    );
  }

  private hide(): void {
    if (!this.open()) {
      return;
    }
    this.release();
    this.open.set(false);
    const previous = this.previousFocus;
    this.previousFocus = null;
    if (previous?.isConnected) {
      previous.focus({ preventScroll: true });
    }
    this.hidden.emit();
  }

  private release(): void {
    if (this.zIndexElement) {
      ZIndexUtils.clear(this.zIndexElement);
      this.zIndexElement = null;
    }
    if (this.lockedScroll) {
      unlockScroll();
      this.lockedScroll = false;
    }
  }

  /** Como PrimeNG: lo marcado con autofocus, si no lo primero del contenido, luego del pie y por último la X. */
  private focusFirst(): void {
    const areas = [this.content()?.nativeElement, this.footerBox()?.nativeElement, this.panel()?.nativeElement];
    for (const area of areas) {
      const target = area?.querySelector<HTMLElement>('[autofocus]') ?? area?.querySelector<HTMLElement>(FOCUSABLE);
      if (target) {
        target.focus();
        return;
      }
    }
  }
}

/** La página de atrás no se desplaza mientras haya un diálogo modal abierto (se compensa la barra de desplazamiento). */
function lockScroll(): void {
  if (scrollLocks++ === 0) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.setProperty('--ui-scrollbar-width', `${scrollbar}px`);
    document.body.classList.add('ui-overflow-hidden');
  }
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.classList.remove('ui-overflow-hidden');
    document.body.style.removeProperty('--ui-scrollbar-width');
  }
}

/** La X de cerrar (mismo dibujo que usaba PrimeNG). */
const CLOSE_PATH =
  'M8.01186 7.00933L12.27 2.75116C12.341 2.68501 12.398 2.60524 12.4375 2.51661C12.4769 2.42798 12.4982 2.3323 12.4999 ' +
  '2.23529C12.5016 2.13827 12.4838 2.0419 12.4474 1.95194C12.4111 1.86197 12.357 1.78024 12.2884 1.71163C12.2198 ' +
  '1.64302 12.138 1.58893 12.0481 1.55259C11.9581 1.51625 11.8617 1.4984 11.7647 1.50011C11.6677 1.50182 11.572 ' +
  '1.52306 11.4834 1.56255C11.3948 1.60204 11.315 1.65898 11.2488 1.72997L6.99067 5.98814L2.7325 1.72997C2.59553 ' +
  '1.60234 2.41437 1.53286 2.22718 1.53616C2.03999 1.53946 1.8614 1.61529 1.72901 1.74767C1.59663 1.88006 1.5208 ' +
  '2.05865 1.5175 2.24584C1.5142 2.43303 1.58368 2.61419 1.71131 2.75116L5.96948 7.00933L1.71131 11.2675C1.576 11.403 ' +
  '1.5 11.5866 1.5 11.7781C1.5 11.9696 1.576 12.1532 1.71131 12.2887C1.84679 12.424 2.03043 12.5 2.2219 12.5C2.41338 ' +
  '12.5 2.59702 12.424 2.7325 12.2887L6.99067 8.03052L11.2488 12.2887C11.3843 12.424 11.568 12.5 11.7594 12.5C11.9509 ' +
  '12.5 12.1346 12.424 12.27 12.2887C12.4053 12.1532 12.4813 11.9696 12.4813 11.7781C12.4813 11.5866 12.4053 11.403 ' +
  '12.27 11.2675L8.01186 7.00933Z';
