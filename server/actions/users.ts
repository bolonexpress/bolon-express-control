'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientAvailable } from '@/lib/supabase/admin';
import {
  ROLES_KEY,
  crearUsuarioSchema,
  editarUsuarioSchema,
  usuariosFiltrosSchema,
  ROL_LABEL,
  type EstadoFiltro,
  type RolKey,
} from '@/lib/validation/users';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import {
  contarAdminsActivos,
  esAdmin,
  listUsuariosPagina,
  rolesDeUsuario,
} from '@/server/repositories/users';
import { logAudit } from '@/server/lib/audit';
import { PERMISOS } from '@/types/domain';
import type { UsuarioRow, UsuariosActionState } from '@/types/domain';

/**
 * Server Actions de administracion de usuarios (Fase 10).
 *
 * Orden fijo, el mismo que en el catalogo:
 *   1. Guard RBAC (`users:manage`) ANTES de leer FormData.
 *   2. Zod estricto: forma, rangos y charset.
 *   3. Cerrojos anti-encierro (`contarAdminsActivos`).
 *   4. Escritura, y `revalidatePath` de lo que cambia.
 *
 * AUDITORIA (ADR-015). `profiles` y `user_roles` ya los audita el trigger
 * `fn_audit` de la migracion 02, asi que aqui NO se llama a `logAudit` para
 * ellos: seria una segunda fila por la misma operacion y destruiria la
 * propiedad "una fila por operacion" de la bitacora. `logAudit` queda para lo
 * que la base no puede ver, que es `auth.users`.
 *
 * POR QUE NO HAY REDIRECT TRAS EL ALTA. Podriamos mandar al listado con
 * `?mensaje=...` como en el catalogo, pero la contrasena temporal no puede ir
 * en la URL: un query param queda en el historial del navegador, en los logs del
 * servidor y en la cabecera `Referer`. Por eso el alta NO redirige; devuelve la
 * clave en el estado de la accion y la UI la muestra una vez en un panel, que
 * se cierra al navegar. El aviso de exito del resto de acciones si lleva la
 * palabra "Guardado correctamente" de la Fase 9.
 */

const RUTA_LISTADO = '/admin/usuarios';

/** Filtros que viaja el listado al pedir la pagina siguiente. */
export type FiltrosUsuarios = {
  busqueda: string | null;
  rol: RolKey | null;
  estado: EstadoFiltro;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `UsuariosActionState` con el `null` de "sin respuesta todavia" quitado.
 *
 * El `null` solo tiene sentido como estado inicial de `useActionState`. Los
 * helpers de abajo SIEMPRE devuelven un resultado, asi que se tipan con esto y
 * quien los llama no tiene que estrechar contra `null` para leer `.error`.
 */
type ResultadoUsuarios = NonNullable<UsuariosActionState>;

/** Zod -> `{ campo: primer mensaje }`, igual que hace el catalogo. */
function falloValidacion(errores: z.ZodError): ResultadoUsuarios {
  const fields: Record<string, string> = {};
  for (const issue of errores.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !(campo in fields)) fields[campo] = issue.message;
  }
  return { ok: false, error: { code: 'validacion', message: 'Revisa los datos marcados.', fields } };
}

function falloRegla(message: string, code = 'regla_negocio'): ResultadoUsuarios {
  return { ok: false, error: { code, message } };
}

/**
 * El guard se ejecuta antes de tocar FormData. Un fallo de autorizacion se
 * traduce a un mensaje cerrado; cualquier otro error se propaga para que lo
 * registre `error.tsx` en vez de fingir que se guardo.
 */
async function exigirUsersManage(): Promise<ResultadoUsuarios | null> {
  try {
    await requirePermission(PERMISOS.usersManage);
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error: {
          code: 'sin_permiso',
          message: `Necesitas el permiso ${PERMISOS.usersManage} para hacer este cambio.`,
        },
      } satisfies UsuariosActionState;
    }
    throw error;
  }
}

/**
 * Contrasena temporal de 16 caracteres que cumple las reglas de
 * `changePasswordSchema` (12 o mas, minuscula, mayuscula y numero).
 *
 * Se genera en el servidor y se devuelve UNA vez, para que el admin la entregue
 * en mano. Al primer ingreso el usuario esta obligado a cambiarla
 * (`force_password_change`). Se evita el alfabeto ambiguo (l, 1, 0, O) porque
 * acabara dictandose por telefono.
 */
function generarContrasenaTemporal(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const minus = 'abcdefghijkmnopqrstuvwxyz';
  const digitos = '23456789';
  const todas = mayus + minus + digitos;

  // `charAt` y no `conjunto[n]`: con `noUncheckedIndexedAccess` el indexado
  // devuelve `string | undefined` y habria que estrechar el tipo en cada letra.
  // El `?? 0` es por el mismo motivo: TS no sabe que un indice de un
  // `Uint8Array` de tamano 16 nunca esta fuera de rango.
  const letra = (conjunto: string, byte: number | undefined) =>
    conjunto.charAt((byte ?? 0) % conjunto.length);

  const buffer = crypto.getRandomValues(new Uint8Array(16));

  // Una de cada clase primero: si se eligiera al azar de entre todas, saldría
  // sin mayuscula o sin numero con probabilidad real.
  let clave = letra(mayus, buffer[0]);
  clave += letra(minus, buffer[1]);
  clave += letra(digitos, buffer[2]);
  for (let i = 3; i < 16; i += 1) {
    clave += letra(todas, buffer[i]);
  }
  return clave;
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** `key` de rol -> `roles.id`, o `null` si el rol no esta en la tabla. */
async function idDeRol(supabase: Cliente, key: RolKey): Promise<string | null> {
  const { data, error } = await supabase.from('roles').select('id').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Listado: "Cargar mas" (keyset)
// ---------------------------------------------------------------------------

/**
 * Pagina siguiente del listado. Los filtros llegan como objeto y no como
 * FormData porque el formulario de filtros ya esta en la URL: es el mismo
 * camino que `consultarAuditoriaAction`.
 *
 * Devuelve `Resultado<...>` SIN `null` (a diferencia de `UsuariosActionState`,
 * que es el estado inicial de un formulario): esta accion no se enlaza a un
 * formulario, asi que no tiene estado previo que representar.
 */
export async function consultarUsuariosAction(
  filtros: FiltrosUsuarios,
  cursor: string,
): Promise<ResultadoUsuarios> {
  const denegado = await exigirUsersManage();
  if (denegado) return denegado;

  const parsed = usuariosFiltrosSchema.safeParse({ ...filtros, cursor });
  if (!parsed.success) return falloValidacion(parsed.error);

  try {
    const pagina = await listUsuariosPagina(parsed.data);
    return {
      ok: true,
      data: { mensaje: '', filas: pagina.filas, nextCursor: pagina.nextCursor },
    };
  } catch (error) {
    console.error('[usuarios] no se pudo leer la pagina siguiente', error);
    return falloRegla('No se pudieron cargar más usuarios.');
  }
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

/**
 * Crea el usuario en Supabase Auth con el correo ya confirmado y una contrasena
 * temporal.
 *
 * El trigger `fn_handle_new_user` (migracion 02) crea el perfil con el nombre y
 * el telefono que llegan en `user_metadata`, y asigna el rol `operador` por
 * defecto. Este codigo sustituye ese rol por el que eligio el admin, dejando el
 * usuario con exactamente uno.
 */
export async function crearUsuarioAction(
  _estadoAnterior: UsuariosActionState,
  formData: FormData,
): Promise<UsuariosActionState> {
  const denegado = await exigirUsersManage();
  if (denegado) return denegado;

  const parsed = crearUsuarioSchema.safeParse({
    full_name: texto(formData, 'full_name'),
    email: texto(formData, 'email'),
    phone: texto(formData, 'phone'),
    rol: texto(formData, 'rol'),
  });

  if (!parsed.success) return falloValidacion(parsed.error);

  const datos = parsed.data;

  if (!isAdminClientAvailable()) {
    console.error('[usuarios] no hay service_role para crear el usuario');
    return falloRegla(
      'Este entorno no puede crear usuarios: falta SUPABASE_SERVICE_ROLE_KEY.',
      'sin_servicio',
    );
  }

  const claveTemporal = generarContrasenaTemporal();
  const admin = createAdminClient();

  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.email,
    password: claveTemporal,
    email_confirm: true,
    user_metadata: { full_name: datos.full_name, phone: datos.phone },
  });

  if (errorAuth || !creado?.user) {
    const yaExiste = /already|registered|existe/i.test(errorAuth?.message ?? '');
    if (!yaExiste) {
      console.error('[usuarios] no se pudo crear el usuario', { motivo: errorAuth?.message });
    }
    return {
      ok: false,
      error: {
        code: 'base_datos',
        message: yaExiste
          ? 'Ya hay alguien con ese correo. Búscalo en el listado antes de crear otro.'
          : 'No se pudo crear el usuario. Inténtalo de nuevo.',
        fields: { email: 'No se pudo usar ese correo.' },
      },
    };
  }

  const supabase = await createClient();
  const userId = creado.user.id;

  const rolElegidoId = await idDeRol(supabase, datos.rol);
  const rolOperadorId =
    datos.rol === 'operador' ? rolElegidoId : await idDeRol(supabase, 'operador');

  if (!rolElegidoId || !rolOperadorId) {
    // La cuenta ya existe en Auth y el perfil ya esta creado: avisar en claro es
    // mejor que dejar a alguien dentro sin permiso y sin que nadie lo note.
    console.error('[usuarios] el rol no esta en la tabla roles', {
      usuario: datos.email,
      rol: datos.rol,
    });
    return falloRegla(
      'El usuario se creó pero no se pudo asignarle el rol. Revisa la tabla de roles.',
      'rol_sin_asignar',
    );
  }

  const { data: sesion } = await supabase.auth.getUser();
  const adminId = sesion?.user?.id ?? null;

  if (rolElegidoId !== rolOperadorId) {
    const { error: errorPoner } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role_id: rolElegidoId, granted_by: adminId });

    if (errorPoner) {
      console.error('[usuarios] no se pudo asignar el rol inicial', { motivo: errorPoner.message });
    } else {
      // El trigger puso `operador` por defecto; se quita para que el rol
      // elegido sea el unico. Si el borrado falla, el usuario tendria los dos.
      const { error: errorQuitar } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', rolOperadorId);

      if (errorQuitar) {
        console.error('[usuarios] no se pudo quitar el rol por defecto', {
          motivo: errorQuitar.message,
        });
      }
    }
  }

  revalidatePath(RUTA_LISTADO, 'layout');

  // El perfil y el rol ya quedaron en la bitacora por el trigger. Aqui solo se
  // registra el evento que la base no ve: que se creo una cuenta de Auth. La
  // contrasena jamas entra ni aqui ni en la consola.
  await logAudit({
    accion: 'crear',
    entidad: 'usuarios',
    entidadId: userId,
    entidadCodigo: datos.email,
    datos: { rol: datos.rol, via: 'administracion' },
  });

  return {
    ok: true,
    data: {
      mensaje: 'Usuario creado. Anota la contraseña y entrégasela en mano.',
      claveTemporal,
      email: datos.email,
    },
  };
}

// ---------------------------------------------------------------------------
// Edicion de datos de contacto
// ---------------------------------------------------------------------------

export async function editarUsuarioAction(
  _estadoAnterior: UsuariosActionState,
  formData: FormData,
): Promise<UsuariosActionState> {
  const denegado = await exigirUsersManage();
  if (denegado) return denegado;

  const parsed = editarUsuarioSchema.safeParse({
    userId: texto(formData, 'userId'),
    full_name: texto(formData, 'full_name'),
    phone: texto(formData, 'phone'),
  });

  if (!parsed.success) return falloValidacion(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq('id', parsed.data.userId);

  if (error) {
    console.error('[usuarios] no se pudo editar el perfil', { motivo: error.message });
    return falloRegla('No se pudo guardar el cambio.');
  }

  revalidatePath(`${RUTA_LISTADO}/${parsed.data.userId}`);
  revalidatePath(RUTA_LISTADO);
  return { ok: true, data: { mensaje: 'Guardado correctamente. Los datos quedaron actualizados.' } };
}

// ---------------------------------------------------------------------------
// Rol
// ---------------------------------------------------------------------------

/**
 * Deja al usuario con EXACTAMENTE el rol elegido: quita los que tuviera y
 * asigna el nuevo con `granted_by` (quien lo concedio) y `granted_at`.
 *
 * Cerrojos:
 *   1. Nadie se quita a si mismo el rol `admin` (se quedaria fuera de su propia
 *      pantalla de administracion).
 *   2. Si a un admin se le quita el rol, tiene que quedar otro admin ACTIVO.
 *
 * Sin las dos reglas, el ultimo administrador puede dejar la tienda sin nadie
 * que administre — y como `admin` tiene acceso total, nadie podria arreglarlo
 * desde la app.
 */
export async function cambiarRolAction(
  _estadoAnterior: UsuariosActionState,
  formData: FormData,
): Promise<UsuariosActionState> {
  const { user: sesion } = await requirePermission(PERMISOS.usersManage);

  const userId = texto(formData, 'userId');
  const rolKey = texto(formData, 'rol') as RolKey;

  if (!UUID_RE.test(userId)) {
    return { ok: false, error: { code: 'validacion', message: 'Usuario no válido.' } };
  }
  if (!ROLES_KEY.includes(rolKey)) return falloRegla('Elige un rol.');

  const supabase = await createClient();
  const yaEraAdmin = await esAdmin(userId);

  // Cerrojo 1.
  if (yaEraAdmin && rolKey !== 'admin' && userId === sesion.id) {
    return falloRegla('No puedes quitarte tu propio rol de administrador.');
  }

  // Cerrojo 2.
  if (yaEraAdmin && rolKey !== 'admin') {
    const quedan = await contarAdminsActivos(userId);
    if (quedan === 0) {
      return falloRegla(
        'Debe quedar al menos un administrador activo. Crea o reactiva otro antes de quitar este rol.',
      );
    }
  }

  const actuales = await rolesDeUsuario(userId);
  if (actuales.some((rol) => rol.key === rolKey)) {
    return {
      ok: true,
      data: { mensaje: `No cambió nada: ya era ${ROL_LABEL[rolKey].toLowerCase()}.` },
    };
  }

  const rolId = await idDeRol(supabase, rolKey);
  if (!rolId) return falloRegla('El rol no existe en el sistema.');

  if (actuales.length > 0) {
    const { error: errorQuitar } = await supabase.from('user_roles').delete().eq('user_id', userId);
    if (errorQuitar) {
      console.error('[usuarios] no se pudo quitar el rol anterior', { motivo: errorQuitar.message });
      return falloRegla('No se pudo cambiar el rol.');
    }
  }

  const { error: errorPoner } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role_id: rolId, granted_by: sesion.id });

  if (errorPoner) {
    console.error('[usuarios] no se pudo asignar el rol nuevo', { motivo: errorPoner.message });
    return falloRegla('No se pudo cambiar el rol.');
  }

  revalidatePath(`${RUTA_LISTADO}/${userId}`);
  revalidatePath(RUTA_LISTADO);
  return { ok: true, data: { mensaje: 'Guardado correctamente. El rol quedó actualizado.' } };
}

// ---------------------------------------------------------------------------
// Activar / desactivar
// ---------------------------------------------------------------------------

/**
 * Activa o desactiva una cuenta. El usuario NUNCA se borra: el historial
 * depende de `profiles.id` con `ON DELETE RESTRICT`.
 *
 * Cerrojos:
 *   1. Nadie se desactiva a si mismo (se quedaria fuera sin querer).
 *   2. Desactivar a un admin no puede dejar la tienda sin admins activos.
 */
export async function setUserActiveAction(
  _estadoAnterior: UsuariosActionState,
  formData: FormData,
): Promise<UsuariosActionState> {
  const { user: sesion } = await requirePermission(PERMISOS.usersManage);

  const userId = texto(formData, 'userId');
  const isActive = texto(formData, 'isActive') === 'true';

  if (!UUID_RE.test(userId)) {
    return { ok: false, error: { code: 'validacion', message: 'Usuario no válido.' } };
  }

  // Cerrojo 1.
  if (!isActive && userId === sesion.id) {
    return falloRegla('No puedes desactivar tu propia cuenta.');
  }

  const supabase = await createClient();

  // Cerrojo 2.
  if (!isActive && (await esAdmin(userId))) {
    const quedan = await contarAdminsActivos(userId);
    if (quedan === 0) {
      return falloRegla(
        'Debe quedar al menos un administrador activo. Reactiva a otro antes de desactivar a este.',
      );
    }
  }

  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);

  if (error) {
    console.error('[usuarios] no se pudo cambiar is_active', { motivo: error.message });
    return falloRegla('No se pudo actualizar el usuario.');
  }

  revalidatePath(`${RUTA_LISTADO}/${userId}`);
  revalidatePath(RUTA_LISTADO);

  return {
    ok: true,
    data: {
      mensaje: isActive
        ? 'Guardado correctamente. Quedó activo y ya puede entrar.'
        : 'Guardado correctamente. Quedó desactivado y no podrá entrar.',
    },
  };
}

// ---------------------------------------------------------------------------
// Reset de contrasena
// ---------------------------------------------------------------------------

/**
 * Genera una contrasena temporal nueva y obliga a cambiarla al primer ingreso
 * (`force_password_change = true`).
 *
 * Es lo unico de la fase que escribe en `auth.users` sin que un trigger lo vea,
 * asi que aqui SI se llama a `logAudit`: sin esta fila, un reset de contrasena
 * no dejaria rastro en la bitacora. La contrasena no entra ni en la bitacora ni
 * en la consola, solo en la respuesta de la accion.
 */
export async function resetPasswordAction(
  _estadoAnterior: UsuariosActionState,
  formData: FormData,
): Promise<UsuariosActionState> {
  const { user: sesion } = await requirePermission(PERMISOS.usersManage);

  const userId = texto(formData, 'userId');
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: { code: 'validacion', message: 'Usuario no válido.' } };
  }

  if (!isAdminClientAvailable()) {
    return falloRegla(
      'Este entorno no puede resetear contraseñas: falta SUPABASE_SERVICE_ROLE_KEY.',
      'sin_servicio',
    );
  }

  const supabase = await createClient();
  const { data: perfil, error: errorPerfil } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  if (errorPerfil || !perfil) return falloRegla('El usuario no existe.');

  const claveTemporal = generarContrasenaTemporal();
  const admin = createAdminClient();

  const { error: errorAuth } = await admin.auth.admin.updateUserById(userId, {
    password: claveTemporal,
  });

  if (errorAuth) {
    console.error('[usuarios] no se pudo resetear la contrasena', { motivo: errorAuth.message });
    return falloRegla('No se pudo cambiar la contraseña. Inténtalo de nuevo.');
  }

  // Entra con la clave temporal y `/cambiar-password` lo obliga a definir la suya.
  const { error: errorFuerza } = await supabase
    .from('profiles')
    .update({ force_password_change: true })
    .eq('id', userId);

  if (errorFuerza) {
    console.error('[usuarios] no se pudo forzar el cambio de contrasena', {
      motivo: errorFuerza.message,
    });
  }

  await logAudit({
    accion: 'cambio_password',
    entidad: 'auth',
    entidadId: userId,
    datos: { usuario: perfil.full_name, por: 'administrador', hecho_por: sesion.id },
  });

  revalidatePath(`${RUTA_LISTADO}/${userId}`);

  return {
    ok: true,
    data: {
      mensaje: 'Contraseña cambiada. Entrégasela a la persona: solo se muestra ahora.',
      claveTemporal,
    },
  };
}

export type { UsuarioRow };