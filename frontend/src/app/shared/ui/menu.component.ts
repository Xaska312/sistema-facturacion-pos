import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EmbeddedViewRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  computed,
  contentChild,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MenuItem } from './menu-item';
import { OVERLAY_Z_INDEX, attachToBody, clearZIndex, placeBelow, scrollableParents, setZIndex } from './overlay';

interface Row {
  kind: 'group' | 'item' | 'separator';
  item: MenuItem;
  index: number;
}

let nextId = 0;

/**
 * Menú emergente (decisión 339; reemplaza a `p-menu` con `[popup]="true"`). Se abre con `toggle($event)` junto al
 * botón, se dibuja sobre <body>, se maneja con el teclado (flechas, Inicio/Fin, Enter, Escape, Tab) y se cierra al hacer
 * clic fuera, al desplazar su contenedor o al cambiar el tamaño de la ventana. Acepta grupos (`items`), separadores,
 * `routerLink`, `url`/`target` y una plantilla propia `<ng-template #item let-item>`.
 */
@Component({
  selector: 'app-menu',
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #overlay>
      <div #panel class="ui-menu ui-menu-overlay">
        <ul #list class="ui-menu-list" role="menu" tabindex="0" [id]="menuId"
            [attr.aria-activedescendant]="focused() >= 0 ? optionId(focused()) : null"
            (keydown)="onKeydown($event)" (blur)="focused.set(-1)">
          @for (row of rows(); track $index) {
            @switch (row.kind) {
              @case ('group') {
                <li class="ui-menu-submenu-label" role="none"><span>{{ row.item.label }}</span></li>
              }
              @case ('separator') {
                <li class="ui-menu-separator" role="separator"></li>
              }
              @default {
                <li [id]="optionId(row.index)" role="menuitem" [class]="'ui-menu-item ' + (row.item.styleClass ?? '')"
                    [class.ui-focus]="focused() === row.index" [class.ui-disabled]="row.item.disabled"
                    [attr.aria-label]="row.item.label" [attr.aria-disabled]="row.item.disabled || null">
                  <div class="ui-menu-item-content" (click)="activate(row.item, $event)">
                    @if (itemTemplate(); as template) {
                      <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="{ $implicit: row.item }" />
                    } @else if (row.item.routerLink) {
                      <a class="ui-menu-item-link" tabindex="-1" [routerLink]="row.item.routerLink"
                         [queryParams]="row.item.queryParams">
                        <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: row.item }" />
                      </a>
                    } @else {
                      <a class="ui-menu-item-link" tabindex="-1" [attr.href]="row.item.url ?? null"
                         [attr.target]="row.item.target ?? null">
                        <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: row.item }" />
                      </a>
                    }
                  </div>
                </li>
              }
            }
          }
        </ul>
      </div>
    </ng-template>
    <ng-template #content let-item>
      @if (item.icon) {
        <span [class]="'ui-menu-item-icon ' + item.icon" aria-hidden="true"></span>
      }
      <span class="ui-menu-item-label">{{ item.label }}</span>
    </ng-template>
  `,
})
export class MenuComponent implements OnDestroy {
  readonly model = input<MenuItem[] | null | undefined>([]);
  /** Se acepta por compatibilidad: el menú propio siempre es emergente. */
  readonly popup = input(true, { transform: booleanAttribute });
  /** Se acepta por compatibilidad: siempre se dibuja sobre <body>. */
  readonly appendTo = input<string | null | undefined>(undefined);

  protected readonly itemTemplate = contentChild<TemplateRef<unknown>>('item');
  protected readonly menuId = `ui-menu-${nextId++}`;
  protected readonly focused = signal(-1);

  private readonly overlayTemplate = viewChild.required<TemplateRef<unknown>>('overlay');
  private readonly container = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private view: EmbeddedViewRef<unknown> | null = null;
  private target: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];

  /** Filas planas: títulos de grupo, opciones (con su número para el teclado) y separadores. */
  protected readonly rows = computed<Row[]>(() => {
    const rows: Row[] = [];
    let index = 0;
    const push = (item: MenuItem): void => {
      if (item.visible === false) {
        return;
      }
      if (item.separator) {
        rows.push({ kind: 'separator', item, index: -1 });
      } else if (item.items) {
        rows.push({ kind: 'group', item, index: -1 });
        item.items.forEach(push);
      } else {
        rows.push({ kind: 'item', item, index: index++ });
      }
    };
    (this.model() ?? []).forEach(push);
    return rows;
  });

  private readonly options = computed(() => this.rows().filter((r) => r.kind === 'item'));

  get visible(): boolean {
    return this.view !== null;
  }

  toggle(event: Event): void {
    if (this.view) {
      this.hide();
    } else {
      this.show(event);
    }
  }

  show(event: Event): void {
    this.hide();
    this.target = (event.currentTarget ?? event.target) as HTMLElement;
    this.view = attachToBody(this.container, this.overlayTemplate());
    const panel = this.panelElement();
    if (!panel || !this.target) {
      return;
    }
    setZIndex('overlay', panel, OVERLAY_Z_INDEX);
    placeBelow(panel, this.target);
    this.listElement()?.focus({ preventScroll: true });
    this.listen();
  }

  hide(restoreFocus = false): void {
    if (!this.view) {
      return;
    }
    const panel = this.panelElement();
    if (panel) {
      clearZIndex(panel);
    }
    this.view.destroy();
    this.view = null;
    this.focused.set(-1);
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (restoreFocus) {
      this.target?.focus({ preventScroll: true });
    }
  }

  ngOnDestroy(): void {
    this.hide();
  }

  protected optionId(index: number): string {
    return `${this.menuId}-${index}`;
  }

  protected activate(item: MenuItem, event: Event): void {
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    this.hide(true);
    item.command?.({ originalEvent: event, item });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options().filter((o) => !o.item.disabled);
    const position = options.findIndex((o) => o.index === this.focused());
    switch (event.key) {
      case 'ArrowDown':
        this.focused.set(options[Math.min(position + 1, options.length - 1)]?.index ?? -1);
        break;
      case 'ArrowUp':
        this.focused.set(options[position <= 0 ? options.length - 1 : position - 1]?.index ?? -1);
        break;
      case 'Home':
        this.focused.set(options[0]?.index ?? -1);
        break;
      case 'End':
        this.focused.set(options[options.length - 1]?.index ?? -1);
        break;
      case 'Enter':
      case ' ': {
        const row = options[position];
        if (row) {
          this.runFromKeyboard(row.item, event);
        }
        break;
      }
      case 'Escape':
        this.hide(true);
        break;
      case 'Tab':
        this.hide();
        return;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Enter sobre una opción: enlaces y rutas se abren como con el clic. */
  private runFromKeyboard(item: MenuItem, event: Event): void {
    if (item.routerLink && !this.itemTemplate()) {
      void this.router.navigate(typeof item.routerLink === 'string' ? [item.routerLink] : [...item.routerLink], {
        queryParams: item.queryParams,
      });
    } else if (item.url) {
      window.open(item.url, item.target ?? '_self');
    }
    this.activate(item, event);
  }

  private panelElement(): HTMLElement | null {
    return (this.view?.rootNodes.find((n: Node) => n instanceof HTMLElement) as HTMLElement | undefined) ?? null;
  }

  private listElement(): HTMLElement | null {
    return this.panelElement()?.querySelector<HTMLElement>('.ui-menu-list') ?? null;
  }

  private listen(): void {
    const onDocumentClick = (event: MouseEvent): void => {
      const node = event.target as Node;
      if (!this.panelElement()?.contains(node) && !this.target?.contains(node)) {
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
