import { XIconName } from '../../shared/icons/xicons';

/** Sección de la consola de plataforma: va en su dock y da el ícono del encabezado de cada pantalla. */
export interface PlatformMenuItem {
  route: string;
  label: string;
  glyph: XIconName;
}

/** Secciones de la consola de plataforma (identidad parte 4, decisión 266), en el orden del dock. */
export const PLATFORM_MENU: readonly PlatformMenuItem[] = [
  { route: '/plataforma/negocios', label: 'Negocios', glyph: 'tenants' },
  { route: '/plataforma/suscripciones', label: 'Suscripciones', glyph: 'subscriptions' },
  { route: '/plataforma/codigos', label: 'Códigos', glyph: 'codes' },
  { route: '/plataforma/planes', label: 'Planes', glyph: 'plans' },
  { route: '/plataforma/seguridad', label: 'Seguridad', glyph: 'security' },
];
