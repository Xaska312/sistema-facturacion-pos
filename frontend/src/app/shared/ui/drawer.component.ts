import { CdkTrapFocus } from '@angular/cdk/a11y';
import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ICON_TIMES } from './icons';
import { MODAL_Z_INDEX, clearZIndex, setZIndex } from './overlay';

/**
 * Panel lateral (decisión 339; reemplaza a `p-drawer`): entra desde la derecha (o la izquierda) sobre un fondo oscuro,
 * con título y X; Escape y el clic en el fondo lo cierran (avisan con `visibleChange`, como el diálogo).
 */
@Component({
  selector: 'app-drawer',
  imports: [NgStyle, CdkTrapFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Como PrimeNG: Escape lo cierra aunque el foco siga en la página.
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @if (open()) {
      <div #mask class="ui-drawer-mask" [class.ui-drawer-left]="position() === 'left'" (click)="onMaskClick($event)">
        <div #panel class="ui-drawer" role="complementary" [attr.aria-label]="header()" [ngStyle]="style()"
             cdkTrapFocus>
          <div class="ui-drawer-header">
            <div class="ui-drawer-title">{{ header() }}</div>
            <button type="button" aria-label="Cerrar" (click)="close()"
                    class="ui-button ui-button-secondary ui-button-text ui-button-rounded ui-button-icon-only">
              <svg class="ui-button-icon ui-dialog-close-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path fill="currentColor" [attr.d]="closePath" />
              </svg>
            </button>
          </div>
          <div class="ui-drawer-content"><ng-content /></div>
        </div>
      </div>
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  readonly visible = input(false, { transform: booleanAttribute });
  readonly visibleChange = output<boolean>();
  readonly header = input<string | null | undefined>(undefined);
  readonly position = input<'left' | 'right'>('right');
  readonly style = input<Record<string, string> | null | undefined>(undefined);

  protected readonly open = signal(false);
  protected readonly closePath = ICON_TIMES;
  private readonly mask = viewChild<ElementRef<HTMLElement>>('mask');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly injector = inject(Injector);
  private layered: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => {
        if (visible && !this.open()) {
          this.open.set(true);
          afterNextRender({ write: () => this.layer() }, { injector: this.injector });
        } else if (!visible && this.open()) {
          this.release();
          this.open.set(false);
        }
      });
    });
  }

  close(): void {
    this.visibleChange.emit(false);
  }

  protected onEscape(event: Event): void {
    if (this.open()) {
      event.stopPropagation();
      this.close();
    }
  }

  protected onMaskClick(event: MouseEvent): void {
    if (event.target === this.mask()?.nativeElement) {
      this.close();
    }
  }

  ngOnDestroy(): void {
    this.release();
  }

  private layer(): void {
    const panel = this.panel()?.nativeElement;
    const mask = this.mask()?.nativeElement;
    if (!panel || !mask) {
      return;
    }
    setZIndex('modal', panel, MODAL_Z_INDEX);
    mask.style.zIndex = String(parseInt(panel.style.zIndex, 10) - 1);
    this.layered = panel;
  }

  private release(): void {
    if (this.layered) {
      clearZIndex(this.layered);
      this.layered = null;
    }
  }
}
