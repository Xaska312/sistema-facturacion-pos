/** Claims que emite el backend en el access token. */
export interface AccessClaims {
  sub: string;
  exp: number;
  typ: 'platform' | 'tenant';
  tid?: string;
  perms?: string[];
  padm?: boolean;
}

/**
 * Decodifica (sin verificar: la verificación la hace el backend) el payload de un JWT.
 * Devuelve null si el token no tiene el formato esperado.
 */
export function decodeAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const claims = JSON.parse(json) as Partial<AccessClaims>;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
      return null;
    }
    return claims as AccessClaims;
  } catch {
    return null;
  }
}
