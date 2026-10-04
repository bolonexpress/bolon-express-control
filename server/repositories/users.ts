import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientAvailable } from '@/lib/supabase/admin';
import type { ProfileRow, UsuarioRow } from '@/types/domain';
import type { UsuariosFiltrosParsed } from '@/lib/validation/users';

/**
 * Usuarios + roles (Fase 10).
 *
 * Los perfiles se leen con el cliente de sesion: la RLS ya exige `users:manage`
 * para ver a alguien que no seas tu. El correo NO esta en `profiles`, vive en
 * `auth.users` y exige `service_role` en servidor; por eso puede venir `null` y
 * la UI lo trata como "no disponible", no como "no tiene".
 *
 * NOTA sobre el indice: `profiles` no tiene indice mas alla de su PK en `id`, y
 * la paginacion por keyset ordena por `(full_name, id)`, asi que con muchos
 * usuarios PostgreSQL acaba recorriendo la tabla. Para una tienda con decenas de
 * personas es irrelevante; si algun dia crece, el indice es
 * `create index profiles_full_name_id_idx on public.profiles (full_name, id)`.
 * No se anade en esta migracion porque la fase no toca el esquema.
 */
export type { UsuarioRow };
/** Tamanio de pagina del listado. 25 cabe en la pantalla de un telefono. */
export const USUARIOS_PAGE_SIZE = 25;

/* El select es UN literal a proposito: concatenar ensancha el tipo a `string`
 * y PostgREST deja de reconocer las columnas (ver nota en history.ts). */
const PERFIL_SELECT =
  'id, full_name, phone, is_active, force_password_change, last_seen_at, created_at';

/**
 * Escapa un valor para meterlo dentro de un filtro `or(...)` de PostgREST.
 *
 * Sin comillas, un nombre con acentos, espacios o -peor- una coma rompe la
 * sintaxis del filtro y la consulta falla con un 400 en vez de devolver la
 * pagina. Con comillas dobles PostgREST trata el valor como literal, y solo
 * queda escapar la barra invertida y la propia comilla.
 */
function pgTexto(valor: string): string {
  return `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Limpia el termino de busqueda antes de usarlo como patron `ilike`.
 *
 * Se escapan los comodines (`%`, `_`) para que seekon `%` no matchee todo, y se
 * quitan los caracteres que rompen el filtro compuesto: coma, parentesis y
 * punto (separadores de la sintaxis de PostgREST).
 */
function patronBusqueda(termino: string): string {
  const limpio = termino
    .replace(/[%,()]/g, ' ')
    .replace(/([%_\\])/g, '\\$1')
    .trim();
  return `*${limpio}*`;
}

/** Decodifica el cursor `base64url(nombre)|uuid`. */
function leerCursor(cursor: string): { nombre: string; id: string } | null {
  const sep = cursor.lastIndexOf('|');
  if (sep < 0) return null;
  try {
    const nombre = Buffer.from(cursor.slice(0, sep), 'base64url').toString('utf8');
    return { nombre, id: cursor.slice(sep + 1) };
  } catch {
    return null;
  }
}

/** Arma el cursor de la siguiente pagina a partir de la ultima fila visible. */
export function cursorUsuarios(fila: { full_name: string; id: string }): string {
  return `${Buffer.from(fila.full_name, 'utf8').toString('base64url')}|${fila.id}`;
}

/**
 * Correos de los usuarios cuyo correo contiene el termino. Solo se puede leer
 * `auth.users` con service_role, asi que la busqueda por correo se resuelve
 * fuera de PostgREST y se devuelve como lista de ids para filtrar despues.
 */
async function idsPorCorreo(termino: string): Promise<string[]> {
  if (!isAdminClientAvailable()) return [];

  try {
    const admin = createAdminClient();
    const limpio = termino.replace(/[%,()]/g, '').trim().toLowerCase();
    if (limpio === '') return [];

    const ids: string[] = [];
    // Paginado: `listUsers` no filtra por correo, asi que hay que recorrer
    // paginas. Con el volumen de una tienda basta una; se admiten hasta tres
    // por si acaso y se corta en cuanto se llena el conjunto.
    for (let pagina = 1; pagina <= 3 && ids.length < 200; pagina += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) {
        console.error('[usuarios] no se pudieron leer los correos:', error.message);
        break;
      }
      if (!data.users.length) break;
      for (const usuario of data.users) {
        if (usuario.email && usuario.email.toLowerCase().includes(limpio)) ids.push(usuario.id);
      }
      if (data.users.length < 200) break;
    }
    return ids;
  } catch (error) {
    console.error(
      '[usuarios] service role no disponible:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export type UsuariosPagina = { filas: UsuarioRow[]; nextCursor: string | null };

/**
 * Lee una pagina del listado de usuarios con cursor keyset sobre
 * `(full_name, id)`: nada de `offset`, que releeria todas las paginas
 * anteriores en la base.
 *
 * Devuelve LIMITO+1 filas internamente para saber si hay mas sin un segundo
 * query (`count` en PostgREST cuesta).
 */
export async function listUsuariosPagina(filtros: UsuariosFiltrosParsed): Promise<UsuariosPagina> {
  const supabase = await createClient();

  const condiciones: string[] = [];

  if (filtros.busqueda) {
    const partes = [`full_name.ilike.${pgTexto(patronBusqueda(filtros.busqueda))}`];
    const ids = await idsPorCorreo(filtros.busqueda);
    // Los uuids son un charset seguro, asi que van sin comillas en el `in`.
    if (ids.length > 0) partes.push(`id.in.(${ids.join(',')})`);
    if (partes.length > 0) condiciones.push(partes.join(','));
  }

  if (filtros.rol) {
    const { data: conRol, error: rolError } = await supabase
      .from('user_roles')
      .select('user_id, roles!inner(key)')
      .eq('roles.key', filtros.rol);

    if (rolError) throw rolError;

    const ids = [...new Set((conRol ?? []).map((fila) => fila.user_id))];
    // Sin usuarios con ese rol: se devuelve la pagina vacia sin consultar
    // `profiles` (un `in` sobre lista vacia haria lo mismo, pero sin el viaje).
    if (ids.length === 0) return { filas: [], nextCursor: null };
    condiciones.push(`id.in.(${ids.join(',')})`);
  }

  if (filtros.cursor) {
    const leido = leerCursor(filtros.cursor);
    if (leido) {
      const nombre = pgTexto(leido.nombre);
      condiciones.push(
        `full_name.gt.${nombre},and(full_name.eq.${nombre},id.gt.${pgTexto(leido.id)})`,
      );
    }
  }

  let consulta = supabase
    .from('profiles')
    .select(PERFIL_SELECT)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(USUARIOS_PAGE_SIZE + 1);

  if (filtros.estado !== 'todos') {
    consulta = consulta.eq('is_active', filtros.estado === 'activo');
  }
  for (const condicion of condiciones) {
    consulta = consulta.or(condicion);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  const filas = (data ?? []) as ProfileRow[];
  const hayMas = filas.length > USUARIOS_PAGE_SIZE;
  const pagina = hayMas ? filas.slice(0, USUARIOS_PAGE_SIZE) : filas;

  if (pagina.length === 0) return { filas: [], nextCursor: null };

  const roles = await rolesDeUsuarios(pagina.map((fila) => fila.id));
  const correos = await correosDeIds(pagina.map((fila) => fila.id));

  const conRoles = pagina.map((perfil) => {
    const asignados = roles.get(perfil.id) ?? [];
    return {
      id: perfil.id,
      email: correos.get(perfil.id) ?? null,
      full_name: perfil.full_name,
      phone: perfil.phone,
      is_active: perfil.is_active,
      force_password_change: perfil.force_password_change,
      last_seen_at: perfil.last_seen_at,
      created_at: perfil.created_at,
      roleKeys: asignados.map((rol) => rol.key),
      roleNames: asignados.map((rol) => rol.name),
    } satisfies UsuarioRow;
  });

  const ultima = pagina[pagina.length - 1];
  const nextCursor =
    hayMas && ultima ? cursorUsuarios({ full_name: ultima.full_name, id: ultima.id }) : null;

  return { filas: conRoles, nextCursor };
}

/** `user_roles` + `roles` de varios usuarios en dos consultas, no una por fila. */
async function rolesDeUsuarios(
  userIds: string[],
): Promise<Map<string, { key: string; name: string }[]>> {
  const supabase = await createClient();
  const [{ data: links, error: linksError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from('user_roles').select('user_id, role_id').in('user_id', userIds),
      supabase.from('roles').select('id, key, name'),
    ]);

  if (linksError) throw linksError;
  if (rolesError) throw rolesError;

  const rolesById = new Map((roles ?? []).map((rol) => [rol.id, rol]));
  const porUsuario = new Map<string, { key: string; name: string }[]>();
  for (const link of links ?? []) {
    const rol = rolesById.get(link.role_id);
    if (!rol) continue;
    const lista = porUsuario.get(link.user_id) ?? [];
    lista.push({ key: rol.key, name: rol.name });
    porUsuario.set(link.user_id, lista);
  }
  return porUsuario;
}

/**
 * Roles de UN usuario, en plano. Lo usa `cambiarRolAction` para saber quais
 * quitar antes de poner el nuevo.
 */
export async function rolesDeUsuario(userId: string): Promise<{ id: string; key: string; name: string }[]> {
  const supabase = await createClient();
  const [{ data: links, error: linksError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from('user_roles').select('role_id').eq('user_id', userId),
    supabase.from('roles').select('id, key, name'),
  ]);

  if (linksError) throw linksError;
  if (rolesError) throw rolesError;

  const rolesById = new Map((roles ?? []).map((rol) => [rol.id, rol]));
  const salida: { id: string; key: string; name: string }[] = [];
  for (const link of links ?? []) {
    const rol = rolesById.get(link.role_id);
    if (rol) salida.push(rol);
  }
  return salida;
}

/** Correos de varios usuarios. `listUsers` no filtra, asi que se filtran aqui. */
async function correosDeIds(userIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!isAdminClientAvailable() || userIds.length === 0) return mapa;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.error('[usuarios] no se pudieron leer los correos:', error.message);
      return mapa;
    }
    for (const usuario of data.users) {
      if (userIds.includes(usuario.id) && usuario.email) mapa.set(usuario.id, usuario.email);
    }
  } catch (error) {
    console.error(
      '[usuarios] service role no disponible:',
      error instanceof Error ? error.message : error,
    );
  }
  return mapa;
}

/** Un usuario con sus roles, para la pantalla de edicion. */
export const getUsuario = cache(async (id: string): Promise<UsuarioRow | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(PERFIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const roles = await rolesDeUsuarios([id]);
  const correos = await correosDeIds([id]);
  const asignados = roles.get(id) ?? [];

  return {
    id: data.id,
    email: correos.get(id) ?? null,
    full_name: data.full_name,
    phone: data.phone,
    is_active: data.is_active,
    force_password_change: data.force_password_change,
    last_seen_at: data.last_seen_at,
    created_at: data.created_at,
    roleKeys: asignados.map((rol) => rol.key),
    roleNames: asignados.map((rol) => rol.name),
  };
});

/**
 * Cerrojo anti-encierro: cuantas personas activas con rol admin quedan SI se
 * excluye a `exceptoId`.
 *
 * Es la unica fuente de verdad del cerrojo. Se usa en tres sitios (desactivar,
 * quitar rol y cambiar rol) para que la regla no se lea tres veces y se
 * desvíe en una de ellas. Devuelve `0` si el propio usuario es el ultimo admin.
 */
export async function contarAdminsActivos(exceptoId?: string): Promise<number> {
  const supabase = await createClient();

  const { data: admins, error: adminsError } = await supabase
    .from('user_roles')
    .select('user_id, profiles!inner(is_active), roles!inner(key)')
    .eq('roles.key', 'admin');

  if (adminsError) throw adminsError;

  let total = 0;
  for (const fila of admins ?? []) {
    const activo = (fila as { profiles?: { is_active?: boolean } | null }).profiles?.is_active;
    if (activo !== true) continue;
    const userId = (fila as { user_id?: string | null }).user_id;
    if (exceptoId && userId === exceptoId) continue;
    total += 1;
  }
  return total;
}

/** Si el usuario indicado tiene rol admin (activo o no). */
export async function esAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id, roles!inner(key)')
    .eq('roles.key', 'admin')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
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


