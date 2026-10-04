import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { ForbiddenError, UnauthorizedError } from '@/server/auth/errors';
import type { ProfileRow } from '@/types/domain';

export type AuthContext = {
  user: User;
  profile: ProfileRow;
  roleKeys: string[];
  permissions: string[];
};

/**
 * Contexto de autorizacion de la peticion actual.
 *
 * NO confiar en el frontend: esta funcion lee `user_roles` y `role_permissions`
 * en cada peticion (memoizada con cache() de React), de modo que cualquier
 * cambio de rol surte efecto inmediato. La misma logica existe en la base de
 * datos (has_permission) para las politicas RLS.
 *
 * Ante cualquier duda (sin sesion, perfil ilegible, usuario inactivo) falla
 * cerrado: devuelve null.
 *
 * Logs (Fase 11). Este archivo solo escribe cuando PASO ALGO QUE NO ES NORMAL:
 *   - No se registra el camino feliz. Por request seria una linea por
 *     navegacion, y `getAuthContext` se memoiza pero aun asi se ejecuta en cada
 *     peticion nueva.
 *   - Sin sesion o perfil inactivo son estados NORMALES (el logout existe), no
 *     incidentes: no van a la consola. La bitacora ya guarda los `login` y
 *     `logout` en `audit_logs`.
 *   - Si una lectura de `user_roles` / `roles` / `role_permissions` falla, el
 *     guard devuelve `null` y TODOS los usuarios salen de la app sin motivo
 *     visible. Eso si es un incidente y queda en `console.error` (ADR-018).
 *   - Una denegacion de permiso si se registra: es un evento de seguridad, y la
 *     redireccion del middleware no pasa por la RPC `log_audit`, asi que no hay
 *     copia en la bitacora (ADR-018).
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) return null;

  const { data: roleLinks, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);

  if (rolesError) {
    // Falla cerrada: sin roles no se concede nada. El motivo va a consola
    // porque, sin el, el sintoma es "la app no deja entrar a nadie".
    console.error('[guards] no se pudo leer user_roles: se deniega todo', {
      uid: user.id,
      motivo: rolesError.message,
    });
    return null;
  }

  const roleIds = (roleLinks ?? []).map((link) => link.role_id);
  if (roleIds.length === 0) {
    // Usuario sin rol: estado valido (se crea antes de asignarlo). El
    // middleware lo manda a /no-autorizado; no es un fallo.
    return { user, profile, roleKeys: [], permissions: [] };
  }

  const [rolesResult, permissionsResult] = await Promise.all([
    supabase.from('roles').select('key').in('id', roleIds),
    supabase.from('role_permissions').select('permission_key').in('role_id', roleIds),
  ]);

  if (rolesResult.error || permissionsResult.error) {
    console.error('[guards] no se pudieron leer roles/role_permissions: se deniega todo', {
      uid: user.id,
      rolesError: rolesResult.error?.message ?? null,
      permissionsError: permissionsResult.error?.message ?? null,
    });
    return null;
  }

  const roleKeys = (rolesResult.data ?? []).map((row) => row.key);
  const permissions = (permissionsResult.data ?? []).map((row) => row.permission_key);

  return { user, profile, roleKeys, permissions };
});

/**
 * Una sola linea por denegacion, para que `requirePermission` (acciones) y
 * `requirePagePermission` (paginas) no escriban el mismo evento dos veces con
 * redaccion distinta.
 */
function registrarDenegacion(
  contexto: AuthContext,
  permission: string,
  via: 'accion' | 'pagina',
): void {
  console.error('[guards] acceso denegado', {
    uid: contexto.user.id,
    via,
    pedido: permission,
    roles: contexto.roleKeys,
    motivo: contexto.roleKeys.length === 0 ? 'sin_rol' : 'permiso_no_concedido',
  });
}

/**
 * `admin` tiene acceso total por diseno (misma excepcion que
 * `has_permission()` en la base de datos). Todo el RBAC pasa por aqui.
 */
export function contextHasPermission(context: AuthContext, permission: string): boolean {
  if (context.roleKeys.includes('admin')) return true;
  return context.permissions.includes(permission);
}

export async function hasPermission(permission: string): Promise<boolean> {
  const context = await getAuthContext();
  if (!context) return false;
  return contextHasPermission(context, permission);
}

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new UnauthorizedError();
  return context;
}

export async function requirePermission(permission: string): Promise<AuthContext> {
  const context = await requireAuthContext();
  if (!contextHasPermission(context, permission)) {
    registrarDenegacion(context, permission, 'accion');
    throw new ForbiddenError(permission);
  }
  return context;
}

/** Guard para paginas: redirige en lugar de lanzar excepcion. */
export async function requirePageContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  // Sin contexto no hay nada que registrar: no hay uid. La bitacora ya guarda
  // los accesos correctos y el fallo del login queda en el propio login.
  if (!context) redirect('/login');
  return context;
}

export async function requirePagePermission(permission: string): Promise<AuthContext> {
  const context = await requirePageContext();
  if (!contextHasPermission(context, permission)) {
    registrarDenegacion(context, permission, 'pagina');
    redirect('/no-autorizado');
  }
  return context;
}