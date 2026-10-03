import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { isAdminClientAvailable } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { contextHasPermission, getAuthContext, hasPermission } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

/**
 * DIAGNOSTICO DE PERMISOS — TEMPORAL, SOLO DESARROLLO.
 *
 * ⚠️ BORRAR ESTE ARCHIVO EN LA FASE 11 (junto con app/diag/page.tsx y la
 * excepcion `diag` del matcher de middleware.ts).
 *
 * Tambien fuera del middleware a proposito: si estuviera protegida, un fallo de
 * permisos la mandaria a /no-autorizado y no serviria para diagnosticar.
 * La unica barrera es NODE_ENV (ver abajo), que Next.js elimina en el build de
 * produccion al ser una constante inlineada.
 *
 * Replica EXACTAMENTE el camino que sigue la app (server/auth/guards.ts), de
 * modo que lo que se ve aqui es lo que devuelven los guards de verdad.
 */

export const dynamic = 'force-dynamic';

function detalleError(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  };
  return {
    message: err.message ?? null,
    code: err.code ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
  };
}

function pretty(valor: unknown): string {
  if (valor === null || valor === undefined) return String(valor);
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
}

function bloque(titulo: string, cuerpo: string): string {
  return `\n\n===== ${titulo} =====\n${cuerpo}`;
}

export default async function DiagPermisosPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  let salida = 'DIAGNOSTICO DE PERMISOS — temporal, solo desarrollo.';
  salida += `\nFuera del middleware. BORRAR EN FASE 11.`;

  const cookieStore = await cookies();
  const nombres = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .sort();

  salida += bloque(
    '0. ENTORNO Y COOKIES (solo nombres, sin valores)',
    [
      `NODE_ENV ......................... ${process.env.NODE_ENV}`,
      `cookies presentes ................ ${nombres.length ? nombres.join(', ') : '(ninguna)'}`,
      `SUPABASE_SERVICE_ROLE_KEY ......... ${isAdminClientAvailable() ? 'presente' : 'AUSENTE'}`,
    ].join('\n'),
  );

  try {
    const supabase = await createClient();

    // -----------------------------------------------------------------------
    // 1. UID de la sesion actual.
    // -----------------------------------------------------------------------
    const { data: datosUsuario, error: errorUsuario } = await supabase.auth.getUser();
    const uid = datosUsuario?.user?.id ?? null;

    salida += bloque(
      '1. UID DE LA SESION ACTUAL',
      [
        `hay_usuario ...... ${datosUsuario?.user ? 'SI' : 'NO'}`,
        `uid .............. ${uid ?? '(null)'}`,
        `email ............ ${datosUsuario?.user?.email ?? '(null)'}`,
        `error ............ ${pretty(detalleError(errorUsuario))}`,
      ].join('\n'),
    );

    if (!uid) {
      salida += bloque(
        'DIAGNOSTICO IMPOSIBLE',
        'No hay sesion, asi que no hay uid que consultar. Abre /diag primero: ahi se ve si el problema es la cookie o la RLS.',
      );
      return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{salida}</pre>;
    }

    // -----------------------------------------------------------------------
    // 2. user_roles JOIN roles para este UID.
    //    Se hacen los dos pasos por separado (como guards.ts) y ademas el JOIN
    //    real de PostgREST, para distinguir "no tiene rol" de "la policy no me
    //    deja ver los roles".
    // -----------------------------------------------------------------------
    const { data: userRoles, error: errorUserRoles } = await supabase
      .from('user_roles')
      .select('user_id, role_id, granted_at')
      .eq('user_id', uid);

    const roleIds = (userRoles ?? []).map((r) => r.role_id);

    const { data: roles, error: errorRoles } = roleIds.length
      ? await supabase.from('roles').select('id, key, name').in('id', roleIds)
      : { data: [], error: null };

    const { data: joinReal, error: errorJoin } = await supabase
      .from('user_roles')
      .select('user_id, granted_at, roles(id, key, name)')
      .eq('user_id', uid);

    const roleKeys = (roles ?? []).map((r) => r.key);

    salida += bloque(
      '2. user_roles JOIN roles (para este uid)',
      [
        `filas en user_roles .............. ${userRoles?.length ?? 0}`,
        `error user_roles ................ ${pretty(detalleError(errorUserRoles))}`,
        `error roles .................... ${pretty(detalleError(errorRoles))}`,
        `error JOIN ..................... ${pretty(detalleError(errorJoin))}`,
        '',
        'user_roles (crudo):',
        userRoles?.length ? pretty(userRoles) : '(sin filas)',
        '',
        'JOIN real de PostgREST:',
        joinReal?.length ? pretty(joinReal) : '(sin filas)',
        '',
        `ROLES RESUELTOS: ${roleKeys.length ? roleKeys.join(', ') : '(ninguno)'}`,
        roleKeys.includes('admin') ? '>> Incluye "admin": acceso total por diseño (ver sección 5).' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    // -----------------------------------------------------------------------
    // 3. role_permissions del rol admin + catalogo completo de permissions.
    // -----------------------------------------------------------------------
    const { data: todasPermissions, error: errorPerms } = await supabase
      .from('permissions')
      .select('key, module, is_sensitive')
      .order('key');

    const { data: adminRole } = await supabase
      .from('roles')
      .select('id, key, name')
      .eq('key', 'admin')
      .maybeSingle();

    const { data: permsAdmin, error: errorPermsAdmin } = adminRole
      ? await supabase
          .from('role_permissions')
          .select('permission_key')
          .eq('role_id', adminRole.id)
          .order('permission_key')
      : { data: [], error: null };

    const clavesAdmin = (permsAdmin ?? []).map((p) => p.permission_key);
    const clavesCatalogo = (todasPermissions ?? []).map((p) => p.key);
    const faltantes = clavesCatalogo.filter((k) => !clavesAdmin.includes(k));

    salida += bloque(
      '3. role_permissions PARA EL ROL admin',
      [
        `rol admin existe ................. ${adminRole ? 'SI' : 'NO'}`,
        `error permissions ............... ${pretty(detalleError(errorPerms))}`,
        `error role_permissions .......... ${pretty(detalleError(errorPermsAdmin))}`,
        '',
        `catalogo de permissions ......... ${clavesCatalogo.length} filas`,
        `role_permissions de admin ....... ${clavesAdmin.length} filas`,
        '',
        `PERMISOS QUE TIENE admin (${clavesAdmin.length}):`,
        clavesAdmin.length ? clavesAdmin.map((k) => ` - ${k}`).join('\n') : '(ninguno)',
        '',
        `FALTAN en admin (${faltantes.length}): ${faltantes.length ? faltantes.join(', ') : '(ninguno)'}`,
        faltantes.length
          ? '>> Si faltan, las migraciones 10 (inventory:read) o 12 (history:read) no estan aplicadas en Supabase.'
          : '',
        '',
        `CATALOGO COMPLETO (${clavesCatalogo.length}): ${clavesCatalogo.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );

    // -----------------------------------------------------------------------
    // 4. El helper REAL que usan los guards.
    // -----------------------------------------------------------------------
    const context = await getAuthContext();

    salida += bloque(
      '4. HELPER REAL DE LOS GUARDS (server/auth/guards.ts)',
      [
        `getAuthContext() ................ ${context ? 'devuelve contexto' : 'NULL (falla cerrado)'}`,
        '',
        context
          ? [
              `context.user.id ................. ${context.user.id}`,
              `context.profile.full_name ....... ${context.profile.full_name}`,
              `context.profile.is_active ....... ${context.profile.is_active}`,
              `context.roleKeys ................ ${context.roleKeys.length ? context.roleKeys.join(', ') : '(ninguno)'}`,
              `context.permissions (array) ..... ${context.permissions.length} entradas`,
              context.permissions.length ? context.permissions.map((p) => ` - ${p}`).join('\n') : '',
            ].join('\n')
          : '>> NULL significa que getAuthContext fallo: sin sesion, perfil ilegible, is_active=false, o un error al leer user_roles/roles/role_permissions. Cada pagina hara redirect(/login) por esto.',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    // hasPermission() real, permiso por permiso.
    const lineasPermiso: string[] = [];
    for (const [nombre, clave] of Object.entries(PERMISOS)) {
      const denegado = await hasPermission(clave);
      const porContexto = context ? contextHasPermission(context, clave) : false;
      lineasPermiso.push(
        ` ${denegado ? 'SI ' : 'NO '}  ${clave.padEnd(20)} hasPermission=${String(denegado).padEnd(5)} contextHasPermission=${String(porContexto).padEnd(5)} (${nombre})`,
      );
    }

    salida += bloque(
      '4b. hasPermission() POR PERMISO (la funcion que decide el acceso real)',
      [
        ...lineasPermiso,
        '',
        'contextHasPermission() da TRUE a TODO si roleKeys incluye "admin" (atajo de diseno).',
      ].join('\n'),
    );

    // -----------------------------------------------------------------------
    // 5. Veredicto.
    // -----------------------------------------------------------------------
    const conPermisos = context ? await hasPermission(PERMISOS.catalogRead) : false;
    const totalEfectivos = Object.keys(PERMISOS).filter((n) =>
      Boolean(context && contextHasPermission(context, PERMISOS[n as keyof typeof PERMISOS])),
    ).length;

    let veredicto = '';
    if (!context) {
      veredicto =
        '>> SIN CONTEXTO: getAuthContext() devuelve null. El bloqueo NO es de permisos todavia; el middleware y los guards parten de sesion/profile. Revisa /diag.';
    } else if (roleKeys.length === 0) {
      veredicto =
        '>> SIN ROLES: el usuario existe y esta activo pero no tiene ninguna fila en user_roles. Por eso no tiene permisos. Asignale un rol desde administracion.';
    } else if (roleKeys.includes('admin') && clavesAdmin.length === 0) {
      veredicto =
        '>> admin SIN role_permissions: tiene el rol pero la tabla role_permissions esta vacia para admin. Aun asi entra a todo por el atajo de contextHasPermission, pero las policies de la base (has_permission) NO le suplen: anade las filas del seed.';
    } else if (totalEfectivos === 0) {
      veredicto =
        '>> ROL SIN PERMISOS EFECTIVOS: tiene rol pero ningun permiso. El middleware lo mandara a /no-autorizado.';
    } else if (conPermisos) {
      veredicto = `OK. Acceso real disponible (${totalEfectivos} permisos efectivos). Si / sigue sin abrir, el problema ya no es de permisos.`;
    } else {
      veredicto = `>> ${totalEfectivos} permisos efectivos, pero sin catalog:read.`;
    }

    if (faltantes.length > 0) {
      veredicto += `\n>> OJO: faltan ${faltantes.length} permisos en el rol admin (${faltantes.join(', ')}). Suele significar migracion 10 o 12 sin aplicar.`;
    }

    salida += bloque('5. VEREDICTO', veredicto);
  } catch (error) {
    salida += bloque(
      'EXCEPCION',
      pretty(
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { valor: String(error) },
      ),
    );
  }

  return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{salida}</pre>;
}