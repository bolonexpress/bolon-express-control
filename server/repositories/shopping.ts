import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import type { EnumValue, TableInsert, TableUpdate } from '@/types/database';
import type { CompraItem, CompraHistorialItem, ProductoCompraOption } from '@/types/domain';

// ---------------------------------------------------------------------------
// Lista de compras (Fase 6)
//
// La tabla NUNCA se borra (RLS solo concede insert/update; el estado terminal
// `descartado` es el borrado logico). El historial lo escribe el trigger
// `trg_shopping_history` de la Fase 1: aqui solo insertamos/actualizamos.
// ---------------------------------------------------------------------------

/* Columnas SIEMPRE como literal unico: concatenar ensancha el tipo a `string`
 * y PostgREST deja de reconocer las columnas (ver note en movements.ts). */
const LISTA_SELECT =
  'id, codigo, product_id, producto_codigo, producto, control_mode, sku, descripcion, unit_id, unidad, cantidad_sugerida, cantidad_comprada, precio_unitario, proveedor, prioridad, estado, notas, auto_generated, completed_at, completed_by, created_by, created_at, updated_at, stock_principal, bajo_minimo';

const DETALLE_SELECT = LISTA_SELECT;

const HISTORIAL_SELECT =
  'id, tipo_registro, estado_anterior, estado_nuevo, changed_by, created_at, snapshot, changed_by_perfil:profiles!shopping_list_history_changed_by_fkey(full_name)';

const PRODUCTO_SELECT = 'id, name, codigo, unit_id, unidad:units!products_unit_id_fkey(code)';

type ProductoFila = {
  id: string;
  name: string;
  codigo: string | null;
  unit_id: string | null;
  unidad: { code: string } | null;
};

function nombreDe(fila: unknown): string | null {
  if (
    fila &&
    typeof fila === 'object' &&
    'full_name' in fila &&
    typeof (fila as { full_name?: unknown }).full_name === 'string'
  ) {
    return (fila as { full_name: string }).full_name;
  }
  return null;
}

/** Lista viva: pendientes y en proceso primero, por prioridad y antiguedad. */
export const listCompras = cache(async (): Promise<CompraItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_shopping_list')
    .select(LISTA_SELECT)
    .order('estado', { ascending: true })
    .order('prioridad', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CompraItem[];
});

export const getCompra = cache(async (id: string): Promise<CompraItem | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_shopping_list')
    .select(DETALLE_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as CompraItem | null) ?? null;
});

/** Quien creo/cambio y cuando. El trigger ya escribio las filas. */
export async function listHistorialCompra(id: string): Promise<CompraHistorialItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_list_history')
    .select(HISTORIAL_SELECT)
    .eq('shopping_list_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((fila) => {
    const f = fila as Record<string, unknown>;
    return {
      id: f.id as number,
      tipo_registro: f.tipo_registro as EnumValue<'compras_historial_tipo'>,
      estado_anterior: (f.estado_anterior as EnumValue<'compras_estado'> | null) ?? null,
      estado_nuevo: (f.estado_nuevo as EnumValue<'compras_estado'> | null) ?? null,
      changed_by: f.changed_by as string,
      changed_by_nombre: nombreDe(f.changed_by_perfil),
      created_at: f.created_at as string,
    };
  });
}

/** Productos activos para el selector del formulario rapido. */
export const listProductosParaCompra = cache(async (): Promise<ProductoCompraOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCTO_SELECT)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((fila) => {
    const f = fila as unknown as ProductoFila;
    return {
      id: f.id,
      nombre: f.name,
      codigo: f.codigo,
      unidad: f.unidad?.code ?? null,
      unit_id: f.unit_id,
    };
  });
});

export async function insertCompra(
  datos: Omit<TableInsert<'shopping_list'>, 'created_by'>,
  userId: string,
): Promise<{ ok: true; id: string; codigo: string | null } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_list')
    .insert({ ...datos, created_by: userId })
    .select('id, codigo')
    .single();

  if (error) {
    console.error('[shopping:insertCompra]', { code: error.code, message: error.message });
    return { ok: false, message: 'No se pudo registrar el pendiente. Intenta de nuevo.' };
  }
  return { ok: true, id: data.id, codigo: data.codigo };
}

/**
 * Cambio de estado. La accion valida la transicion antes; el trigger
 * `trg_shopping_transicion` la vuelve a validar en SQL. `completed_at/by` van
 * y vienen con `comprado` porque la tabla lo exige con `shopping_completado_consistente`.
 */
export async function updateEstadoCompra(
  id: string,
  estado: EnumValue<'compras_estado'>,
  extras: Pick<TableUpdate<'shopping_list'>, 'cantidad_comprada' | 'precio_unitario'>,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();

  const campos: TableUpdate<'shopping_list'> = {
    estado,
    // `updated_at` lo toca el trigger trg_shopping_list_updated_at (Fase 1).
    completed_at: estado === 'comprado' ? new Date().toISOString() : null,
    completed_by: estado === 'comprado' ? userId : null,
    ...(estado === 'comprado' ? extras : {}),
  };

  const { error } = await supabase.from('shopping_list').update(campos).eq('id', id);

  if (error) {
    if (error.code === '23514') {
      return { ok: false, message: 'Ese cambio de estado no está permitido.' };
    }
    console.error('[shopping:updateEstadoCompra]', { code: error.code, message: error.message });
    return { ok: false, message: 'No se pudo cambiar el estado. Intenta de nuevo.' };
  }
  return { ok: true };
}

/** Lee el estado actual para validar la transicion ANTES de actualizar. */
export async function getEstadoCompra(id: string): Promise<EnumValue<'compras_estado'> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('shopping_list').select('estado').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.estado as EnumValue<'compras_estado'>) ?? null;
}
