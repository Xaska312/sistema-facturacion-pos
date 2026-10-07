import { Component, input, output } from '@angular/core';
import { TourId } from '../tour/tour';
import { GLOSSARY } from './glossary';
import { HelpTopic } from './screen-help';

/** Contenido del panel de ayuda de una pantalla: consejos, términos explicados y el recorrido guiado. */
@Component({
  selector: 'app-help-panel',
  template: `
    <div class="flex flex-col gap-5">
      <section aria-labelledby="help-tips">
        <h3 id="help-tips" class="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Consejos</h3>
        <ol class="flex flex-col gap-3">
          @for (tip of topic().tips; track tip; let i = $index) {
            <li class="flex gap-3">
              <span class="tip-number" aria-hidden="true">{{ i + 1 }}</span>
              <span class="text-sm">{{ tip }}</span>
            </li>
          }
        </ol>
      </section>

      @if (topic().terms?.length) {
        <section aria-labelledby="help-terms">
          <h3 id="help-terms" class="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Palabras clave</h3>
          <dl class="flex flex-col gap-3">
            @for (term of topic().terms ?? []; track term) {
              <div>
                <dt class="text-sm font-semibold">{{ glossary[term].title }}</dt>
                <dd class="text-sm text-muted">{{ glossary[term].text }}</dd>
              </div>
            }
          </dl>
        </section>
      }

      @if (topic().manual; as section) {
        <a [href]="'/manual#' + section" target="_blank" rel="noopener" class="text-sm text-brand hover:underline">
          <i class="pi pi-book text-xs mr-1" aria-hidden="true"></i>Leer más en el manual de uso
        </a>
      }

      @if (showTour()) {
        @if (topic().tour; as tour) {
          <button type="button" class="tour-start" (click)="startTour.emit(tour)">
            <i class="pi pi-directions" aria-hidden="true"></i>Ver el recorrido guiado de esta pantalla
          </button>
        }
      }
    </div>
  `,
  styles: `
    .tip-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .tour-start {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--brand);
      color: var(--brand);
      font-weight: 600;
      font-size: 0.875rem;
    }
    .tour-start:hover {
      background: var(--brand-soft);
    }
  `,
})
export class HelpPanelComponent {
  readonly topic = input.required<HelpTopic>();
  /** Si el usuario puede ver el recorrido de esta pantalla (ver HelpTopic.tourPermission). */
  readonly showTour = input(true);
  readonly startTour = output<TourId>();
  protected readonly glossary = GLOSSARY;
}
