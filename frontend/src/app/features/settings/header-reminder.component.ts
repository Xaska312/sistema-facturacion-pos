import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { headerLines } from '../../shared/receipt/doc-header';

const DISMISS_KEY = 'xaska.header-reminder.dismissed';

/**
 * Aviso de Inicio (decisión 331): al dueño, mientras no haya escrito el encabezado de sus documentos (NIT, dirección,
 * celular), lo invita a hacerlo en Ajustes. "Ahora no" lo esconde en este equipo para ese negocio. No muestra nada
 * sin settings:manage o si la consulta falla.
 */
@Component({
  selector: 'app-header-reminder',
  imports: [RouterLink],
  template: `
    @if (show()) {
      <section class="card p-4 flex flex-wrap items-center gap-3" role="status" aria-label="Encabezado de los documentos">
        <i class="pi pi-id-card text-xl text-brand" aria-hidden="true"></i>
        <div class="flex-1 min-w-48 text-sm">
          <p><strong>Pon el NIT, la dirección y el celular en tus tiquetes</strong></p>
          <p class="text-xs text-muted mt-0.5">Escríbelos una vez en Ajustes y salen en tiquetes, pedidos, cotizaciones
            e informes de caja.</p>
        </div>
        <a class="text-brand font-medium hover:underline text-sm" routerLink="/app/ajustes" fragment="encabezado">
          Escribir encabezado</a>
        <button type="button" class="text-sm text-muted hover:underline" (click)="dismiss()">Ahora no</button>
      </section>
    }
  `,
})
export class HeaderReminderComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly auth = inject(AuthService);
  protected readonly show = signal(false);

  ngOnInit(): void {
    if (!this.auth.hasPermission('settings:manage') || this.dismissed()) {
      return;
    }
    this.api.settings().subscribe({
      next: (s) => this.show.set(headerLines(s.receiptHeader).length === 0),
      error: () => undefined,
    });
  }

  protected dismiss(): void {
    this.show.set(false);
    try {
      globalThis.localStorage?.setItem(this.key(), '1');
    } catch {
      /* sin almacenamiento: vuelve a salir la próxima vez */
    }
  }

  private dismissed(): boolean {
    try {
      return globalThis.localStorage?.getItem(this.key()) === '1';
    } catch {
      return false;
    }
  }

  private key(): string {
    return `${DISMISS_KEY}.${this.auth.currentTenant()?.id ?? ''}`;
  }
}
