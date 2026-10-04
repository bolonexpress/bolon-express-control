import { NextResponse, type NextRequest } from 'next/server';

import { applySecurityHeaders, updateSession } from '@/lib/supabase/middleware';

const LOGIN_PATH = '/login';
const FORCE_PASSWORD_PATH = '/cambiar-password';
const NO_AUTORIZADO_PATH = '/no-autorizado';

/**
 * Rutas exentas del filtro de permisos. Deben existir porque si un usuario sin
 * permisos fuera redirigido a una de ellas y esa ruta tambien exigiera
 * permisos, el ciclo no tendria salida.
 */
const EXENTAS_PERMISOS = new Set([LOGIN_PATH, FORCE_PASSWORD_PATH, NO_AUTORIZADO_PATH]);

/**
 * Protege TODAS las rutas de la aplicacion salvo /login.
 *
 * Capas (mas alla de esto, cada Server Action repite la comprobacion):
 *   1. Sin sesion valida -> /login
 *   2. Usuario inactivo  -> cierra sesion y vuelve a /login
 *   3. Cambio de clave obligatorio -> /cambiar-password (no sale de ahi)
 *
 * Regla anti-bucle: /login solo es un destino ESTABLE. Nunca se redirige
 * fuera de /login si la sesion no se pudo verificar, porque el guard de cada
 * pagina (`requirePageContext`) tambien manda a /login cuando no achieves un
 * perfil. Si esta capa expulsara al usuario de /login hacia "/", el ciclo
 * middleware -> "/" -> guard -> /login -> middleware no tendria salida.
 */
export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const { pathname, search } = request.nextUrl;

  const { response, supabase, user } = await updateSession(request, nonce);

  const redirectTo = (destination: URL) => {
    const redirect = NextResponse.redirect(destination);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  };

  if (!user) {
    if (pathname === LOGIN_PATH) {
      return response;
    }

    const target = new URL(LOGIN_PATH, request.url);
    if (pathname !== '/') {
      target.searchParams.set('next', `${pathname}${search}`);
    }
    return redirectTo(target);
  }

  const {
    data: profile,
    error,
  } = await supabase
    .from('profiles')
    .select('is_active, force_password_change')
    .eq('id', user.id)
    .maybeSingle();

  // Perfil ilegible (error de red, RLS o timeout) deja `perfil` a null: la
  // sesion existe pero NO se puede verificar. No se redirige en ese estado.
  const perfil = error ? null : profile;

  if (pathname === LOGIN_PATH) {
    // Sesion no verificable o cuenta inactiva: /login es el destino final y
    // estable. Devolver `response` aqui es lo que corta el bucle; el formulario
    // de login volvera a validar las credenciales desde cero.
    if (!perfil || !perfil.is_active) {
      return response;
    }

    if (perfil.force_password_change) {
      return redirectTo(new URL(FORCE_PASSWORD_PATH, request.url));
    }

    return redirectTo(new URL('/', request.url));
  }

  // Perfil no verificado: se deja pasar. Las Server Actions y los guards
  // vuelven a validar y niegan por defecto (fail-closed), sin bucles.
  if (!perfil) {
    return response;
  }

  if (!perfil.is_active) {
    await supabase.auth.signOut();
    const target = new URL(LOGIN_PATH, request.url);
    target.searchParams.set('error', 'inactivo');
    return redirectTo(target);
  }

  // -------------------------------------------------------------------------
  // Filtro de permisos.
  //
  // Son 3 consultas extra POR REQUEST y el middleware corre en todas las
  // peticiones, asi que no se puede subir el numero. Se deja como esta: la
  // autoridad real es `requirePagePermission` / `requirePermission`, que cada
  // pagina y cada Server Action vuelven a ejecutar. Esto solo evita que un
  // usuario sin permisos llegue a un shell vacio.
  //
  // Sin logs: el diagnostico por request se elimino en la Fase 11. Para auditar
  // quien entro y salio esta la bitacora (`audit_logs`), no la consola.
  // -------------------------------------------------------------------------
  const { data: roleLinks } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);

  const roleIds = (roleLinks ?? []).map((link) => link.role_id);

  const { data: rolesData } = roleIds.length
    ? await supabase.from('roles').select('key').in('id', roleIds)
    : { data: [] };

  const roleKeys = (rolesData ?? []).map((row) => row.key);

  const { data: permRows } = roleIds.length
    ? await supabase.from('role_permissions').select('permission_key').in('role_id', roleIds)
    : { data: [] };

  const permisos = [...new Set((permRows ?? []).map((row) => row.permission_key))];

  // `admin` tiene acceso total por diseño (misma excepcion que
  // `has_permission()` en la base y que `contextHasPermission` en los guards).
  // El atajo se replica aqui para no expulsar a un administrador legitimo.
  const esAdmin = roleKeys.includes('admin');

  // -------------------------------------------------------------------------

  if (perfil.force_password_change && pathname !== FORCE_PASSWORD_PATH) {
    return redirectTo(new URL(FORCE_PASSWORD_PATH, request.url));
  }

  // Sin rol, o con rol pero sin un solo permiso, no entra al area de la app:
  // va a /no-autorizado (no a /login, que sugeriria que la sesion fallo).
  if (!EXENTAS_PERMISOS.has(pathname) && !esAdmin && permisos.length === 0) {
    const target = new URL(NO_AUTORIZADO_PATH, request.url);
    target.searchParams.set('motivo', 'sin_permisos');
    return redirectTo(target);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos los assets estaticos de Next, los ficheros publicos y las
     * imagenes.
     *
     * `.*\\.(?:svg|png|...)$` excluye los ficheros con extension para que el
     * middleware no corra en cada foto de Supabase Storage.
     *
     * La excepcion de `/diag` (Fase 11) se elimino junto con sus paginas.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)',
  ],
};