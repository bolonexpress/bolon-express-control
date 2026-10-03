import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import type { ViewRow } from '@/types/database';

// ---------------------------------------------------------------------------
// Inventario calculado (Fase 5)
//
// El stock NUNCA se edita: no hay columna `stock` en `products`. Se lee de la
// vista `v_stock_productos`, que suma `delta_cantidad` / `delta_peso_kg` de los
// movimientos no anulados por producto. La unica via de cambio es registrar un
// movimiento (RPC) o anular uno: ambas son transacciones auditadas.
// ---------------------------------------------------------------------------

export type InventarioRow = Pick<
  ViewRow<'v_stock_productos'>,
  | 'product_id'
  | 'codigo'
  | 'producto'
  | 'sku'
  | 'categoria'
  | 'unidad'
  | 'control_mode'
  | 'stock_minimo'
  | 'cantidad'
  | 'peso_kg'
  | 'stock_principal'
  | 'bajo_minimo'
  | 'ultimo_movimiento_at'
  | 'is_active'
>;

/**
 * Estado del inventario, decidido en la app y no en SQL: el criterio de
 * "critico" (stock <= 0) es presentacion; un cambio de umbral no deberia tocar
 * la base. `bajo` es exactamente el `bajo_minimo` de la vista, para que la
 * alerta de la Fase 7 pueda reutilizar la vista sin divergir.
 */
export type EstadoInventario = 'critico' | 'bajo' | 'ok';

export function estadoInventario(fila: Pick<InventarioRow, 'stock_principal' | 'bajo_minimo'>): EstadoInventario {
  const stock = Number(fila.stock_principal ?? 0);
  if (stock <= 0) return 'critico';
  if (fila.bajo_minimo) return 'bajo';
  return 'ok';
}

export const ESTADO_LABEL: Record<EstadoInventario, string> = {
  critico: 'Crítico',
  bajo: 'Bajo',
  ok: 'OK',
};

/**
 * El `select` es UN literal de cadena a proposito: concatenar partes (incluso
 * con `const`) ensancha el tipo a `string`, el parser de PostgREST deja de
 * reconocer las columnas y el resultado degrada a `GenericStringError`.
 */
const INVENTARIO_SELECT =
  'product_id, codigo, producto, sku, categoria, unidad, control_mode, stock_minimo, cantidad, peso_kg, stock_principal, bajo_minimo, ultimo_movimiento_at, is_active';

/**
 * Inventario del catalogo activo, ordenado por urgencia: critico y bajo
 * primero porque son los que piden una compra o un ajuste; dentro de cada
 * grupo, por nombre. La vista ya es `security_invoker`, asi que el usuario ve
 * solo los productos y movimientos que su rol le permite leer.
 */
export const listInventario = cache(
  async (opciones: { incluirInactivos?: boolean } = {}): Promise<InventarioRow[]> => {
    const supabase = await createClient();

    let consulta = supabase.from('v_stock_productos').select(INVENTARIO_SELECT);
    if (!opciones.incluirInactivos) consulta = consulta.eq('is_active', true);

    const { data, error } = await consulta;
    if (error) throw error;

    const filas = (data ?? []) as InventarioRow[];
    const prioridad: Record<EstadoInventario, number> = { critico: 0, bajo: 1, ok: 2 };

    return filas.sort((a, b) => {
      const pa = prioridad[estadoInventario(a)];
      const pb = prioridad[estadoInventario(b)];
      if (pa !== pb) return pa - pb;
      return (a.producto ?? '').localeCompare(b.producto ?? '', 'es');
    });
  },
);

/** Resumen para el encabezado: cuantos productos necesitan atencion. */
export function resumenInventario(filas: InventarioRow[]): { criticos: number; bajos: number; ok: number } {
  let criticos = 0;
  let bajos = 0;
  let ok = 0;
  for (const fila of filas) {
    const estado = estadoInventario(fila);
    if (estado === 'critico') criticos += 1;
    else if (estado === 'bajo') bajos += 1;
    else ok += 1;
  }
  return { criticos, bajos, ok };
}
