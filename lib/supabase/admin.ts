import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con service_role. Bypasea la RLS: usar SOLO en scripts de
 * administracion y en el limitador de intentos de login.
 * Nunca importar desde un Client Component ni devolverlo a la vista.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Solo es necesaria para tareas administrativas y esta ausente en este entorno.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isAdminClientAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}