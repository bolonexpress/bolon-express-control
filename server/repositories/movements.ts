import 'server-only';

import { cache } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { objectPathDeFoto, pathDeFoto } from '@/lib/storage/foto-paths';
import { esMimeDeFoto, EXTENSION_POR_MIME } from '@/lib/validation/movements';
import { CONFIG_KEYS, PHOTO_BUCKET } from '@/types/domain';
import type { EnumValue } from '@/types/database';

/**
 * Acceso a movimientos. Las escrituras NO pasan por aqui como INSERT: la unica
 * via es la RPC `registrar_movimiento()` (Fase 1), que valida permiso,
 * idempotencia, modo de control y stock >= 0 dentro de la misma transaccion y
 * con `SELECT ... FOR UPDATE` sobre el producto. Este modulo se limita a
 * traducir sus argumentos y sus errores.
 */

export type MovimientoRow = {
  id: string;
  codigo: string;
  tipo: EnumValue<'movimiento_tipo'>;
  motivo: EnumValue<'movimiento_motivo'>;
  notes: string | null;
  created_at: string;
  product_id: string;
  producto_codigo: string;
  producto: string;
  sku: string;
  control_mode: EnumValue<'modo_control'>;
  cantidad: number | null;
  peso_kg: number | null;
  delta_cantidad: number | null;
  delta_peso_kg: number | null;
  cantidad_original: number | null;
  unidad_original: string | null;
  registrado_por: string | null;
  anulacion_id: string | null;
  anulacion_motivo: EnumValue<'anulacion_motivo'> | null;
  anulacion_detalle: string | null;
  anulado_at: string | null;
  fotos_count: number;
};

/** Producto operable en un movimiento: unidad, modo de control y stock actual. */
export type ProductoOperable = {
  id: string;
  codigo: string;
  sku: string;
  name: string;
  control_mode: EnumValue<'modo_control'>;
  unit_id: string;
  unidad: string;
  unidad_tipo: EnumValue<'unidad_tipo'>;
  factor_to_base: number;
  decimals: number;
  allow_fractional: boolean;
  /** Stock en la unidad BASE del producto (u / kg / l). */
  stock_cantidad: number;
  stock_peso_kg: number;
  /** Stock en la unidad del producto, que es como lo ve el usuario. */
  stock_disponible: number;
  stock_minimo: number;
};

export type ConfigMovimientos = {
  exigeFoto: boolean;
  exigeMotivo: boolean;
  permiteStockNegativo: boolean;
  fotosMaxBytes: number;
};

type Resultado<T> = { ok: true; data: T } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Errores de la RPC -> mensajes cerrados
// ---------------------------------------------------------------------------

/**
 * La RPC lanza excepciones con codigos cerrados como `message`. Se traducen
 * aqui; lo inesperado se registra y se devuelve un mensaje generico, para no
 * filtrar estructura de la base al cliente.
 */
const ERRORES_RPC: Record<string, string> = {
  STOCK_INSUFICIENTE: 'Inventario insuficiente.',
  CANTIDAD_REQUERIDA: 'Este producto se controla por cantidad: indica cuántas piezas.',
  PESO_REQUERIDO_EN_KG: 'Este producto se controla por peso: indica los kilogramos.',
  CANTIDAD_NO_PUEDE_SER_CERO: 'La cantidad no puede ser 0.',
  PESO_NO_PUEDE_SER_CERO: 'El peso no puede ser 0.',
  CANTIDAD_NEGATIVA_SOLO_EN_AJUSTE:
    'En una entrada o salida la cantidad no puede ser negativa: usa un ajuste.',
  PESO_NEGATIVO_SOLO_EN_AJUSTE: 'En una entrada o salida el peso no puede ser negativo: usa un ajuste.',
  PRODUCTO_INACTIVO: 'El producto está desactivado.',
  PRODUCTO_NO_EXISTE: 'El producto ya no existe.',
  MOTIVO_REQUERIDO: 'Selecciona un motivo.',
  IDEMPOTENCY_KEY_REQUERIDA: 'Falta la clave de idempotencia. Recarga la pantalla e inténtalo de nuevo.',
  MOVIMIENTO_NO_EXISTE: 'El movimiento ya no existe.',
  STOCK_NEGATIVO_AL_ANULAR: 'Anular este movimiento dejaría el stock en negativo.',
  DETALLE_REQUERIDO: 'Añade el detalle de la anulación.',
};

function mensajeRpc(error: PostgrestError, contexto: string): string {
  const codigo = (error.message ?? '').split(':')[0]?.trim() ?? '';

  if (codigo === 'PERMISO_DENEGADO' || codigo === 'USUARIO_INACTIVO_O_SIN_SESION') {
    return 'Tu rol no permite esta operación.';
  }

  const conocido = ERRORES_RPC[codigo];
  if (conocido) return conocido;

  console.error(`[movimientos:${contexto}] error no controlado`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  return 'No se pudo completar la operación. Intenta de nuevo.';
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

export const getConfigMovimientos = cache(async (): Promise<ConfigMovimientos> => {
  const supabase = await createClient();
  const claves = [
    CONFIG_KEYS.requireMovementPhoto,
    CONFIG_KEYS.requireMovementReason,
    CONFIG_KEYS.allowNegativeStock,
    CONFIG_KEYS.photosMaxSizeBytes,
  ] as const;

  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', claves);

  if (error) throw error;

  const valor = (clave: string, porDefecto: boolean | number): boolean | number => {
    const fila = (data ?? []).find((f) => f.key === clave);
    if (fila?.value === undefined || fila?.value === null) return porDefecto;
    return fila.value as boolean | number;
  };

  const maxFoto = valor(CONFIG_KEYS.photosMaxSizeBytes, 15 * 1024 * 1024);

  return {
    // Fase 4: la foto es obligatoria por defecto (migracion 09). Si la clave no
    // esta sembrada se mantiene la exigencia: es el requisito del negocio.
    exigeFoto: valor(CONFIG_KEYS.requireMovementPhoto, true) === true,
    exigeMotivo: valor(CONFIG_KEYS.requireMovementReason, true) === true,
    permiteStockNegativo: valor(CONFIG_KEYS.allowNegativeStock, false) === true,
    fotosMaxBytes: typeof maxFoto === 'number' ? maxFoto : 15 * 1024 * 1024,
  };
});

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const PRODUCTOS_SELECT =
  'id, codigo, sku, name, control_mode, unit_id, stock_minimo';

const UNIDADES_SELECT = 'id, name, code, unit_type, factor_to_base, decimals, allow_fractional';

const redondear3 = (valor: number) => Math.round(valor * 1000) / 1000;

/**
 * Productos activos con su stock, para el selector del formulario.
 *
 * Tres consultas en paralelo y union en memoria (mismo patron que
 * `server/repositories/catalog.ts`): las vistas no soportan joins embebidos en
 * PostgREST, y asi el selector no depende de un unico round-trip ni de que el
 * cache de esquema de PostgREST resuelva relaciones anidadas.
 */
export const listProductosOperables = cache(async (): Promise<ProductoOperable[]> => {
  const supabase = await createClient();

  const [productos, unidades, stock] = await Promise.all([
    supabase.from('products').select(PRODUCTOS_SELECT).eq('is_active', true),
    supabase.from('units').select(UNIDADES_SELECT),
    supabase.from('v_stock_productos').select('product_id, cantidad, peso_kg'),
  ]);

  if (productos.error) throw productos.error;
  if (unidades.error) throw unidades.error;
  if (stock.error) throw stock.error;

  const unidadPorId = new Map((unidades.data ?? []).map((u) => [u.id, u]));
  const stockPorId = new Map((stock.data ?? []).map((s) => [s.product_id, s]));

  const items: ProductoOperable[] = (productos.data ?? []).map((p) => {
    const unidad = unidadPorId.get(p.unit_id);
    const factor = Number(unidad?.factor_to_base ?? 1);
    const disponibleBase = Number(stockPorId.get(p.id)?.cantidad ?? 0);
    const pesoBase = Number(stockPorId.get(p.id)?.peso_kg ?? 0);

    // El stock vive en unidades base; el usuario razona en la unidad del
    // producto, asi que se muestra convertido (misma regla que ADR-011).
    const base = p.control_mode === 'peso' ? pesoBase || disponibleBase : disponibleBase;

    return {
      id: p.id,
      codigo: p.codigo,
      sku: p.sku,
      name: p.name,
      control_mode: p.control_mode,
      unit_id: p.unit_id,
      unidad: unidad?.code ?? '—',
      unidad_tipo: unidad?.unit_type ?? 'unidad',
      factor_to_base: factor,
      decimals: Number(unidad?.decimals ?? 0),
      allow_fractional: Boolean(unidad?.allow_fractional),
      stock_cantidad: disponibleBase,
      stock_peso_kg: pesoBase,
      stock_disponible: factor === 0 ? 0 : redondear3(base / factor),
      stock_minimo: Number(p.stock_minimo ?? 0),
    };
  });

  return items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
});

/**
 * Un solo producto con su stock. Lo usa la accion que refresca el disponible
 * mientras el operador elige: al vivir en `cache()` de React, se resuelve una
 * vez por peticion, nunca una vez por pulsacion.
 */
export const getProductoOperable = cache(
  async (productId: string): Promise<ProductoOperable | null> => {
    const productos = await listProductosOperables();
    return productos.find((p) => p.id === productId) ?? null;
  },
);

/**
 * El `select` tiene que ser UN literal de cadena. Concatenarlo con `+` (aunque
 * sea en un `const`) ensancha el tipo a `string`, el parser de PostgREST no
 * reconoce las columnas y el resultado degrada a `GenericStringError`. Por eso
 * la linea es larga a proposito.
 */
const MOVIMIENTOS_SELECT =
  'id, codigo, tipo, motivo, notes, created_at, product_id, producto_codigo, producto, sku, control_mode, cantidad, peso_kg, delta_cantidad, delta_peso_kg, cantidad_original, unidad_original, registrado_por, anulacion_id, anulacion_motivo, anulacion_detalle, anulado_at, fotos_count';

export const listMovimientos = cache(
  async (
    filtros: { tipo?: EnumValue<'movimiento_tipo'>; limite?: number } = {},
  ): Promise<MovimientoRow[]> => {
    const supabase = await createClient();

    let consulta = supabase.from('v_movimientos').select(MOVIMIENTOS_SELECT);

    if (filtros.tipo) consulta = consulta.eq('tipo', filtros.tipo);
    const { data, error } = await consulta
      .order('created_at', { ascending: false })
      .limit(filtros.limite ?? 100);

    if (error) throw error;
    return data ?? [];
  },
);

export const getMovimiento = cache(async (id: string): Promise<MovimientoRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_movimientos')
    .select(MOVIMIENTOS_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
});

// ---------------------------------------------------------------------------
// Escritura (solo por RPC)
// ---------------------------------------------------------------------------

export type RegistrarMovimientoArgs = {
  productId: string;
  tipo: EnumValue<'movimiento_tipo'>;
  idempotencyKey: string;
  cantidadBase: number | null;
  pesoKg: number | null;
  motivo: EnumValue<'movimiento_motivo'>;
  cantidadOriginal: number | null;
  unidadOriginalId: string | null;
  notes: string | null;
};

export async function registrarMovimiento(
  args: RegistrarMovimientoArgs,
): Promise<Resultado<{ id: string; codigo: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('registrar_movimiento', {
    p_product_id: args.productId,
    p_tipo: args.tipo,
    p_idempotency_key: args.idempotencyKey,
    p_cantidad: args.cantidadBase,
    p_peso_kg: args.pesoKg,
    p_motivo: args.motivo,
    p_notes: args.notes,
    p_cantidad_original: args.cantidadOriginal,
    p_unidad_original_id: args.unidadOriginalId,
  });

  if (error) return { ok: false, message: mensajeRpc(error, 'registrarMovimiento') };

  // `returns public.movements` (no setof): PostgREST entrega un objeto. Se
  // acepta tambien un array por si la generacion de tipos declarase setof.
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { id: string; codigo: string }
    | null
    | undefined;

  if (!fila?.id) {
    console.error('[movimientos:registrarMovimiento] la RPC no devolvio el movimiento', {
      data,
    });
    return { ok: false, message: 'El movimiento se registró pero no se pudo leer. Revisa el listado.' };
  }

  return { ok: true, data: { id: fila.id, codigo: fila.codigo } };
}

export async function anularMovimiento(args: {
  movementId: string;
  motivo: EnumValue<'anulacion_motivo'>;
  detalle: string | null;
}): Promise<Resultado<{ id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('anular_movimiento', {
    p_movement_id: args.movementId,
    p_motivo: args.motivo,
    p_detalle: args.detalle,
  });

  if (error) return { ok: false, message: mensajeRpc(error, 'anularMovimiento') };

  const fila = (Array.isArray(data) ? data[0] : data) as { id: string } | null | undefined;
  if (!fila?.id) {
    console.error('[movimientos:anularMovimiento] la RPC no devolvio la anulacion', { data });
    return { ok: false, message: 'La anulación se registró pero no se pudo leer. Revisa el listado.' };
  }

  return { ok: true, data: { id: fila.id } };
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

export type ResultadoFoto = { ok: true } | { ok: false; message: string };

/**
 * Sube la foto al bucket privado y registra la fila en `public.photos`.
 *
 * **Dos rutas y son distintas** (ver `lib/storage/foto-paths.ts` y ADR-019):
 * el objeto se sube como `<movement_id>/<clave>.<ext>` — relativo al bucket, que
 * es lo que leen las policies de `storage.objects` — y en `public.photos.path`
 * se guarda `movement-photos/<movement_id>/<clave>.<ext>`, con el prefijo que
 * exige el CHECK `photos_path_movimiento`. Antes las dos llevaban el bucket y la
 * policy rechazaba la subida con 403 ("new row violates row-level security
 * policy"), dejando el movimiento registrado sin foto.
 *
 * El nombre del archivo es la clave de idempotencia del formulario: un doble
 * toque apunta al MISMO objeto en lugar de adjuntar dos fotos.
 *
 * La subida va SIEMPRE con el cliente de sesion (`createClient()`), nunca con
 * `service_role`: la policy es `to authenticated`, la service_role se salta la
 * RLS y ademas el objeto quedaria sin dueno (ver ADR-019 §3).
 *
 * NO se usa `upsert`: el bucket no tiene policy de UPDATE para `authenticated`
 * (una foto no se renombra ni se reescribe), asi que un reintento fallaria por
 * permisos, no por contenido. En su lugar, "ya existe" se interpreta como
 * exito: el objeto esta ahi con el mismo contenido y la segunda inserta choca
 * con el indice unico de `photos.path`. Asi el par (subida + fila) es
 * idempotente sin abrir permisos de mas.
 *
 * Solo se puede subir despues de crear el movimiento: la policy de storage
 * exige que el movimiento exista y no este anulado. Por eso un fallo real aqui
 * deja el movimiento registrado sin foto, y la accion lo reporta explicitamente
 * en lugar de ocultarlo. Esa foto se puede readjuntar despues desde el detalle
 * (`adjuntarFotoMovimientoAction`).
 */
export async function adjuntarFotoMovimiento(
  movimientoId: string,
  idempotencyKey: string,
  archivo: File,
  userId: string,
): Promise<ResultadoFoto> {
  const supabase = await createClient();

  const mime = archivo.type;
  if (!esMimeDeFoto(mime)) {
    return { ok: false, message: 'La foto debe ser una imagen (JPEG, PNG, WebP o HEIC).' };
  }

  const nombre = `${idempotencyKey}.${EXTENSION_POR_MIME[mime]}`;
  const objectPath = objectPathDeFoto(movimientoId, nombre);
  const path = pathDeFoto(movimientoId, nombre);

  const { error: errorSubida } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, archivo, { contentType: mime, upsert: false });

  const objetoYaExistia =
    errorSubida !== null &&
    (String(errorSubida.statusCode) === '409' || /already exists|duplicate/i.test(errorSubida.message));

  if (errorSubida && !objetoYaExistia) {
    console.error('[movimientos:adjuntarFotoMovimiento] fallo la subida', {
      objectPath,
      bucket: PHOTO_BUCKET,
      statusCode: errorSubida.statusCode,
      message: errorSubida.message,
    });

    // El mensaje REAL se propaga a la accion: "Bucket not found" (la
    // migracion 05 no se aplico en el proyecto) o un limite del bucket son
    // causas accionables, y un "no se pudo subir" generico las esconde.
    const causa = errorSubida.message.trim();
    const mensaje = /bucket not found/i.test(causa)
      ? `El bucket de fotos (${PHOTO_BUCKET}) no existe en el proyecto. Avisa a quien administra la base de datos. Detalle: ${causa}`
      : `No se pudo subir la foto al almacenamiento: ${causa}`;

    return { ok: false, message: mensaje };
  }

  const { error: errorFila } = await supabase.from('photos').insert({
    movement_id: movimientoId,
    path,
    mime_type: mime,
    size_bytes: archivo.size,
    created_by: userId,
  });

  if (!errorFila) return { ok: true };

  // Ya habia una fila con ese path: el reintento del mismo movimiento.
  if (errorFila.code === '23505') return { ok: true };

  console.error('[movimientos:adjuntarFotoMovimiento] fallo el registro de la foto', {
    path,
    code: errorFila.code,
    message: errorFila.message,
  });
  return {
    ok: false,
    message: `La foto se subió pero no se pudo registrar en el movimiento: ${errorFila.message}`,
  };
}
