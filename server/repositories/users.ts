import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientAvailable } from '@/lib/supabase/admin';
import type { ProfileRow } from '@/types/domain';

export type UserWithRoles = {
  id: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  force_password_change: boolean;
  last_seen_at: string | null;
  created_at: string;
  roleKeys: string[];
  roleNames: string[];
};

/**
 * Usuarios + roles. Los perfiles y permisos se leen con el cliente de sesion
 * (RLS); el correo solo existe en auth.users y exige service_role en servidor.
 */
export const listUsersWithRoles = cache(async (): Promise<UserWithRoles[]> => {
  const supabase = await createClient();

  const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }, { data: links, error: linksError }] =
    await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('roles').select('id, key, name').order('name'),
      supabase.from('user_roles').select('user_id, role_id'),
    ]);

  if (profilesError) throw profilesError;
  if (rolesError) throw rolesError;
  if (linksError) throw linksError;

  const rolesById = new Map((roles ?? []).map((role) => [role.id, role]));
  const rolesByUser = new Map<string, { key: string; name: string }[]>();
  for (const link of links ?? []) {
    const role = rolesById.get(link.role_id);
    if (!role) continue;
    const lista = rolesByUser.get(link.user_id) ?? [];
    lista.push({ key: role.key, name: role.name });
    rolesByUser.set(link.user_id, lista);
  }

  const emails = await listEmailsById();

  return (profiles ?? []).map((profile: ProfileRow) => {
    const asignados = rolesByUser.get(profile.id) ?? [];
    return {
      id: profile.id,
      email: emails.get(profile.id) ?? null,
      full_name: profile.full_name,
      is_active: profile.is_active,
      force_password_change: profile.force_password_change,
      last_seen_at: profile.last_seen_at,
      created_at: profile.created_at,
      roleKeys: asignados.map((rol) => rol.key),
      roleNames: asignados.map((rol) => rol.name),
    };
  });
});

async function listEmailsById(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!isAdminClientAvailable()) return mapa;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) {
      console.error('[usuarios] no se pudieron leer los correos:', error.message);
      return mapa;
    }
    for (const user of data.users) {
      if (user.email) mapa.set(user.id, user.email);
    }
  } catch (error) {
    console.error('[usuarios] service role no disponible:', error instanceof Error ? error.message : error);
  }
  return mapa;
}

export type RoleWithPermissions = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
};

export const listRolesWithPermissions = cache(async (): Promise<RoleWithPermissions[]> => {
  const supabase = await createClient();

  const [{ data: roles, error: rolesError }, { data: rolePermissions, error: permsError }] = await Promise.all([
    supabase.from('roles').select('*').order('name'),
    supabase.from('role_permissions').select('role_id, permission_key'),
  ]);

  if (rolesError) throw rolesError;
  if (permsError) throw permsError;

  const byRole = new Map<string, string[]>();
  for (const row of rolePermissions ?? []) {
    const lista = byRole.get(row.role_id) ?? [];
    lista.push(row.permission_key);
    byRole.set(row.role_id, lista);
  }

  return (roles ?? []).map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    permissions: (byRole.get(role.id) ?? []).sort(),
  }));
});

export const listPermissions = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('permissions')
    .select('key, module, description, is_sensitive')
    .order('module')
    .order('key');

  if (error) throw error;
  return data ?? [];
});