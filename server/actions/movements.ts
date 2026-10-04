'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import { aUnidadBase } from '@/lib/format/units';
import {
  CAMPO_FORMULARIO,
  FOTO_MAX_BYTES,
  anularMovimientoSchema,
  esMimeDeFoto,
  registrarMovimientoSchema,
  validarValoresSegunModo,
} from '@/lib/validation/movements';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import type { AuthContext } from '@/server/auth/guards';
import {
  adjuntarFotoMovimiento,
  anularMovimiento,
  getConfigMovimientos,
  getMovimiento,
  getProductoOperable,
  registrarMovimiento,
} from '@/server/repositories/movements';
import { PERMISOS } from '@/types/domain';
import type { CatalogActionState, UnidadTipo } from '@/types/domain';
import type { EnumValue } from '@/types/database';

/**
 * Server Actions de movimientos. La escritura real SIEMPRE ocurre dentro de la
 * RPC `registrar_movimiento()` / `anular_movimiento()` (Fase 1), que es atomica
 * y bloquea la fila del producto con `SELECT ... FOR UPDATE`. Aqui solo:
 *
 *   1. Guard RBAC (`movements:write` / `movements:anular`) ANTES de FormData.
 *   2. Zod estricto: el MISMO esquema que corre en el formulario.
 *   3. Conversion a la unidad base (el operador razona en kg, lb o unidades).
 *   4. Chequeo previo de stock para dar un mensaje util; la RPC sigue siendo la
 *      autoridad y es la que cierra la condicion de carrera.
 *   5. Foto, si la hay, DESPUES de crear el movimiento (la RLS de storage exige
 *      que exista). Si falla, se reporta; nunca se oculta.
 *
 * No hay `INSERT`/`UPDATE`/`DELETE` sobre `movements`: la tabla es append-only y
 * sus triggers bloquean la mutacion a nivel motor (ADR-003).
 */

const RUTA_LISTA = '/movimientos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Datos minimos que el formulario necesita para pintar el stock disponible. */
export type ProductoParaFormulario = {
  id: string;
  nombre: string;
  codigo: string;
  sku: string;
  unidad: string;
  unidad_tipo: UnidadTipo;
  control_mode: EnumValue<'modo_control'>;
  stock_disponible: number;
  stock_peso_kg: number;
  factor_to_base: number;
  stock_minimo: number;
  decimals: number;
  allow_fractional: boolean;
};

export type StockActionResult = {
  ok: boolean;
  producto: ProductoParaFormulario | null;
};

/**
 * Traduce el rechazo de la policy de Storage a algo accionable.
 *
 * El 403 llega como `new row violates row-level security policy`, que no le dice
 * nada a quien lo lee. En estos dos caminos la causa real casi siempre es la
 * misma, y la policy la ha comprobado ya: el movimiento no existe o esta
 * anulado. Se dice eso en vez de dejar el nombre de una constraint.
 */
function mensajeDeSubida(mensaje: string): string {
  if (/row[- ]level security/i.test(mensaje)) {
    return 'La base rechazó la foto. La causa mas probable es que el movimiento ya no exista o este anulado: recarga la pantalla para confirmarlo.';
  }
  return mensaje;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

/** Como en `texto()`, pero conserva el `File`: no se puede validar como string. */
function archivo(formData: FormData, campo: string): File | string {
  const valor = formData.get(campo);
  return valor instanceof File ? valor : '';
}

/**
 * Issues de Zod -> mapa `campo -> mensaje` que la UI sabe pintar.
 *
 * No se descarta ningun issue: los que no tienen `path` caen en
 * `CAMPO_FORMULARIO` y los `path` anidados se unen con '.', de modo que un
 * `fields` vacio solo es posible si `error.issues` lo esta.
 *
 * **No se registra la validacion fallida** (Fase 11). Un rechazo de Zod es lo
 * que pasa cuando alguien escribe mal un campo, no un incidente: volcar el
 * `issues` entero en consola generaba una linea por cada intento fallido de
 * todos los usuarios, y era el log que mas ruido producia. El mensaje que ve
 * la persona ya es el correcto, campo a campo.
 *
 * Lo que si se registra es el caso anomalo: un `fields` VACIO significa que
 * Zod fallo sin senal campo, algo que ningun formulario espera. Ahi la UI solo
 * puede pintar "no se pudo validar", y sin esta linea nadie sabria por que.
 */
function erroresDeZod(error: z.ZodError, accion: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.length > 0 ? issue.path.map(String).join('.') : CAMPO_FORMULARIO;
    if (!(campo in fields)) fields[campo] = issue.message;
  }

  if (Object.keys(fields).length === 0) {
    console.error('[movimientos] Zod fallo sin ningún campo', { accion, issues: error.issues });
  }

  return fields;
}

/**
 * `fallo()` siempre devuelve `fields` (aunque sea `{}`): asi la UI nunca
 * confunde "no hay errores por campo" con "no se puede saber que fallo".
 */
function fallo(
  codigo: string,
  mensaje: string,
  fields: Record<string, string> = {},
): CatalogActionState {
  return { ok: false, error: { code: codigo, message: mensaje, fields } };
}

/**
 * El guard corre antes de leer FormData. Un fallo de autorizacion se traduce a
 * un mensaje cerrado; cualquier otro error se propaga para que lo registre
 * `error.tsx` en vez de fingir que se guardo.
 */
async function exigir(permission: string): Promise<AuthContext | CatalogActionState | null> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthError) {
      return fallo('sin_permiso', `Necesitas el permiso ${permission} para hacer esto.`);
    }
    throw error;
  }
}

function esFallo(resultado: AuthContext | CatalogActionState | null): resultado is CatalogActionState {
  return resultado !== null && 'ok' in resultado && resultado.ok === false;
}

/**
 * Mensaje REAL de un fallo que NO es de validacion: subida a Storage, bucket
 * inexistente, error de red o excepcion inesperada.
 *
 * Aqui "Revisa los datos marcados" seria una mentira: no hay ningun campo que
 * corregir, y esconder la causa real (por ejemplo, que el bucket
 * `movement-photos` no existe en el proyecto) deja al operador sin forma de
 * avanzar. Se muestra el mensaje tal cual, recortado para que un HTML de error
 * no inunde el banner; el objeto completo queda en el log del servidor.
 */
function mensajeReal(error: unknown): string {
  const crudo =
    (error instanceof Error ? error.message : undefined) ??
    (typeof error === 'string' ? error : undefined) ??
    (error as { message?: unknown } | null)?.message;

  const mensaje = (typeof crudo === 'string' ? crudo : '').trim();
  if (mensaje === '') return 'No se pudo completar la operación. Inténtalo de nuevo.';

  return mensaje.length > 300 ? `${mensaje.slice(0, 300)}…` : mensaje;
}

// ---------------------------------------------------------------------------
// Refresco de stock (feedback inmediato; no sustituye a la validacion)
// ---------------------------------------------------------------------------

/**
 * La llama el formulario al elegir producto para pintar el disponible. Solo
 * informa: la RPC vuelve a comprobar el stock dentro de la transaccion.
 */
export async function consultarStockAction(productId: string): Promise<StockActionResult> {
  const contexto = await exigir(PERMISOS.movementsWrite);
  if (esFallo(contexto) || contexto === null) return { ok: false, producto: null };

  const producto = await getProductoOperable(productId);
  if (!producto) return { ok: false, producto: null };

  return {
    ok: true,
    producto: {
      id: producto.id,
      nombre: producto.name,
      codigo: producto.codigo,
      sku: producto.sku,
      unidad: producto.unidad,
      unidad_tipo: producto.unidad_tipo,
      control_mode: producto.control_mode,
      stock_disponible: producto.stock_disponible,
      stock_peso_kg: producto.stock_peso_kg,
      factor_to_base: producto.factor_to_base,
      stock_minimo: producto.stock_minimo,
      decimals: producto.decimals,
      allow_fractional: producto.allow_fractional,
    },
  };
}

// ---------------------------------------------------------------------------
// Registrar movimiento
// ---------------------------------------------------------------------------

export async function registrarMovimientoAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const contexto = await exigir(PERMISOS.movementsWrite);
  if (contexto === null || esFallo(contexto)) {
    return contexto ?? fallo('sin_permiso', `Necesitas el permiso ${PERMISOS.movementsWrite}.`);
  }

  const parsed = registrarMovimientoSchema.safeParse({
    tipo: texto(formData, 'tipo'),
    producto_id: texto(formData, 'producto_id'),
    cantidad: texto(formData, 'cantidad'),
    peso_kg: texto(formData, 'peso_kg'),
    motivo: texto(formData, 'motivo'),
    notes: texto(formData, 'notes'),
    idempotency_key: texto(formData, 'idempotency_key'),
    // El archivo viaja en el mismo FormData. Se pasa tal cual para que un
    // `foto` roto tambien produzca un error POR CAMPO, no solo el aviso de
    // "foto obligatoria" de mas abajo.
    foto: archivo(formData, 'foto'),
  });

  if (!parsed.success) {
    const fields = erroresDeZod(parsed.error, 'registrarMovimientoAction');
    // Un `fields` vacio ya no significa "no habia issues" (ver `erroresDeZod`):
    // si se llegase aqui, el problema no es de ningun campo y el mensaje
    // generico de validacion seria enganoso.
    return fallo(
      'validacion',
      Object.keys(fields).length > 0
        ? 'Revisa los datos marcados.'
        : 'No se pudo validar el formulario. Inténtalo de nuevo.',
      fields,
    );
  }

  const { tipo, producto_id, cantidad, peso_kg, motivo, notes, idempotency_key } = parsed.data;
  const foto = parsed.data.foto ?? null;

  // A partir de aqui la falla ya no es de validacion (producto, configuracion,
  // RPC, Storage). Se captura para poder devolver el mensaje real en el banner
  // en vez de dejar que `error.tsx` lo sustituya por una pantalla de error.
  let registro: { codigo: string; aviso: string | null } | null = null;

  try {
    // --- Producto: existe, esta activo y aporta el factor de conversion -----
    const producto = await getProductoOperable(producto_id);
    if (!producto) {
      return fallo('producto', 'El producto ya no existe o está desactivado.', {
        producto_id: 'Selecciona otro producto.',
      });
    }

    // --- Reglas segun el modo de control (mismo codigo que corre el cliente) --
    const erroresModo = validarValoresSegunModo({ cantidad, peso_kg }, producto.control_mode);
    if (Object.keys(erroresModo).length > 0) {
      return fallo('modo_control', 'Revisa el valor según el modo de control del producto.', erroresModo);
    }

    const config = await getConfigMovimientos();

    // --- Conversion a la unidad base: el stock se acumula ahi (ADR-011) -------
    const cantidadBase =
      cantidad === undefined ? null : aUnidadBase(cantidad, producto.factor_to_base);

    // --- Chequeo previo de stock: mensaje util antes de viajar a la BD ------
    // Solo se comprueban dimensiones inequivocas: la cantidad siempre esta en la
    // unidad del producto, y el peso solo cuando el modo ES peso (en `ambos` la
    // vista de stock alterna entre peso y cantidad, asi que decides la RPC).
    if (tipo === 'salida' && !config.permiteStockNegativo) {
      const faltaCantidad = cantidad !== undefined && cantidad > producto.stock_disponible;
      const faltaPeso =
        peso_kg !== undefined &&
        producto.control_mode === 'peso' &&
        peso_kg > producto.stock_peso_kg;

      if (faltaCantidad || faltaPeso) {
        const disponible = producto.control_mode === 'peso' ? producto.stock_peso_kg : producto.stock_disponible;
        const unidadDisponible = producto.control_mode === 'peso' ? 'kg' : producto.unidad;
        return fallo(
          'stock_insuficiente',
          `Inventario insuficiente. Disponible: ${disponible} ${unidadDisponible}`,
          { [faltaPeso ? 'peso_kg' : 'cantidad']: 'Inventario insuficiente.' },
        );
      }
    }

    // --- Foto: el mime y el tamano se comprueban con la configuracion real --
    if (config.exigeFoto && !foto) {
      return fallo('foto', 'La foto es obligatoria para registrar el movimiento.', {
        foto: 'Adjunta una foto.',
      });
    }

    if (foto) {
      if (!esMimeDeFoto(foto.type)) {
        return fallo('foto', 'La foto debe ser una imagen (JPEG, PNG, WebP o HEIC).', {
          foto: 'Formato no admitido.',
        });
      }
      const limite = Math.min(config.fotosMaxBytes, FOTO_MAX_BYTES);
      if (foto.size > limite) {
        return fallo('foto', 'La foto supera el tamaño máximo permitido.', {
          foto: `Foto demasiado grande (máximo ${Math.round(limite / (1024 * 1024))} MB).`,
        });
      }
    }

    // --- Escritura transaccional --------------------------------------------
    const resultado = await registrarMovimiento({
      productId: producto_id,
      tipo,
      idempotencyKey: idempotency_key,
      cantidadBase,
      pesoKg: peso_kg ?? null,
      motivo,
      // Trazabilidad: lo que escribio el operador, antes de convertir.
      cantidadOriginal: cantidad ?? null,
      unidadOriginalId: cantidad === undefined ? null : producto.unit_id,
      notes: notes ?? null,
    });

    if (!resultado.ok) return fallo('base_datos', resultado.message);

    // --- Foto (despues del movimiento: la RLS de storage lo exige) -----------
    let aviso: string | null = null;
    if (foto) {
      const adjunta = await adjuntarFotoMovimiento(
        resultado.data.id,
        idempotency_key,
        foto,
        contexto.user.id,
      );
      if (!adjunta.ok) {
        console.error('[movimientos] movimiento registrado sin foto', {
          movimiento: resultado.data.codigo,
          motivo: adjunta.message,
        });
        aviso = `Movimiento ${resultado.data.codigo} registrado, pero la foto no se pudo adjuntar: ${mensajeDeSubida(adjunta.message)}. Puedes readjuntarla desde el detalle del movimiento.`;
      }
    }

    registro = { codigo: resultado.data.codigo, aviso };
  } catch (error) {
    console.error('[movimientos] fallo inesperado al registrar el movimiento', error);
    // Sin `fields`: no hay ningun campo que corregir, el mensaje real va entero
    // en el banner (un `_form` aqui lo duplicaria).
    return fallo('inesperado', mensajeReal(error));
  }

  // Inalcanzable: el `try` siempre asigna `registro` o devuelve un `fallo`.
  if (!registro) return fallo('inesperado', 'No se pudo completar el registro del movimiento.');

  revalidatePath(RUTA_LISTA);
  revalidatePath('/productos');

  const parametros = new URLSearchParams({ mensaje: `Movimiento ${registro.codigo} registrado.` });
  if (registro.aviso) parametros.set('aviso', registro.aviso);

  redirect(`${RUTA_LISTA}?${parametros.toString()}`);
}

// ---------------------------------------------------------------------------
// Readjuntar foto a un movimiento ya registrado
// ---------------------------------------------------------------------------

/**
 * Sube una foto a un movimiento EXISTENTE.
 *
 * Es el camino de recuperacion de `registrarMovimientoAction`: si la subida
 * falla, el movimiento queda registrado (es append-only, no se toca) pero sin
 * la foto que el negocio declara obligatoria. Sin esto habia que registrar un
 * movimiento nuevo y anular el anterior solo para cumplir la regla de la foto
 * (ADR-019).
 *
 * El movimiento se comprueba aqui para dar un mensaje util, pero la autoridad
 * sigue siendo la policy de `storage.objects`: si el movimiento esta anulado o
 * ya no existe, el `INSERT` se rechaza igual (por eso el mensaje del 403 se
 * traduce en vez de tragarselo).
 *
 * La comprobacion previa lee `v_movimientos`, asi que necesita `movements:read`.
 * El seed da `photos:write` y `movements:read` al mismo tiempo, asi que hoy
 * siempre puede leer; si alguien configurara un rol con solo `photos:write`,
 * el mensaje seria "El movimiento ya no existe" cuando en realidad es que no
 * puede leerlo. Se acepta: la policy seguiria rechazando igual y el boton ya
 * esta condicionado a los mismos permisos que ella.
 *
 * La subida usa el cliente de sesion de `createClient()`, nunca `service_role`.
 */
export async function adjuntarFotoMovimientoAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const contexto = await exigir(PERMISOS.photosWrite);
  if (contexto === null || esFallo(contexto)) {
    return contexto ?? fallo('sin_permiso', `Necesitas el permiso ${PERMISOS.photosWrite}.`);
  }

  const movementId = texto(formData, 'movementId');
  const foto = archivo(formData, 'foto');

  if (!UUID_RE.test(movementId)) {
    return fallo('validacion', 'Movimiento no válido.', { movementId: 'Movimiento no válido.' });
  }

  if (!(foto instanceof File) || foto.size === 0) {
    return fallo('foto', 'Elige la foto que quieres adjuntar.', {
      foto: 'No se recibió el archivo. Vuelve a elegirlo.',
    });
  }

  if (!esMimeDeFoto(foto.type)) {
    return fallo('foto', 'La foto debe ser una imagen (JPEG, PNG, WebP o HEIC).', {
      foto: 'Formato no admitido.',
    });
  }

  try {
    const config = await getConfigMovimientos();
    const limite = Math.min(config.fotosMaxBytes, FOTO_MAX_BYTES);
    if (foto.size > limite) {
      return fallo('foto', 'La foto supera el tamaño máximo permitido.', {
        foto: `Foto demasiado grande (máximo ${Math.round(limite / (1024 * 1024))} MB).`,
      });
    }

    const movimiento = await getMovimiento(movementId);
    if (!movimiento) {
      return fallo('movimiento', 'El movimiento ya no existe.');
    }
    if (movimiento.anulacion_id) {
      return fallo('movimiento', 'El movimiento está anulado: no admite fotos nuevas.');
    }

    // El nombre del objeto es una clave nueva cada intento. No se reutiliza la
    // del formulario porque aqui no hay doble toque que proteger: pulsar dos
    // veces "Adjuntar foto" tiene que crear dos fotos, no pelearse por la misma.
    const adjunta = await adjuntarFotoMovimiento(
      movementId,
      randomUUID(),
      foto,
      contexto.user.id,
    );

    if (!adjunta.ok) {
      console.error('[movimientos] no se pudo readjuntar la foto', {
        movimiento: movimiento.codigo,
        motivo: adjunta.message,
      });
      return fallo('foto', mensajeDeSubida(adjunta.message));
    }

    revalidatePath(`/movimientos/${movementId}`);
    revalidatePath(RUTA_LISTA);
    revalidatePath('/historial');

    return {
      ok: true,
      data: { id: movementId, mensaje: `Foto adjuntada a ${movimiento.codigo}.` },
    };
  } catch (error) {
    console.error('[movimientos] fallo inesperado al readjuntar la foto', error);
    return fallo('inesperado', mensajeReal(error));
  }
}

// ---------------------------------------------------------------------------
// Anular movimiento
// ---------------------------------------------------------------------------

export async function anularMovimientoAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const contexto = await exigir(PERMISOS.movementsAnular);
  if (contexto === null || esFallo(contexto)) {
    return contexto ?? fallo('sin_permiso', `Necesitas el permiso ${PERMISOS.movementsAnular}.`);
  }

  const parsed = anularMovimientoSchema.safeParse({
    movementId: texto(formData, 'movementId'),
    motivo: texto(formData, 'motivo'),
    detalle: texto(formData, 'detalle'),
  });

  if (!parsed.success) {
    return fallo(
      'validacion',
      'Revisa los datos marcados.',
      erroresDeZod(parsed.error, 'anularMovimientoAction'),
    );
  }

  const resultado = await anularMovimiento({
    movementId: parsed.data.movementId,
    motivo: parsed.data.motivo,
    detalle: parsed.data.detalle ?? null,
  });

  if (!resultado.ok) return fallo('base_datos', resultado.message);

  revalidatePath(RUTA_LISTA);
  revalidatePath(`/movimientos/${parsed.data.movementId}`);
  revalidatePath('/productos');

  return { ok: true, data: { id: parsed.data.movementId, mensaje: 'Movimiento anulado.' } };
}
