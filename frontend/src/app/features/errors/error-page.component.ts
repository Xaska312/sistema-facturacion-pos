import { Location } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

/** Página de error (404, 403) con acciones para volver. Los textos vienen del {@code data} de la ruta. */
@Component({
  selector: 'app-error-page',
  imports: [RouterLink, ButtonModule],
  template: `
    <section class="min-h-[60vh] flex items-center justify-center p-6" [class.min-h-screen]="standalone()">
      <div class="max-w-md text-center">
        <span class="inline-flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg mb-4">
          <i [class]="icon()" class="text-2xl" aria-hidden="true"></i>
        </span>
        <p class="text-sm font-semibold text-brand mb-1">{{ code() }}</p>
        <h1 class="text-2xl font-semibold mb-2">{{ heading() }}</h1>
        <p class="text-muted mb-6">{{ message() }}</p>
        <div class="flex flex-wrap justify-center gap-2">
          <a pButton routerLink="/app" icon="pi pi-home" label="Ir al inicio"></a>
          <p-button label="Volver" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" (onClick)="back()" />
        </div>
      </div>
    </section>
  `,
})
export class ErrorPageComponent {
  private readonly location = inject(Location);

  /** Se llenan desde data de la ruta (withComponentInputBinding). */
  readonly code = input('404');
  readonly heading = input('No encontramos esta página');
  readonly message = input('Puede que el enlace esté mal escrito o que la página ya no exista.');
  readonly icon = input('pi pi-compass');
  /** true fuera del menú lateral (ocupa toda la pantalla). */
  readonly standalone = input(false);

  back(): void {
    this.location.back();
  }
}
