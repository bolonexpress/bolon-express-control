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
 * ⚠️ TEMPORAL: los `console.log` de este archivo son de diagnostico. Quitar en
 * la Fase 11 (ver /diag/permisos).
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log('[guards] RECHAZA: sin sesion valida', {
      userError: userError?.message ?? null,
    });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    console.log('[guards] RECHAZA: perfil ilegible o inactivo', {
      uid: user.id,
      hayPerfil: Boolean(profile),
      profileError: profileError?.message ?? null,
      is_active: profile?.is_active ?? null,
    });
    return null;
  }

  const { data: roleLinks, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);

  if (rolesError) {
    console.log('[guards] RECHAZA: no se pudo leer user_roles', {
      uid: user.id,
      error: rolesError.message,
    });
    return null;
  }

  const roleIds = (roleLinks ?? []).map((link) => link.role_id);
  if (roleIds.length === 0) {
    console.log('[guards] AVISO: usuario sin ningun rol', { uid: user.id });
    return { user, profile, roleKeys: [], permissions: [] };
  }

  const [rolesResult, permissionsResult] = await Promise.all([
    supabase.from('roles').select('key').in('id', roleIds),
    supabase.from('role_permissions').select('permission_key').in('role_id', roleIds),
  ]);

  if (rolesResult.error || permissionsResult.error) {
    console.log('[guards] RECHAZA: no se pudieron leer roles/role_permissions', {
      uid: user.id,
      rolesError: rolesResult.error?.message ?? null,
      permissionsError: permissionsResult.error?.message ?? null,
    });
    return null;
  }

  const roleKeys = (rolesResult.data ?? []).map((row) => row.key);
  const permissions = (permissionsResult.data ?? []).map((row) => row.permission_key);

  console.log(
    '[guards] contexto OK',
    { uid: user.id, roles: roleKeys, permisos: permissions },
    roleKeys.includes('admin')
      ? '(admin: acceso total por atajo, sin mirar el array)'
      : '',
  );

  return { user, profile, roleKeys, permissions };
});

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
    // Por que se rechaza exactamente: rol ausente vs permiso no concedido.
    console.log('[guards] RECHAZA PERMISO', {
      uid: context.user.id,
     roles: context.roleKeys,
      pedido: permission,
      motivo: context.roleKeys.length === 0 ? 'sin_rol' : 'permiso_no_concedido',
      concedidos: context.permissions,
    });
    throw new ForbiddenError(permission);
  }
  return context;
}

/** Guard para paginas: redirige en lugar de lanzar excepcion. */
export async function requirePageContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    console.log('[guards] PAGINA -> redirect(/login): sin contexto');
    redirect('/login');
  }
  return context;
}

export async function requirePagePermission(permission: string): Promise<AuthContext> {
  const context = await requirePageContext();
  if (!contextHasPermission(context, permission)) {
    console.log('[guards] PAGINA -> redirect(/no-autorizado)', {
      uid: context.user.id,
      roles: context.roleKeys,
      pedido: permission,
      motivo: context.roleKeys.length === 0 ? 'sin_rol' : 'permiso_no_concedido',
    });
    redirect('/no-autorizado');
  }
  return context;
}