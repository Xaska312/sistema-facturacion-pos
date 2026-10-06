import { Component, computed, input } from '@angular/core';
import { PopoverModule } from 'primeng/popover';
import { GLOSSARY, GlossaryTerm } from './glossary';

/**
 * Término con explicación: el texto proyectado más un botón (i) que abre la definición del glosario.
 * Se abre con clic, toque o teclado (funciona en tablet, a diferencia de un tooltip al pasar el mouse).
 */
@Component({
  selector: 'app-term',
  imports: [PopoverModule],
  template: `
    <span class="inline-flex items-baseline gap-0.5"><ng-content />
      <button type="button" class="term-button" [attr.aria-label]="'¿Qué significa ' + entry().title + '?'"
              aria-haspopup="dialog" (click)="tip.toggle($event)">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
      </button>
    </span>
    <p-popover #tip appendTo="body">
      <div class="max-w-72 text-sm">
        <p class="font-semibold mb-1">{{ entry().title }}</p>
        <p class="text-muted">{{ entry().text }}</p>
      </div>
    </p-popover>
  `,
  styles: `
    .term-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 9999px;
      color: var(--brand);
      font-size: 0.8125rem;
      vertical-align: middle;
    }
    .term-button:hover {
      background: var(--brand-soft);
    }
  `,
})
export class TermComponent {
  readonly term = input.required<GlossaryTerm>();
  protected readonly entry = computed(() => GLOSSARY[this.term()]);
}
