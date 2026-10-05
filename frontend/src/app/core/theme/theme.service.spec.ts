import { TestBed } from '@angular/core/testing';
import { UI_PREF_KEYS } from '../../shared/ui-prefs';
import { DARK_CLASS, isDarkMode, parseThemeMode, themeModeIcon } from './theme-mode';
import { ThemeService } from './theme.service';

describe('theme-mode', () => {
  it('interpreta el valor guardado y usa "system" por defecto', () => {
    expect(parseThemeMode('dark')).toBe('dark');
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode(null)).toBe('system');
    expect(parseThemeMode('azul')).toBe('system');
  });

  it('resuelve el modo oscuro según la elección y el sistema', () => {
    expect(isDarkMode('dark', false)).toBeTrue();
    expect(isDarkMode('light', true)).toBeFalse();
    expect(isDarkMode('system', true)).toBeTrue();
    expect(isDarkMode('system', false)).toBeFalse();
  });

  it('tiene un icono por modo', () => {
    expect(themeModeIcon('dark')).toBe('pi pi-moon');
  });
});

describe('ThemeService', () => {
  const root = document.documentElement;
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(UI_PREF_KEYS.theme);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    if (saved === null) {
      localStorage.removeItem(UI_PREF_KEYS.theme);
    } else {
      localStorage.setItem(UI_PREF_KEYS.theme, saved);
    }
    root.classList.remove(DARK_CLASS);
  });

  it('aplica la clase oscura en <html> y guarda la preferencia', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    expect(root.classList.contains(DARK_CLASS)).toBeTrue();
    expect(localStorage.getItem(UI_PREF_KEYS.theme)).toBe('dark');

    theme.setMode('light');
    expect(root.classList.contains(DARK_CLASS)).toBeFalse();
    expect(theme.isDark()).toBeFalse();
    expect(localStorage.getItem(UI_PREF_KEYS.theme)).toBe('light');
  });

  it('arranca con la preferencia guardada', () => {
    localStorage.setItem(UI_PREF_KEYS.theme, 'dark');
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('dark');
    expect(root.classList.contains(DARK_CLASS)).toBeTrue();
  });
});
