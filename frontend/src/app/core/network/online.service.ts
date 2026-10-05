import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Conexión del navegador como signal (eventos online/offline). Es una pista para el usuario: el navegador puede
 * creer que hay red aunque el servidor no responda; los errores reales los sigue mostrando el interceptor.
 */
@Injectable({ providedIn: 'root' })
export class OnlineService {
  readonly online = signal(true);

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    if (!view) {
      return;
    }
    this.online.set(view.navigator.onLine !== false);
    const onOnline = () => this.online.set(true);
    const onOffline = () => this.online.set(false);
    view.addEventListener('online', onOnline);
    view.addEventListener('offline', onOffline);
    inject(DestroyRef).onDestroy(() => {
      view.removeEventListener('online', onOnline);
      view.removeEventListener('offline', onOffline);
    });
  }
}
