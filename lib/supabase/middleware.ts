import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { buildContentSecurityPolicy, NONCE_HEADER } from '@/lib/security/headers';
import { hardenSessionCookie } from '@/lib/supabase/session-cookies';

/**
 * Mantiene la sesion de Supabase en middleware y aplica la CSP con nonce.
 * `getUser()` valida el JWT contra el servidor de Auth: no basta con leer la
 * cookie, porque el usuario puede estar desactivado o el token caducado.
 */
export async function updateSession(
  request: NextRequest,
  nonce: string,
): Promise<{ response: NextResponse; supabase: SupabaseClient; user: User | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisa .env.local',
    );
  }

  // Next.js lee el nonce de la cabecera de la peticion y lo aplica a sus
  // scripts inline; sin esto la CSP con nonce bloquearia la hidratacion.
  const buildResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(NONCE_HEADER, nonce);
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(next, nonce);
    return next;
  };

  let response = buildResponse();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = buildResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenSessionCookie(options));
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}

export function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noimageindex');
  response.headers.set('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
}