import { Component, afterNextRender, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaLogoComponent } from '../../shared/brand/xaska-logo.component';
import { LEGAL_OWNER, LegalKind, legalDocument } from './legal-content';

/**
 * Términos y Política de datos (fase 9a): páginas públicas, con o sin sesión, enlazadas desde el registro, la entrada
 * y "Aceptar términos". Cada numeral tiene su enlace ({@code /privacidad#derechos}).
 */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, XaskaLogoComponent],
  template: `
    <header class="legal-header">
      <div class="mx-auto max-w-3xl px-4 py-3 flex flex-wrap items-center gap-3">
        <a [routerLink]="homeLink()" class="home-link" aria-label="XASKA POS, ir al inicio">
          <app-xaska-logo [wordmark]="true" [tag]="true" />
        </a>
        <span class="flex-1"></span>
        <a [routerLink]="other().link" class="text-sm text-brand hover:underline">{{ other().label }}</a>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl font-semibold">{{ doc().title }}</h1>
        <p class="text-sm text-muted">{{ doc().intro }}</p>
      </div>

      @for (section of doc().sections; track section.id) {
        <section [id]="section.id" class="flex flex-col gap-2 scroll-mt-20" [attr.aria-labelledby]="section.id + '-title'">
          <h2 [id]="section.id + '-title'" class="text-lg font-bold tracking-tight">{{ section.title }}</h2>
          @for (block of section.blocks; track $index) {
            @if (block.p) {
              <p class="leading-relaxed">{{ block.p }}</p>
            }
            @if (block.list) {
              @if (block.ordered) {
                <ol class="list-decimal pl-6 flex flex-col gap-1 leading-relaxed">
                  @for (item of block.list; track $index) {
                    <li>{{ item }}</li>
                  }
                </ol>
              } @else {
                <ul class="list-disc pl-6 flex flex-col gap-1 leading-relaxed">
                  @for (item of block.list; track $index) {
                    <li>{{ item }}</li>
                  }
                </ul>
              }
            }
          }
        </section>
      }

      <p class="text-sm text-muted border-t border-line pt-4">
        ¿Preguntas o solicitudes sobre tus datos? Escribe a
        <a [href]="'mailto:' + owner.email" class="text-brand hover:underline">{{ owner.email }}</a>.
      </p>
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-ground);
    }
    .legal-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-border);
    }
    .home-link {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      border-radius: 0.5rem;
    }
  `,
})
export class LegalPageComponent {
  private readonly auth = inject(AuthService);
  private readonly kind = toSignal(
    inject(ActivatedRoute).data.pipe(map((data) => (data['legal'] as LegalKind | undefined) ?? 'terminos')),
    { initialValue: 'terminos' as LegalKind },
  );

  protected readonly owner = LEGAL_OWNER;
  protected readonly doc = computed(() => legalDocument(this.kind()));
  protected readonly other = computed(() => this.kind() === 'terminos'
    ? { link: '/privacidad', label: 'Política de datos' }
    : { link: '/terminos', label: 'Términos y condiciones' });
  protected readonly homeLink = computed(() => (this.auth.isAuthenticated() ? '/app' : '/login'));

  constructor() {
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    // Enlace a un numeral (/privacidad#derechos): se baja cuando la página ya está pintada.
    afterNextRender(() => {
      if (fragment) {
        document.getElementById(fragment)?.scrollIntoView({ block: 'start' });
      }
    });
  }
}
