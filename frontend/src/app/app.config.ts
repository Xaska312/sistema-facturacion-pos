import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { BrandingService } from './core/theme/branding.service';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/errors/error.interceptor';
import { loadingInterceptor } from './core/loading/loading';
import { AppPreset } from './core/theme/app-preset';
import { PRIMENG_ES } from './core/theme/primeng-es';
import { DARK_CLASS } from './core/theme/theme-mode';
import { ThemeService } from './core/theme/theme.service';
import { AppTitleStrategy } from './core/title/app-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // La barra de carga va primero para cubrir también el reintento tras renovar el token.
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: AppPreset, options: { darkModeSelector: `.${DARK_CLASS}` } },
      translation: PRIMENG_ES,
    }),
    MessageService,
    ConfirmationService,
    // Mantiene sincronizada la clase del modo oscuro (public/theme-init.js ya la aplicó antes del primer render).
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // Color y logo del negocio en uso (fase 8c): se aplican al entrar a un negocio y se quitan al salir.
    provideAppInitializer(() => {
      inject(BrandingService);
    }),
    // Recupera la sesión (cookie de refresh) antes de evaluar las rutas, para que al recargar
    // la página los guards vean el negocio ya seleccionado.
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      await firstValueFrom(auth.restore());
      // Decisión 333: abrió sin internet con la caja recordada en este equipo: directo a Vender.
      if (auth.offlineBoot() && !globalThis.location?.pathname.startsWith('/pos')) {
        globalThis.history?.replaceState(null, '', '/pos');
      }
    }),
    // Decisión 333: la app queda guardada en el equipo (abre sin internet); en desarrollo no se usa.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
