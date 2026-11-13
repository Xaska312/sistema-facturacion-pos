/** Opción de `app-menu` (mismos campos que el `MenuItem` de PrimeNG que usa la app). */
export interface MenuItem {
  label?: string;
  icon?: string;
  command?: (event: { originalEvent?: Event; item: MenuItem }) => void;
  routerLink?: string | readonly unknown[];
  queryParams?: Record<string, unknown>;
  url?: string;
  target?: string;
  separator?: boolean;
  disabled?: boolean;
  visible?: boolean;
  styleClass?: string;
  /** Grupo: `label` es el título y estas son sus opciones. */
  items?: MenuItem[];
}
