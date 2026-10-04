import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { buildContentSecurityPolicy, NONCE_HEADER } from '@/lib/security/headers';
import { hardenSessionCookie } from '@/lib/supabase/session-cookies';

/**
 * Mantiene la sesion de Supabase en middleware y aplica la CSP con nonce.
 * `getUser()` valida el JWT contra el servidor de Auth: no basta con leer la
 * cookie, porque el usuario puede estar desactivado o el token caducado.
 *
 * **Por que aqui no se lanza ninguna excepcion.** El middleware corre en el Edge
 * Runtime de Vercel, y ahi una excepcion sin capturar no se ve como una pagina
 * de error: se convierte en un `500 MIDDLEWARE_INVOCATION_FAILED` en TODAS las
 * rutas de la app, con la build en verde. Dos motivos lo disparaban:
 *
 * 1. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` ausentes en el
 *    Edge Runtime. Next las inlinea en el bundle en tiempo de BUILD, asi que si
 *    se anaden en Vercel despues del deploy, o en otro entorno (Preview en vez
 *    de Production), la build pasa y el runtime recibe `undefined`.
 * 2. `getUser()` va por red al servidor de Auth. Si Supabase no responde, el
 *    `fetch` lanza y tumbaba el middleware entero.
 *
 * Los dos casos se devuelven como `ok: false` con un motivo, y es
 * `middleware.ts` quien degrada la respuesta (fail-closed hacia /login, sin
 * caerse). Un 503 con el motivo es infinitamente mas util que un 500 opaco.
 */

/** Por que no se pudo verificar la sesion. Lo consume `middleware.ts`. */
export type MotivoFallo = 'falta_config' | 'fallo_supabase';

export type ResultadoSesion =
  | {
      ok: true;
      response: NextResponse;
      supabase: SupabaseClient;
      /** `null` = no hay sesion. No es un error: es el caso normal de /login. */
      user: User | null;
    }
  | {
      ok: false;
      response: NextResponse;
      motivo: MotivoFallo;
    };

/**
 * Respuesta de paso con el nonce de la CSP aplicado.
 *
 * Next.js lee el nonce de la cabecera de la peticion y lo aplica a sus scripts
 * inline; sin esto la CSP con nonce bloquearia la hidratacion. Se exporta para
 * que `middleware.ts` pueda construir tambien la respuesta degradada con las
 * mismas cabeceras, en vez de una CSP sin nonce que dejaria la pagina en blanco.
 */
export function respuestaConNonce(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  const next = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(next, nonce);
  return next;
}

export async function updateSession(
  request: NextRequest,
  nonce: string,
): Promise<ResultadoSesion> {
  let response = respuestaConNonce(request, nonce);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Faltan credenciales: no se lanza, se informa. Sin esto la app entera
    // devolvia 500 y no habia forma de saber que era por esto.
    console.error(
      '[MW] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el Edge Runtime.',
      { url: url ? 'OK' : 'FALTA', anonKey: anonKey ? 'OK' : 'FALTA' },
    );
    return { ok: false, response, motivo: 'falta_config' };
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = respuestaConNonce(request, nonce);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenSessionCookie(options));
          }
        },
      },
    });

    // `getUser()` sale a la red. Un fallo de Supabase aqui es "no se pudo
    // verificar la sesion", no un 500: la respuesta degradada lo controla
    // `middleware.ts`.
    const { data, error: errorAuth } = await supabase.auth.getUser();

    // "Auth session missing!" NO es un fallo: es lo que responde Supabase cuando
    // el visitante no tiene cookie de sesion, o sea en cada visita a /login y en
    // cada crawler. Avisar de eso llenaria los logs de Vercel de ruido y taparia
    // los errores que si importan.
    if (errorAuth && errorAuth.message !== 'Auth session missing!') {
      console.error('[MW] Supabase Auth no pudo validar la sesion:', errorAuth.message);
    }

    return { ok: true, response, supabase, user: data?.user ?? null };
  } catch (error) {
    console.error('[MW] Supabase no respondio en el Edge Runtime:', error);
    return { ok: false, response, motivo: 'fallo_supabase' };
  }
}

export function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noimageindex');
  response.headers.set('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
}
