import type { CookieOptions } from '@supabase/ssr';

/**
 * Endurece las cookies de sesion de Supabase:
 *  - httpOnly siempre: JavaScript del navegador no puede leerlas.
 *  - sameSite lax: protege contra CSRF sin romper la navegacion normal.
 *  - secure solo en produccion: en desarrollo (http://localhost) el flag
 *    Secure romperia la sesion, y en Vercel todo el trafico es HTTPS.
 */
export function hardenSessionCookie(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}
