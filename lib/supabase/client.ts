'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente para Client Components.
 * Solo puede usarse con la anon key: la RLS es la unica linea de defensa.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisa .env.local',
    );
  }

  return createBrowserClient(url, anonKey);
}