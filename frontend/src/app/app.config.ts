import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
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
    // Mantiene sincronizada la clase del modo oscuro (index.html ya la aplicó antes del primer render).
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // Recupera la sesión (cookie de refresh) antes de evaluar las rutas, para que al recargar
    // la página los guards vean el negocio ya seleccionado.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
