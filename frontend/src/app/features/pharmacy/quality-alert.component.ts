import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PharmacyApi } from '../../core/api/pharmacy.api';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Aviso del inicio (decisión 287): falta registrar la temperatura de la mañana o de la tarde. No muestra nada si no
 * falta ninguna, sin el permiso o el módulo, o si la consulta falla.
 */
@Component({
  selector: 'app-quality-alert',
  imports: [RouterLink],
  template: `
    @if (missing().length > 0) {
      <section class="card p-4 flex flex-wrap items-center gap-3" role="status" aria-label="Temperatura por registrar">
        <i class="pi pi-sun text-xl text-warning" aria-hidden="true"></i>
        <p class="flex-1 text-sm"><strong>Falta registrar la temperatura:</strong> {{ missing().join(', ') }}.</p>
        <a class="text-brand font-medium hover:underline text-sm" routerLink="/app/farmacia/calidad">Registrar ahora</a>
      </section>
    }
  `,
})
export class QualityAlertComponent implements OnInit {
  private readonly api = inject(PharmacyApi);
  private readonly auth = inject(AuthService);
  protected readonly missing = signal<string[]>([]);

  ngOnInit(): void {
    if (this.auth.hasPermission('pharmacy:quality') && this.auth.hasPermission('module:medicines')) {
      this.api.qualityToday(null, true).subscribe({ next: (t) => this.missing.set(t.missing), error: () => undefined });
    }
  }
}
