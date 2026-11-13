/** Opciones visuales comunes a `app-button` y `a[appButton]` (mismos nombres que tenía PrimeNG). */
export type ButtonSeverity = 'primary' | 'secondary' | 'success' | 'warn' | 'danger' | null | undefined;
export type ButtonSize = 'small' | 'large' | null | undefined;
export type ButtonIconPos = 'left' | 'right';

export interface ButtonLook {
  severity: ButtonSeverity;
  text: boolean;
  outlined: boolean;
  size: ButtonSize;
  rounded: boolean;
  iconOnly: boolean;
  loading: boolean;
}

/** Clases del botón: `ui-button` y sus variantes (estilos en `styles.css`). */
export function buttonClasses(look: ButtonLook): string {
  const classes = ['ui-button'];
  if (look.severity && look.severity !== 'primary') {
    classes.push(`ui-button-${look.severity}`);
  }
  if (look.text) {
    classes.push('ui-button-text');
  }
  if (look.outlined) {
    classes.push('ui-button-outlined');
  }
  if (look.size === 'small') {
    classes.push('ui-button-sm');
  } else if (look.size === 'large') {
    classes.push('ui-button-lg');
  }
  if (look.rounded) {
    classes.push('ui-button-rounded');
  }
  if (look.iconOnly) {
    classes.push('ui-button-icon-only');
  }
  if (look.loading) {
    classes.push('ui-button-loading');
  }
  return classes.join(' ');
}

/** Clases del ícono (PrimeIcons, p. ej. "pi pi-check"); a la derecha solo si hay texto. */
export function buttonIconClasses(icon: string, iconPos: ButtonIconPos, hasLabel: boolean): string {
  return ['ui-button-icon', hasLabel && iconPos === 'right' ? 'ui-button-icon-right' : '', icon].filter(Boolean).join(' ');
}
