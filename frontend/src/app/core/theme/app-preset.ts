import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * Preset de PrimeNG sobre Aura con la paleta de marca "Turquesa comercio".
 * Debe coincidir con los tokens de src/styles.css (misma paleta en claro y oscuro).
 *
 * Ajustes de accesibilidad (WCAG AA, contraste ≥ 4,5:1):
 * - En claro, el color primario es el tono 700 (el 500 de Aura no alcanza con texto blanco).
 * - Los neutros 500/600 son algo más oscuros para que el texto secundario y los placeholders se lean.
 * - El borde de los campos usa el neutro 400 (claro) / 500 (oscuro): contraste ≥ 3:1 con el fondo (WCAG 1.4.11).
 */
export const TEAL = {
  50: '#f0fdfa',
  100: '#ccfbf1',
  200: '#99f6e4',
  300: '#5eead4',
  400: '#2dd4bf',
  500: '#14b8a6',
  600: '#0d9488',
  700: '#0f766e',
  800: '#115e59',
  900: '#134e4a',
  950: '#042f2e',
} as const;

const LIGHT_SURFACE = {
  0: '#ffffff',
  50: '#f5f7f7',
  100: '#eef2f2',
  200: '#dbe2e2',
  300: '#c3cdcc',
  400: '#839290',
  500: '#5f706e',
  600: '#4f5f5d',
  700: '#3b4a48',
  800: '#263331',
  900: '#12201f',
  950: '#0b1214',
} as const;

const DARK_SURFACE = {
  0: '#ffffff',
  50: '#f2f7f6',
  100: '#e6efee',
  200: '#d3dddc',
  300: '#b9c8c6',
  400: '#9cb0ad',
  500: '#5f7174',
  600: '#3d4f52',
  700: '#2a3a3d',
  800: '#1b2729',
  900: '#121c1e',
  950: '#0b1214',
} as const;

/** Severidades de PrimeNG → paleta de Aura usada en claro (tono 700: contraste ≥ 4,5:1 con blanco). */
const SEVERITIES = { success: 'green', info: 'sky', warn: 'orange', help: 'purple', danger: 'red' } as const;

function solidButtons(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(SEVERITIES).map(([severity, hue]) => [
      severity,
      {
        background: `{${hue}.700}`,
        hoverBackground: `{${hue}.800}`,
        activeBackground: `{${hue}.900}`,
        borderColor: `{${hue}.700}`,
        hoverBorderColor: `{${hue}.800}`,
        activeBorderColor: `{${hue}.900}`,
        color: '#ffffff',
        hoverColor: '#ffffff',
        activeColor: '#ffffff',
      },
    ]),
  );
}

function tintedButtons(withBorder: boolean): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(SEVERITIES).map(([severity, hue]) => [
      severity,
      withBorder ? { borderColor: `{${hue}.700}`, color: `{${hue}.700}` } : { color: `{${hue}.700}` },
    ]),
  );
}

/** Los mensajes emergentes de Aura usan el tono 600 sobre fondo casi blanco (≈ 3:1); se oscurece a 700/800. */
const TOAST_LIGHT = {
  info: { color: '{blue.700}', detailColor: '{surface.700}' },
  success: { color: '{green.800}', detailColor: '{surface.700}' },
  warn: { color: '{orange.800}', detailColor: '{surface.700}' },
  error: { color: '{red.700}', detailColor: '{surface.700}' },
};

export const AppPreset = definePreset(Aura, {
  semantic: {
    primary: TEAL,
    colorScheme: {
      light: {
        surface: LIGHT_SURFACE,
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
        formField: {
          borderColor: '{surface.400}',
          hoverBorderColor: '{surface.500}',
        },
        text: {
          color: '{surface.900}',
          hoverColor: '{surface.950}',
          mutedColor: '{surface.600}',
          hoverMutedColor: '{surface.700}',
        },
      },
      dark: {
        surface: DARK_SURFACE,
        primary: {
          color: '{primary.400}',
          contrastColor: '{primary.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        formField: {
          borderColor: '{surface.500}',
          hoverBorderColor: '{surface.400}',
        },
        text: {
          color: '{surface.100}',
          hoverColor: '{surface.0}',
          mutedColor: '{surface.400}',
          hoverMutedColor: '{surface.300}',
        },
      },
    },
  },
  components: {
    button: {
      colorScheme: {
        light: {
          root: solidButtons(),
          outlined: tintedButtons(true),
          text: tintedButtons(false),
        },
      },
    },
    toast: {
      colorScheme: {
        light: TOAST_LIGHT,
      },
    },
    tag: {
      colorScheme: {
        light: {
          success: { color: '{green.800}' },
          info: { color: '{sky.800}' },
          warn: { color: '{orange.800}' },
          danger: { color: '{red.800}' },
        },
      },
    },
  },
});
