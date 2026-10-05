import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { UI_PREF_KEYS, readUiPref, writeUiPref } from '../../shared/ui-prefs';
import { DARK_CLASS, ThemeMode, isDarkMode, parseThemeMode } from './theme-mode';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Modo claro/oscuro/sistema. La preferencia se guarda en localStorage (no es sensible) y la clase
 * {@link DARK_CLASS} se aplica en <html>. index.html la aplica antes del primer render para evitar el parpadeo;
 * este servicio la mantiene al día (cambio manual o cambio del sistema operativo).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media: MediaQueryList | null =
    typeof this.document.defaultView?.matchMedia === 'function' ? this.document.defaultView.matchMedia(DARK_QUERY) : null;

  private readonly systemDark = signal(this.media?.matches ?? false);
  readonly mode = signal<ThemeMode>(parseThemeMode(readUiPref(UI_PREF_KEYS.theme)));
  readonly isDark = computed(() => isDarkMode(this.mode(), this.systemDark()));

  constructor() {
    const onSystemChange = (event: MediaQueryListEvent) => {
      this.systemDark.set(event.matches);
      this.apply();
    };
    this.media?.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onSystemChange));
    this.apply();
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    writeUiPref(UI_PREF_KEYS.theme, mode);
    this.apply();
  }

  private apply(): void {
    this.document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
  }
}
