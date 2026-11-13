import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmHostComponent } from './shared/ui/confirm-host.component';
import { LoadingBarComponent } from './shared/loading-bar.component';
import { TourOverlayComponent } from './shared/tour/tour-overlay.component';
import { UpdateBannerComponent } from './shared/update-banner.component';
import { rememberReferral } from './features/billing/referral-code';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmHostComponent, LoadingBarComponent, TourOverlayComponent, UpdateBannerComponent],
  template: `
    <app-loading-bar />
    <p-toast position="top-right" />
    <app-confirm-host />
    <router-outlet />
    <app-tour-overlay />
    <app-update-banner />
  `,
})
export class AppComponent {
  constructor() {
    // Decisión 312: un enlace de invitación (?ref=CÓDIGO) se recuerda hasta que se cree el negocio.
    try {
      rememberReferral(new URLSearchParams(window.location.search).get('ref'));
    } catch {
      // Sin dirección (pruebas): nada que recordar.
    }
  }
}
