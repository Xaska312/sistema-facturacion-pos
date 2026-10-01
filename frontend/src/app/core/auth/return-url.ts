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
