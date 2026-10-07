import { Location } from '@angular/common';
import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { copyToClipboard } from '../../shared/clipboard';
import { MANUAL_GLOSSARY, filterManual, normalize } from './manual-content';

/**
 * Manual de uso público ({@code /manual}): se abre sin iniciar sesión para compartirlo con clientes, y cada sección
 * tiene su propio enlace ({@code /manual#cobrar}). Se puede buscar e imprimir.
 */
@Component({
  selector: 'app-manual',
  imports: [RouterLink],
  template: `
    <header class="manual-header">
      <div class="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3">
        <a href="/manual" class="font-semibold text-brand text-lg" (click)="top($event)">POS Híbrido</a>
        <span class="text-muted">Manual de uso</span>
        <span class="flex-1"></span>
        <button type="button" class="link-button no-print" (click)="print()">
          <i class="pi pi-print" aria-hidden="true"></i>Imprimir
        </button>
        <a [routerLink]="appLink()" class="app-button no-print">{{ auth.isAuthenticated() ? 'Volver a la app' : 'Entrar' }}</a>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
      <nav class="toc no-print" aria-label="Contenido del manual">
        <label class="flex flex-col gap-1 mb-4">
          <span class="text-sm font-medium">Buscar en el manual</span>
          <input type="search" class="search" placeholder="Ej.: cerrar caja, invitar, F4" [value]="query()"
                 (input)="search($event)" />
        </label>
        <ol class="hidden lg:flex flex-col gap-1">
          @for (chapter of chapters(); track chapter.id) {
            <li>
              <a [href]="'/manual#' + chapter.id" class="toc-chapter" (click)="go($event, chapter.id)">
                <i [class]="chapter.icon" aria-hidden="true"></i>{{ chapter.title }}
              </a>
              <ol class="ml-6 flex flex-col">
                @for (section of chapter.sections; track section.id) {
                  <li><a [href]="'/manual#' + section.id" class="toc-section" (click)="go($event, section.id)">{{ section.title }}</a></li>
                }
              </ol>
            </li>
          }
        </ol>
      </nav>

      <main class="flex flex-col gap-10 min-w-0">
        @if (!query()) {
          <section class="intro">
            <h1 class="text-2xl font-semibold mb-2">Cómo usar POS Híbrido</h1>
            <p class="text-muted">
              Punto de venta en la nube para tu negocio: vende con lector o en tablet, controla tu caja y tu inventario,
              y revisa tus reportes desde cualquier lugar. Este manual explica cada pantalla paso a paso. Dentro de la
              app, el botón <strong>?</strong> de cada pantalla tiene consejos rápidos.
            </p>
            <ul class="mt-4 flex flex-wrap gap-2 lg:hidden">
              @for (chapter of chapters(); track chapter.id) {
                <li><a [href]="'/manual#' + chapter.id" class="chip" (click)="go($event, chapter.id)">{{ chapter.title }}</a></li>
              }
            </ul>
          </section>
        }

        @for (chapter of chapters(); track chapter.id) {
          <section [id]="chapter.id" class="chapter" [attr.aria-labelledby]="chapter.id + '-title'">
            <h2 [id]="chapter.id + '-title'" class="text-xl font-semibold flex items-center gap-2 mb-4">
              <i [class]="chapter.icon + ' text-brand'" aria-hidden="true"></i>{{ chapter.title }}
            </h2>
            <div class="flex flex-col gap-4">
              @for (section of chapter.sections; track section.id) {
                <article [id]="section.id" class="card p-5 section">
                  <div class="flex items-start gap-2">
                    <h3 class="text-lg font-semibold flex-1">{{ section.title }}</h3>
                    <button type="button" class="link-button text-sm no-print" (click)="copyLink(section.id)"
                            [attr.aria-label]="'Copiar enlace a ' + section.title">
                      <i class="pi pi-link" aria-hidden="true"></i><span class="hidden sm:inline">Copiar enlace</span>
                    </button>
                  </div>
                  <p class="text-muted mt-1">{{ section.summary }}</p>
                  @if (section.who) {
                    <p class="text-sm mt-2"><span class="font-medium">Quién puede:</span> {{ section.who }}</p>
                  }
                  @if (section.steps?.length) {
                    <ol class="steps mt-3">
                      @for (step of section.steps ?? []; track $index) {
                        <li>{{ step }}</li>
                      }
                    </ol>
                  }
                  @if (section.table; as table) {
                    <div class="overflow-x-auto mt-3">
                      <table class="manual-table">
                        <thead>
                          <tr><th scope="col">{{ table.headers[0] }}</th><th scope="col">{{ table.headers[1] }}</th></tr>
                        </thead>
                        <tbody>
                          @for (row of table.rows; track $index) {
                            <tr><th scope="row">{{ row[0] }}</th><td>{{ row[1] }}</td></tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                  @if (section.tips?.length) {
                    <ul class="tips mt-3">
                      @for (tip of section.tips ?? []; track $index) {
                        <li>{{ tip }}</li>
                      }
                    </ul>
                  }
                </article>
              }
            </div>
          </section>
        }

        @if (glossary().length) {
          <section id="glosario" aria-labelledby="glosario-title">
            <h2 id="glosario-title" class="text-xl font-semibold flex items-center gap-2 mb-4">
              <i class="pi pi-book text-brand" aria-hidden="true"></i>Palabras clave
            </h2>
            <dl class="card p-5 grid gap-4 sm:grid-cols-2">
              @for (entry of glossary(); track entry.title) {
                <div>
                  <dt class="font-semibold">{{ entry.title }}</dt>
                  <dd class="text-sm text-muted">{{ entry.text }}</dd>
                </div>
              }
            </dl>
          </section>
        }

        @if (query() && !chapters().length && !glossary().length) {
          <p class="text-muted" role="status">
            No encontramos "{{ query() }}" en el manual. Prueba con otras palabras o escríbenos a soporte.
          </p>
        }
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-ground);
    }
    .manual-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-border);
    }
    .app-button {
      display: inline-flex;
      align-items: center;
      min-height: 2.5rem;
      padding: 0 1rem;
      border-radius: 0.5rem;
      background: var(--brand);
      color: var(--brand-contrast);
      font-weight: 600;
    }
    .link-button {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.5rem;
      padding: 0 0.5rem;
      color: var(--brand);
      font-weight: 500;
    }
    .search {
      width: 100%;
      min-height: 2.5rem;
      padding: 0 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      color: var(--text);
    }
    .toc {
      align-self: start;
    }
    @media (min-width: 1024px) {
      .toc {
        position: sticky;
        top: 4.5rem;
        max-height: calc(100vh - 5.5rem);
        overflow-y: auto;
      }
    }
    .toc-chapter {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0;
      font-weight: 600;
    }
    .toc-section {
      display: block;
      padding: 0.2rem 0;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .toc-chapter:hover,
    .toc-section:hover {
      color: var(--brand);
    }
    .chip {
      display: inline-flex;
      min-height: 2.25rem;
      align-items: center;
      padding: 0 0.75rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-size: 0.875rem;
    }
    .chapter,
    .section,
    #glosario {
      scroll-margin-top: 4.5rem;
    }
    .steps {
      list-style: decimal;
      padding-left: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .tips {
      list-style: disc;
      padding-left: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .manual-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .manual-table th,
    .manual-table td {
      text-align: left;
      vertical-align: top;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--surface-border);
    }
    .manual-table thead th {
      color: var(--text-muted);
      font-weight: 600;
    }
    .manual-table tbody th {
      font-weight: 600;
      white-space: nowrap;
    }
    @media print {
      .no-print,
      .manual-header {
        display: none !important;
      }
      .section {
        break-inside: avoid;
        box-shadow: none;
      }
    }
  `,
})
export class ManualComponent {
  protected readonly auth = inject(AuthService);
  private readonly location = inject(Location);
  private readonly messages = inject(MessageService);

  protected readonly query = signal('');
  protected readonly chapters = computed(() => filterManual(this.query()));
  protected readonly glossary = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    return MANUAL_GLOSSARY.filter((entry) => {
      const text = normalize(`${entry.title} ${entry.text}`);
      return words.every((word) => text.includes(word));
    });
  });
  protected readonly appLink = computed(() => {
    if (!this.auth.isAuthenticated()) {
      return '/login';
    }
    return this.auth.hasTenant() ? '/app' : '/negocios';
  });

  constructor() {
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    // Enlace compartido (/manual#cobrar): se baja a la sección cuando ya está pintada.
    afterNextRender(() => {
      if (fragment) {
        this.scrollTo(fragment, 'auto');
      }
    });
  }

  search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  go(event: Event, id: string): void {
    event.preventDefault();
    this.scrollTo(id, 'smooth');
    this.location.replaceState(`/manual#${id}`);
  }

  top(event: Event): void {
    event.preventDefault();
    this.query.set('');
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    this.location.replaceState('/manual');
  }

  async copyLink(id: string): Promise<void> {
    const ok = await copyToClipboard(manualLink(globalThis.location?.origin ?? '', id));
    this.messages.add(ok
      ? { severity: 'success', summary: 'Enlace copiado', detail: 'Pégalo en WhatsApp o en un correo.' }
      : { severity: 'warn', summary: 'No se pudo copiar', detail: 'Copia la dirección desde la barra del navegador.' });
  }

  print(): void {
    this.query.set('');
    // Se espera a que se pinte el manual completo (sin filtro) antes de abrir la impresión.
    setTimeout(() => globalThis.print?.(), 0);
  }

  private scrollTo(id: string, behavior: ScrollBehavior): void {
    document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
  }
}

/** Enlace para compartir una sección del manual. */
export function manualLink(origin: string, sectionId: string): string {
  return `${origin.replace(/\/+$/, '')}/manual#${sectionId}`;
}
