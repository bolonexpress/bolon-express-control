/**
 * Cabeceras de seguridad de la aplicacion.
 *
 * La CSP usa un nonce por peticion generado en middleware: Next.js lo lee de la
 * cabecera `Content-Security-Policy` de la peticion y lo aplica a sus scripts
 * inline. Por eso la CSP NO se define en next.config.ts (generaria una segunda
 * cabecera incompatible).
 */

export function buildContentSecurityPolicy(nonce: string): string {
  const isProduction = process.env.NODE_ENV === 'production';

  const supabaseOrigin = (() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();

  const supabaseWildcard = 'https://*.supabase.co';
  const supabaseWsWildcard = 'wss://*.supabase.co';

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' solo en desarrollo: lo necesita el overlay de Next.
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isProduction ? [] : ["'unsafe-eval'"]),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', supabaseWildcard],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'blob:', supabaseWildcard],
    'connect-src': ["'self'", supabaseWildcard, supabaseWsWildcard],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
  };

  if (supabaseOrigin) {
    directives['connect-src']?.push(supabaseOrigin);
    directives['img-src']?.push(supabaseOrigin);
  }

  if (isProduction) {
    directives['upgrade-insecure-requests'] = [];
  }

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

export const NONCE_HEADER = 'x-nonce';