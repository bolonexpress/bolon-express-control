import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { createAdminClient, isAdminClientAvailable } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * DIAGNOSTICO DE SESION — TEMPORAL, SOLO DESARROLLO.
 *
 * ⚠️ BORRAR ESTE ARCHIVO EN LA FASE 11. No debe llegar a produccion.
 *
 * Esta ruta queda FUERA del middleware (ver `config.matcher` en middleware.ts)
 * a proposito: si el middleware la protegiera, un problema de sesion la
 * redirigiria a /login y no podriamos diagnosticar nada.
 *
 * La unica proteccion es la comprobacion de NODE_ENV de este archivo, que
 * ademas hace que Next.js pueda eliminar la rama en el build de produccion
 * (process.env.NODE_ENV es una constante inlineada).
 *
 * Solo lectura. No muta nada. Sin estilos, a proposito: el texto plano es lo
 * que hay que poder copiar a un ticket.
 */

/** Nunca se pre-renderiza ni se cachea: depende de las cookies de la request. */
export const dynamic = 'force-dynamic';

/** Error de PostgREST/Auth normalizado: lo que hay que pegar en el ticket. */
function detalleError(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;

  const err = error as {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
    status?: number;
  };

  return {
    message: err.message ?? null,
    code: err.code ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
    status: err.status ?? null,
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

export default async function DiagPage() {
  // Barrera de produccion. En un build de produccion esta rama se elimina.
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  let salida = `DIAGNOSTICO DE SESION — NODE_ENV=${process.env.NODE_ENV}`;
  salida += `\nTemporal, solo desarrollo. SIN proteccion de middleware. BORRAR EN FASE 11.`;

  // -------------------------------------------------------------------------
  // 1. Cookies de la request: SOLO NOMBRES, nunca valores.
  // -------------------------------------------------------------------------
  const cookieStore = await cookies();
  const nombres = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .sort();

  salida += bloque(
    '1. COOKIES PRESENTES (solo nombres, sin valores)',
    nombres.length > 0 ? nombres.map((n) => ` - ${n}`).join('\n') : '(ninguna)',
  );

  const haAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const haUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const tieneAdmin = isAdminClientAvailable();

  salida += bloque(
    '0. ENTORNO',
    [
      `NEXT_PUBLIC_SUPABASE_URL ........ ${haUrl ? 'presente' : 'AUSENTE'}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY .. ${haAnon ? 'presente' : 'AUSENTE'}`,
      `SUPABASE_SERVICE_ROLE_KEY ...... ${tieneAdmin ? 'presente' : 'AUSENTE (la seccion 4 no podra ejecutarse)'}`,
    ].join('\n'),
  );

  if (!haUrl || !haAnon) {
    salida += bloque(
      'DIAGNOSTICO IMPOSIBLE',
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local. Corrige eso primero.',
    );
    return <pre>{salida}</pre>;
  }

  let uid: string | null = null;
  let hayFilaAdmin = false;
  let veredicto = '';

  try {
    // -----------------------------------------------------------------------
    // 2. getSession() con el cliente de servidor (lee la cookie, NO valida).
    // -----------------------------------------------------------------------
    const supabase = await createClient();

    const { data: datosSesion, error: errorSesion } = await supabase.auth.getSession();
    const sesion = datosSesion?.session ?? null;
    uid = sesion?.user?.id ?? null;

    salida += bloque(
      '2. supabase.auth.getSession() — cliente de servidor (anon + sesion)',
      [
        `hay_sesion ....... ${sesion ? 'SI' : 'NO'}`,
        `uid .............. ${uid ?? '(null)'}`,
        `email ............ ${sesion?.user?.email ?? '(null)'}`,
        `expires_at ....... ${sesion?.expires_at ?? '(null)'}`,
        `token (claims) ... ${sesion?.access_token ? 'presente (NO validado contra el servidor de Auth)' : 'ausente'}`,
        `error ............ ${pretty(detalleError(errorSesion))}`,
      ].join('\n'),
    );

    // getUser() valida el JWT contra el servidor de Auth. La diferencia entre
    // ambos es el discriminador clave: si getSession dice SI y getUser dice NO,
    // la cookie esta corrupta/caducada (no es un problema de RLS).
    const { data: datosUsuario, error: errorUsuario } = await supabase.auth.getUser();

    salida += bloque(
      '2b. supabase.auth.getUser() — MISMO cliente (valida el JWT en el servidor)',
      [
        `hay_usuario ...... ${datosUsuario?.user ? 'SI' : 'NO'}`,
        `uid .............. ${datosUsuario?.user?.id ?? '(null)'}`,
        `email ............ ${datosUsuario?.user?.email ?? '(null)'}`,
        `error ............ ${pretty(detalleError(errorUsuario))}`,
        '',
        sesion && !datosUsuario?.user
          ? '>> DIAGNOSTICO: getSession dice SI pero getUser dice NO. La cookie esta caducada o manipulada. NO es un problema de RLS; el token no vale.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    // -----------------------------------------------------------------------
    // 3. Lectura de profiles con el cliente de sesion (sujeta a RLS).
    //    `select('*')` es una desviacion consciente del criterio del proyecto:
    //    aqui se quiere la fila COMPLETA paradiagnosticar.
    // -----------------------------------------------------------------------
    if (!uid) {
      salida += bloque(
        '3. profiles con cliente de SESION',
        'omitida: no hay uid (no hay sesion).',
      );
    } else {
      const { data: filaSesion, error: errorFilaSesion } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      const okSesion = !errorFilaSesion && filaSesion !== null;

      salida += bloque(
        '3. profiles — cliente de SESION (sometido a RLS)',
        [
          `ok ............... ${okSesion ? 'SI' : 'NO'}`,
          `fila ............. ${filaSesion ? 'ENCONTRADA' : 'sin fila'}`,
          `error ............ ${pretty(detalleError(errorFilaSesion))}`,
          '',
          filaSesion
            ? pretty(filaSesion)
            : 'Sin fila. Si el error es 42501 (permission denied) es RLS; si es PGRST116 no habria nada que ver aqui.',
        ].join('\n'),
      );

      // ---------------------------------------------------------------------
      // 4. La MISMA lectura con service_role (bypasea RLS) para comparar.
      // ---------------------------------------------------------------------
      if (!tieneAdmin) {
        salida += bloque(
          '4. profiles — cliente ADMIN (service_role)',
          'omitida: SUPABASE_SERVICE_ROLE_KEY no esta en .env.local. Anadela para poder comparar.',
        );
      } else {
        const admin = createAdminClient();
        const { data: filaAdmin, error: errorFilaAdmin } = await admin
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        hayFilaAdmin = !errorFilaAdmin && filaAdmin !== null;

        salida += bloque(
          '4. profiles — cliente ADMIN (service_role, ignora RLS)',
          [
            `ok ............... ${!errorFilaAdmin ? 'SI' : 'NO'}`,
            `fila ............. ${hayFilaAdmin ? 'ENCONTRADA' : 'sin fila'}`,
            `error ............ ${pretty(detalleError(errorFilaAdmin))}`,
            '',
            hayFilaAdmin ? pretty(filaAdmin) : 'service_role tampoco ve la fila: el problema NO es la policy.',
          ].join('\n'),
        );
      }

      // ---------------------------------------------------------------------
      // 5. Veredicto.
      // ---------------------------------------------------------------------
      if (okSesion) {
        veredicto = 'OK. La sesion lee su perfil sin problemas. El bloqueo, si lo hay, esta en otro sitio (permisos, force_password_change o server action).';
      } else if (hayFilaAdmin) {
        veredicto =
          '>> DIAGNOSTICO: LA POLITICA DE SELECT. service_role VE la fila y el usuario autenticado NO. La tabla y los datos estan bien; falta un SELECT en la policy de profiles para authenticated (migracion 04). Revisar tambien que el usuario tenga rol y is_active, porque las policies usan is_active_user().';
      } else if (errorFilaSesion) {
        veredicto = `>> DIAGNOSTICO: fallo de PostgREST/RLS (${errorFilaSesion.code ?? 'sin codigo'}). El texto exacto esta en la seccion 3.`;
      } else {
        veredicto =
          '>> DIAGNOSTICO: no hay fila en profiles para este uid. El usuario existe en Auth pero sin perfil — revisar el trigger de creacion de profile o el seed:admin.';
      }
    }

    if (!uid) {
      veredicto =
        '>> DIAGNOSTICO: no hay sesion. El bloqueo ocurre ANTES de la app (credenciales, cookies sin enviar o .env.local). Revisa la seccion 1: si no hay cookie sb-*, el navegador no la esta enviando.';
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

  // Sin estilos, a proposito.
  return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{salida}</pre>;
}
