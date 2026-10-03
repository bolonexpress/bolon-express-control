import 'server-only';

import { createHash } from 'node:crypto';

import { createAdminClient, isAdminClientAvailable } from '@/lib/supabase/admin';

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  source: 'db' | 'memoria';
};

/**
 * Limite de intentos de login: 5 fallos por correo y 20 por IP en 15 minutos.
 *
 * La fuente primaria es Postgres (migracion 07), porque en Vercel cada instancia
 * es efimera: un contador en memoria no serviria. Si el entorno no tiene
 * service_role, se cae a un contador en memoria (solo aceptable en local) y la
 * decision lo reporta para que quede en los logs del servidor.
 */
const LIMITS = {
  maxPorCorreo: 5,
  maxPorIp: 20,
  ventanaSegundos: 900,
} as const;

const memoria = new Map<string, number[]>();

function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function limpiarMemoria(): void {
  const limite = Date.now() - LIMITS.ventanaSegundos * 1000;
  for (const [clave, marcas] of memoria) {
    const vivas = marcas.filter((m) => m > limite);
    if (vivas.length === 0) memoria.delete(clave);
    else memoria.set(clave, vivas);
  }
}

function evaluarMemoria(clave: string, maxIntentos: number): RateLimitDecision {
  limpiarMemoria();
  const marcas = memoria.get(clave) ?? [];
  const permitido = marcas.length < maxIntentos;
  const retryAfterSeconds = permitido
    ? 0
    : Math.ceil((Math.max(...marcas) + LIMITS.ventanaSegundos * 1000 - Date.now()) / 1000);
  return { allowed: permitido, retryAfterSeconds: Math.max(retryAfterSeconds, 0), source: 'memoria' };
}

export async function checkLoginRateLimit(
  email: string,
  ip: string | null,
): Promise<RateLimitDecision> {
  if (isAdminClientAvailable()) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('fn_login_rate_limit_check', {
        p_email: email,
        p_ip: ip,
        p_max_email: LIMITS.maxPorCorreo,
        p_max_ip: LIMITS.maxPorIp,
        p_window_seconds: LIMITS.ventanaSegundos,
      });

      if (!error && data && typeof data === 'object') {
        const resultado = data as { allowed?: boolean; retry_after_seconds?: number };
        return {
          allowed: resultado.allowed === true,
          retryAfterSeconds: Math.max(Number(resultado.retry_after_seconds ?? 0), 0),
          source: 'db',
        };
      }

      console.error('[rate-limit] RPC fallo, se usa memoria:', error?.message);
    } catch (error) {
      console.error('[rate-limit] cliente admin no disponible:', error instanceof Error ? error.message : error);
    }
  }

  const decision = evaluarMemoria(`email:${hash(email)}`, LIMITS.maxPorCorreo);
  if (ip) {
    const porIp = evaluarMemoria(`ip:${hash(ip)}`, LIMITS.maxPorIp);
    decision.allowed = decision.allowed && porIp.allowed;
    decision.retryAfterSeconds = Math.max(decision.retryAfterSeconds, porIp.retryAfterSeconds);
  }
  return decision;
}

export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  if (isAdminClientAvailable()) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.rpc('fn_login_attempts_record', {
        p_email: email,
        p_ip: ip,
        p_success: success,
      });
      if (error) console.error('[rate-limit] no se pudo registrar el intento:', error.message);
      return;
    } catch (error) {
      console.error('[rate-limit] error registrando intento:', error instanceof Error ? error.message : error);
    }
  }

  const claveCorreo = `email:${hash(email)}`;
  if (success) {
    memoria.delete(claveCorreo);
    return;
  }

  limpiarMemoria();
  memoria.set(claveCorreo, [...(memoria.get(claveCorreo) ?? []), Date.now()]);
  if (ip) {
    const claveIp = `ip:${hash(ip)}`;
    memoria.set(claveIp, [...(memoria.get(claveIp) ?? []), Date.now()]);
  }
}