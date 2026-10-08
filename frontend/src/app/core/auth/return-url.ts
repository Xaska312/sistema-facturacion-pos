/**
 * Devuelve la ruta interna a la que volver tras iniciar sesión, o null si no es segura
 * (evita redirecciones abiertas a otros sitios).
 */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}

/** Páginas que solo existen dentro de un negocio (después de elegirlo se vuelve a ellas). */
export function isTenantPage(url: string | null | undefined): url is string {
  return !!url && /^\/(app|pos)([/?#]|$)/.test(url);
}

/**
 * Parámetros para volver a {@code url} después del login o de elegir negocio. Solo las páginas que piden sesión
 * (las públicas no hace falta recordarlas) (QA UI-11).
 */
export function returnQuery(url: string | null | undefined): { returnUrl?: string } {
  const safe = safeReturnUrl(url);
  return safe && /^\/(app|pos|negocios|plataforma)([/?#]|$)/.test(safe) ? { returnUrl: safe } : {};
}
