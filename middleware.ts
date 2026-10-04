import { NextResponse, type NextRequest } from 'next/server';

import {
  applySecurityHeaders,
  respuestaConNonce,
  updateSession,
  type MotivoFallo,
} from '@/lib/supabase/middleware';

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
 * Log de diagnostico del Arranque en el Edge Runtime. Se imprime en cada
 * peticion a proposito: es la unica forma de saber, desde los logs de Vercel, si
 * las variables `NEXT_PUBLIC_*` llegaron al bundle del middleware. Next las
 * inlinea en tiempo de BUILD, asi que "estan en el panel de Vercel" no implica
 * "estaban en el bundle que se desplego": si se anaden despues del deploy, o en
 * Preview en vez de Production, aqui saldra FALTA aunque el panel las muestre.
 */
function logVariables(): void {
  console.log(
    '[MW] Variables:',
    process.env.NEXT_PUBLIC_SUPABASE_URL ? 'OK' : 'FALTA',
    '/',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'OK' : 'FALTA',
  );
}

/** Nonce de la CSP. `crypto` y `btoa` existen en Edge, pero no se apuesta la app a ello. */
function generarNonce(): string {
  try {
    return btoa(crypto.randomUUID());
  } catch {
    return btoa(String(Date.now()));
  }
}

/**
 * Respuesta de emergencia: la sesion no se pudo verificar, pero la peticion
 * sigue teniendo que contestarse.
 *
 * - API: `503` con JSON. Nunca un `fetch()` del navegador debe recibir HTML.
 * - `/login`: se deja pasar con la CSP aplicada. Es el destino estable, asi que
 *   redirigirlo crearia el bucle que el comentario de arriba describe.
 * - Cualquier otra pagina: a `/login?error=<motivo>` (fail-closed).
 */
function degradar(
  request: NextRequest,
  pathname: string,
  nonce: string,
  motivo: MotivoFallo | 'fallo',
): NextResponse {
  if (pathname.startsWith('/api/')) {
    const json = NextResponse.json(
      {
        error:
          motivo === 'falta_config'
            ? 'El servidor no tiene configuradas las credenciales de Supabase.'
            : 'No se pudo verificar la sesión. Intenta de nuevo.',
      },
      { status: 503 },
    );
    applySecurityHeaders(json, nonce);
    return json;
  }

  if (pathname === LOGIN_PATH) {
    return respuestaConNonce(request, nonce);
  }

  const target = new URL(LOGIN_PATH, request.url);
  target.searchParams.set('error', motivo);
  const redirect = NextResponse.redirect(target);
  applySecurityHeaders(redirect, nonce);
  return redirect;
}

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
 * pagina (`requirePageContext`) tambien manda a /login cuando no alcanzan un
 * perfil. Si esta capa expulsara al usuario de /login hacia "/", el ciclo
 * middleware -> "/" -> guard -> /login -> middleware no tendria salida.
 *
 * **Nada sale de aqui sin capturar.** El middleware corre en el Edge Runtime de
 * Vercel, donde una excepcion sin capturar no produce una pagina de error sino
 * un `500 MIDDLEWARE_INVOCATION_FAILED` en TODAS las rutas de la aplicacion,
 * con la build en verde: es el fallo mas caro y el mas dificil de ver. Por eso
 * `updateSession` no lanza (ver `lib/supabase/middleware.ts`) y aqui todo el
 * cuerpo va dentro de un `try`. Si algo falla, se degrada a /login fail-closed
 * y el motivo viaja en `?error=` para que se pueda leer en la pantalla y en los
 * logs de Vercel.
 */
export async function middleware(request: NextRequest) {
  logVariables();

  const nonce = generarNonce();
  const { pathname, search } = request.nextUrl;

  try {
    return await manejar(request, pathname, search, nonce);
  } catch (error) {
    // Ultima red de seguridad. Un 500 opaco en todas las rutas no deja ni un
    // rastro de que fallo; esto si, y la app sigue siendo utilizable.
    console.error('[MW] excepcion no controlada en el middleware:', error);
    return degradar(request, pathname, nonce, 'fallo');
  }
}

async function manejar(
  request: NextRequest,
  pathname: string,
  search: string,
  nonce: string,
): Promise<NextResponse> {
  const sesion = await updateSession(request, nonce);

  if (!sesion.ok) {
    // Sin sesion verificable NO se deja pasar a la app (fail-closed), pero se
    // responde de forma utilizable en vez de reventar el Edge Runtime.
    return degradar(request, pathname, nonce, sesion.motivo);
  }

  const { response, supabase, user } = sesion;

  const redirectTo = (destination: URL) => {
    const redirect = NextResponse.redirect(destination);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  };

  if (!user) {
    if (pathname === LOGIN_PATH) {
      return response;
    }

    // Las rutas de API devuelven su propio 401 en vez de redirigir: un
    // `fetch()` desde el navegador no puede seguir una redireccion a /login sin
    // acabarparse el HTML de la pagina de acceso en lugar del JSON (Fase 12B,
    // el visor de fotos). Aqui la sesion ya esta verificada como ausente, asi
    // que responder 401 es lo honesto; la ruta vuelve a comprobarlo con
    // `getUser()` por si el middleware se dejara fuera en algun momento.
    if (pathname.startsWith('/api/')) {
      const json = NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
      applySecurityHeaders(json, nonce);
      return json;
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

  // Una ruta de API no es una pagina: no se redirige, se responde. La sesion
  // existe, pero si el usuario esta inactivo o debe cambiar la clave, la ruta
  // recibe 401 en vez de un HTML de otra pantalla (Fase 12B).
  if (pathname.startsWith('/api/')) {
    if (!perfil || !perfil.is_active || perfil.force_password_change) {
      const json = NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
      applySecurityHeaders(json, nonce);
      return json;
    }
    return response;
  }

  // Perfil no verificado: se deja pasar. Las Server Actions y los guards
  // vuelven a validar y niegan por defecto (fail-closed), sin bucles.
  if (!perfil) {
    return response;
  }

  if (!perfil.is_active) {
    // `signOut()` va por red a Supabase. Si falla, lo que importa es la
    // redireccion: el token ya no vale para nada porque la sesion se marco
    // inactiva, asi que un fallo aqui no puede impedir la salida.
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[MW] no se pudo cerrar la sesion del usuario inactivo:', error);
    }
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