/** Modo de color elegido por el usuario. "system" sigue la preferencia del sistema operativo. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Clase en <html> que activa el modo oscuro (PrimeNG: darkModeSelector; Tailwind: variante dark). */
export const DARK_CLASS = 'app-dark';

export const THEME_MODES: readonly { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Claro', icon: 'pi pi-sun' },
  { mode: 'dark', label: 'Oscuro', icon: 'pi pi-moon' },
  { mode: 'system', label: 'Según el sistema', icon: 'pi pi-desktop' },
];

/** Valor guardado → modo; cualquier otra cosa (null, basura) = "system". */
export function parseThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function isDarkMode(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}

export function themeModeIcon(mode: ThemeMode): string {
  return THEME_MODES.find((m) => m.mode === mode)?.icon ?? 'pi pi-desktop';
}
