import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { MenuItem, MenuSection, visibleMenu } from './menu';

interface ModuleGroup {
  section: MenuSection;
  items: MenuItem[];
}

/** "Bodega" de búsqueda: sin tildes ni mayúsculas. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Módulos visibles agrupados por sección, filtrados por el texto (sin Inicio, que está en el dock). */
export function groupModules(items: readonly MenuItem[], query: string): ModuleGroup[] {
  const q = normalizeSearch(query);
  const groups: ModuleGroup[] = [];
  for (const item of items) {
    if (!item.section || (q && !normalizeSearch(item.label).includes(q))) {
      continue;
    }
    const group = groups.find((g) => g.section === item.section);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }
  return groups;
}

/**
 * "Todo" (identidad, decisión 263): todos los módulos que permite el rol, agrupados como el cajón de apps del
 * celular, con buscador. Se abre desde el dock o con Ctrl + K; Enter abre el primero que coincide.
 */
@Component({
  selector: 'app-all-modules',
  imports: [FormsModule, RouterLink, XIconComponent],
  template: `
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">Todo</h1>
      <label class="flex-1 min-w-60 max-w-xl relative">
        <span class="sr-only">Buscar un módulo</span>
        <i class="pi pi-search absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true"></i>
        <input #search type="search" class="w-full h-12 pl-11 pr-4 rounded-2xl border border-line bg-surface"
               placeholder="Buscar un módulo… (Ctrl + K)" [ngModel]="query()" (ngModelChange)="query.set($event)"
               (keydown.enter)="openFirst()" />
      </label>
    </div>

    <nav aria-label="Todos los módulos" class="flex flex-col gap-6">
      @for (group of groups(); track group.section) {
        <section [attr.aria-label]="group.section">
          <h2 class="text-xs font-extrabold tracking-[0.15em] uppercase text-brand mb-3">{{ group.section }}</h2>
          <ul class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            @for (item of group.items; track item.route) {
              <li>
                <a [routerLink]="item.route" class="module-tile">
                  <app-xicon [name]="item.glyph" [size]="30" />
                  <span>{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="text-muted">No hay módulos con "{{ query() }}".</p>
      }
    </nav>
  `,
  styles: `
    .module-tile {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 4rem;
      padding: 0.75rem 1rem;
      border-radius: 1.25rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      color: var(--text);
      font-weight: 700;
      text-decoration: none;
      transition: border-color 150ms, transform 150ms;
    }
    .module-tile:hover { border-color: var(--brand); }
    .module-tile:active { transform: scale(0.98); }
  `,
})
export class AllModulesComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly query = signal('');
  protected readonly groups = computed(() => {
    const permissions = this.auth.permissions();
    return groupModules(visibleMenu((p) => permissions.has(p)), this.query());
  });

  constructor() {
    afterNextRender(() => this.search().nativeElement.focus());
  }

  openFirst(): void {
    const first = this.groups()[0]?.items[0];
    if (first) {
      void this.router.navigateByUrl(first.route);
    }
  }
}
