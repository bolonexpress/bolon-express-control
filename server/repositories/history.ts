import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/types/domain';
import type { HistorialFiltrosParsed } from '@/lib/validation/history';
import type { HistorialOpciones, HistorialPagina } from '@/types/domain';
import type { MovimientoRow } from '@/types/domain';

// ---------------------------------------------------------------------------
// Historial de movimientos (Fase 7)
//
// Lee `v_movimientos` (Fase 1) con cursor keyset sobre `created_at desc,
// id desc`: nada de `offset` (que leeria todas las paginas anteriores en la
// base) ni de "cargar todo". El orden esta cubierto por
// `movements_created_idx`; los filtros por producto/usuario/anulados tienen
// indice de la migracion 01 / 10 (ver nota en la migracion 12).
// ---------------------------------------------------------------------------

/** Tamanio de pagina del historial. 25 cabe en la pantalla de un telefono. */
export const HISTORIAL_PAGE_SIZE = 25;

/* El select es UN literal a proposito: concatenar ensancha el tipo a `string`
 * y PostgREST deja de reconocer las columnas (ver note en movements.ts). */
const HISTORIAL_SELECT =
  'id, codigo, tipo, motivo, notes, created_at, product_id, producto_codigo, producto, sku, control_mode, cantidad, peso_kg, delta_cantidad, delta_peso_kg, cantidad_original, unidad_original, registrado_por, anulacion_id, anulacion_motivo, anulacion_detalle, anulado_at, fotos_count';

/** Ecuador no cambia de huso: fijo -05:00 para que el rango AAAA-MM-DD sea local. */
const ZONA = '-05:00';

function inicioDelDia(fecha: string): string {
  return `${fecha}T00:00:00${ZONA}`;
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Lee una pagina del historial. Devuelve LIMITE+1 filas internamente para
 * decidir si hay mas sin un segundo query (`count` en PostgREST cuesta).
 */
export async function listHistorial(filtros: HistorialFiltrosParsed): Promise<HistorialPagina> {
  const supabase = await createClient();

  let consulta = supabase
    .from('v_movimientos')
    .select(HISTORIAL_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(HISTORIAL_PAGE_SIZE + 1);

  if (filtros.tipo) consulta = consulta.eq('tipo', filtros.tipo);
  if (filtros.productoId) consulta = consulta.eq('product_id', filtros.productoId);
  if (filtros.usuarioId) consulta = consulta.eq('created_by', filtros.usuarioId);
  if (filtros.desde) consulta = consulta.gte('created_at', inicioDelDia(filtros.desde));
  if (filtros.hasta) consulta = consulta.lt('created_at', inicioDelDia(diaSiguiente(filtros.hasta)));

  if (filtros.cursor) {
    // Keyset: (created_at, id) estrictamente DESPUES de lo ya mostrado.
    // El esquema Zod ya valido la forma; los valores no llevan comillas ni
    // caracteres que rompan la sintaxis `or(...)` de PostgREST.
    const sep = filtros.cursor.lastIndexOf('|');
    const creado = filtros.cursor.slice(0, sep);
    const id = filtros.cursor.slice(sep + 1);
    consulta = consulta.or(`created_at.lt.${creado},and(created_at.eq.${creado},id.lt.${id})`);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  const filas = (data ?? []) as MovimientoRow[];
  const hayMas = filas.length > HISTORIAL_PAGE_SIZE;
  const pagina = hayMas ? filas.slice(0, HISTORIAL_PAGE_SIZE) : filas;

  const ultima = pagina[pagina.length - 1];
  const nextCursor = hayMas && ultima ? `${ultima.created_at}|${ultima.id}` : null;

  return { filas: pagina, nextCursor };
}

/** Opciones para los selectores de filtro. Solo activos, ordenados por nombre. */
export const listOpcionesHistorial = cache(async (): Promise<HistorialOpciones> => {
  const supabase = await createClient();

  const [productos, usuarios] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, codigo')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
  ]);

  if (productos.error) throw productos.error;
  if (usuarios.error) throw usuarios.error;

  return {
    productos: (productos.data ?? []).map((p) => ({ id: p.id, nombre: p.name, codigo: p.codigo })),
    usuarios: (usuarios.data ?? []).map((u) => ({ id: u.id, nombre: u.full_name })),
  };
});

// ---------------------------------------------------------------------------
// Foto del detalle: URL firmada de corta vida
// ---------------------------------------------------------------------------

export type FotoDetalle = { id: string; url: string; mime: string } | { id: string; url: null; mime: string };

/**
 * URLs firmadas de corta vida (2 minutos) para las fotos del movimiento. El
 * bucket es privado: si el usuario no tiene `photos:read` la policy de storage
 * falla y devolvemos la fila SIN url (la UI pinta el placeholder).
 *
 * Solo lo usa la pagina de detalle: el listado jamas firma fotos (Fase 7:
 * "no cargar fotos completas en el listado, solo el conteo").
 */
export async function listFotosDelMovimiento(movimientoId: string): Promise<FotoDetalle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('photos')
    .select('id, path, mime_type')
    .eq('movement_id', movimientoId);

  if (error) {
    // Sin permiso de lectura la RLS devuelve filas vacias; un error aqui es
    // otra cosa y se reporta (la UI mostrara el placeholder).
    console.error('[history:listFotosDelMovimiento]', { code: error.code, message: error.message });
    return [];
  }

  const fotos = await Promise.all(
    (data ?? []).map(async (foto): Promise<FotoDetalle> => {
      const { data: firmada, error: errorFirma } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(foto.path, 120);

      if (errorFirma || !firmada?.signedUrl) {
        return { id: foto.id, url: null, mime: foto.mime_type };
      }
      return { id: foto.id, url: firmada.signedUrl, mime: foto.mime_type };
    }),
  );

  return fotos;
}
