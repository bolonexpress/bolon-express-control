import 'server-only';

import { headers } from 'next/headers';

/**
 * IP del cliente segun las cabeceras del proxy (Vercel/Supabase).
 * Solo se usa para el limite de intentos de login: no se guarda ni se muestra.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const primera = forwarded.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? null;
}