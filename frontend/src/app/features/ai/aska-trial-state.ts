import { Injectable, inject, signal } from '@angular/core';
import { AiApi, AiTrial } from '../../core/api/ai.api';
import { AuthService } from '../../core/auth/auth.service';
import { markWelcomeSeen, welcomeSeen } from './aska-trial';

/**
 * Prueba gratis de XASKA IA (decisión 311): los días que quedan (píldora del encabezado) y la bienvenida con los tres
 * retos. La bienvenida se abre sola la primera vez que el negocio tiene la prueba en ese equipo, también si llegó
 * invitado con la IA desde el primer día.
 */
@Injectable({ providedIn: 'root' })
export class AskaTrialState {
  private readonly api = inject(AiApi);
  private readonly auth = inject(AuthService);

  readonly trial = signal<AiTrial | null>(null);
  readonly welcomeOpen = signal(false);

  load(): void {
    this.api.trial().subscribe({
      next: (t) => {
        this.trial.set(t);
        const tenant = this.auth.tenantId();
        if (t && tenant && !welcomeSeen(tenant)) {
          markWelcomeSeen(tenant);
          this.welcomeOpen.set(true);
        }
      },
      error: () => this.trial.set(null),
    });
  }

  openWelcome(): void {
    this.load();
    this.welcomeOpen.set(true);
  }
}
