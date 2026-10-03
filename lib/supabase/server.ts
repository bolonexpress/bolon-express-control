import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { hardenSessionCookie } from '@/lib/supabase/session-cookies';

/**
 * Cliente para Server Components y Server Actions.
 * Usa la sesion en cookies y respeta la RLS del usuario conectado.
 * Nunca usar con service_role: aqui la seguridad la aporta la base de datos.
 */
export async function createClient() {
  // Se pide el store de cookies ANTES de validar el entorno: de lo contrario la
  // pagina no se marcaria como dinamica y Next la pre-renderizaria en el build
  // (donde no hay entorno) y fallaria.
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisa .env.local',
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenSessionCookie(options));
          }
        } catch {
          // Server Components no pueden escribir cookies. El refresh de sesion
          // ocurre en middleware; aqui se ignora sin romper el render.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;