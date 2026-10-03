import 'server-only';

import { cache } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import type {
  CategoryInput,
  ProductInput,
  ToggleActiveInput,
  UnitInput,
} from '@/lib/validation/catalog';
import type { Enums } from '@/types/database';
import type { CategoryRow, ProductRow, UnitRow } from '@/types/domain';

// ---------------------------------------------------------------------------
// Tipos de lectura (DTO con joins resueltos: nada de SQL en componentes)
// ---------------------------------------------------------------------------

export type ProductListItem = {
  id: string;
  display_id: number;
  codigo: string;
  sku: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category_id: string | null;
  categoria: string | null;
  unit_id: string;
  unidad: string;
  unidad_tipo: Enums['unidad_tipo'];
  control_mode: Enums['modo_control'];
  stock_minimo: number;
  is_active: boolean;
  stock_actual: number | null;
  bajo_minimo: boolean;
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryListItem = {
  id: string;
  code: string | null;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  productos_activos: number;
};

export type UnitListItem = {
  id: string;
  code: string;
  name: string;
  unit_type: Enums['unidad_tipo'];
  factor_to_base: number;
  base_unit: boolean;
  allow_fractional: boolean;
  decimals: number;
  is_active: boolean;
  productos_activos: number;
};

export type SelectOption = { value: string; label: string };

/** Datos minimos que la UI y las reglas necesitan de la unidad de un producto. */
export type UnidadParaConversion = {
  id: string;
  code: string;
  name: string;
  unit_type: Enums['unidad_tipo'];
  factor_to_base: number;
  is_active: boolean;
};

/**
 * Los `select` son explicitos (nunca `*`), asi que lo que devuelve PostgREST es
 * un `Pick` de la fila completa: se anotan con estos alias, no con la fila entera.
 */
type ProductListRow = Pick<
  ProductRow,
  | 'id'
  | 'display_id'
  | 'codigo'
  | 'sku'
  | 'name'
  | 'brand'
  | 'barcode'
  | 'category_id'
  | 'unit_id'
  | 'control_mode'
  | 'stock_minimo'
  | 'is_active'
>;

type CategoryListRow = Pick<
  CategoryRow,
  'id' | 'code' | 'name' | 'parent_id' | 'sort_order' | 'is_active'
>;

type UnitListRow = Pick<
  UnitRow,
  | 'id'
  | 'code'
  | 'name'
  | 'unit_type'
  | 'factor_to_base'
  | 'base_unit'
  | 'allow_fractional'
  | 'decimals'
  | 'is_active'
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ordenarPorNombre = <T extends { name: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => a.name.localeCompare(b.name, 'es'));

/** Traduce errores de DB a mensajes cerrados; solo loguea lo inesperado. */
function mensajeErrorDb(
  error: PostgrestError | null,
  duplicado: string,
  contexto: string,
): string | null {
  if (!error) return null;
  if (error.code === '23505') return `Ya existe ${duplicado}. Usa otro.`;
  if (error.code === '23503')
    return 'La categoría o unidad seleccionada ya no existe.';
  console.error(`[catalogo:${contexto}] error de base de datos`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  return 'No se pudo guardar el cambio. Intenta de nuevo.';
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export type ListProductsOpciones = { incluirInactivos?: boolean };

export const listProducts = cache(
  async (opciones: ListProductsOpciones = {}): Promise<ProductListItem[]> => {
    const supabase = await createClient();

    const consulta = supabase.from('products').select(
      'id, display_id, codigo, sku, name, brand, barcode, category_id, unit_id, control_mode, stock_minimo, is_active',
    );

    const [productos, categorias, unidades, stock] = await Promise.all([
      opciones.incluirInactivos ? consulta : consulta.eq('is_active', true),
      supabase.from('categories').select('id, name'),
      supabase.from('units').select('id, code, name, unit_type'),
      supabase
        .from('v_stock_productos')
        .select('product_id, stock_principal, bajo_minimo'),
    ]);

    if (productos.error) throw productos.error;
    if (categorias.error) throw categorias.error;
    if (unidades.error) throw unidades.error;
    if (stock.error) throw stock.error;

    const categoriaPorId = new Map((categorias.data ?? []).map((c) => [c.id, c.name]));
    const unidadPorId = new Map((unidades.data ?? []).map((u) => [u.id, u]));
    const stockPorId = new Map((stock.data ?? []).map((s) => [s.product_id, s]));

    const items: ProductListItem[] = (productos.data ?? []).map((p: ProductListRow) => {
      const unidad = unidadPorId.get(p.unit_id);
      const mov = stockPorId.get(p.id);
      return {
        id: p.id,
        display_id: p.display_id,
        codigo: p.codigo,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        barcode: p.barcode,
        category_id: p.category_id,
        categoria: p.category_id ? (categoriaPorId.get(p.category_id) ?? null) : null,
        unit_id: p.unit_id,
        unidad: unidad?.name ?? '—',
        unidad_tipo: unidad?.unit_type ?? 'unidad',
        control_mode: p.control_mode,
        stock_minimo: Number(p.stock_minimo),
        is_active: p.is_active,
        stock_actual: mov ? Number(mov.stock_principal ?? 0) : null,
        bajo_minimo: mov?.bajo_minimo ?? false,
      };
    });

    return ordenarPorNombre(items);
  },
);


export const getProduct = cache(async (id: string): Promise<ProductDetail | null> => {
  const supabase = await createClient();

  const { data: producto, error } = await supabase
    .from('products')
    .select(
      'id, display_id, codigo, sku, name, description, brand, barcode, category_id, unit_id, control_mode, stock_minimo, notes, is_active, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!producto) return null;

  const [categorias, unidades, stock] = await Promise.all([
    supabase.from('categories').select('id, name'),
    supabase.from('units').select('id, code, name, unit_type'),
    supabase
      .from('v_stock_productos')
      .select('product_id, stock_principal, bajo_minimo')
      .eq('product_id', id)
      .maybeSingle(),
  ]);

  if (categorias.error) throw categorias.error;
  if (unidades.error) throw unidades.error;
  if (stock.error) throw stock.error;

  const categoriaPorId = new Map((categorias.data ?? []).map((c) => [c.id, c.name]));
  const unidadPorId = new Map((unidades.data ?? []).map((u) => [u.id, u]));
  const unidad = unidadPorId.get(producto.unit_id);
  const mov = stock.data;

  return {
    id: producto.id,
    display_id: producto.display_id,
    codigo: producto.codigo,
    sku: producto.sku,
    name: producto.name,
    description: producto.description,
    brand: producto.brand,
    barcode: producto.barcode,
    category_id: producto.category_id,
    categoria: producto.category_id
      ? (categoriaPorId.get(producto.category_id) ?? null)
      : null,
    unit_id: producto.unit_id,
    unidad: unidad?.name ?? '—',
    unidad_tipo: unidad?.unit_type ?? 'unidad',
    control_mode: producto.control_mode,
    stock_minimo: Number(producto.stock_minimo),
    is_active: producto.is_active,
    stock_actual: mov ? Number(mov.stock_principal ?? 0) : null,
    bajo_minimo: mov?.bajo_minimo ?? false,
    notes: producto.notes,
    created_at: producto.created_at,
    updated_at: producto.updated_at,
  };
});

export async function createProduct(
  data: ProductInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { data: creado, error } = await supabase
    .from('products')
    .insert({
      sku: data.sku,
      name: data.name,
      description: data.description ?? null,
      brand: data.brand ?? null,
      barcode: data.barcode ?? null,
      category_id: data.category_id ?? null,
      unit_id: data.unit_id,
      control_mode: data.control_mode,
      stock_minimo: data.stock_minimo,
      notes: data.notes ?? null,
      is_active: data.is_active,
    })
    .select('id')
    .single();

  const mensaje = mensajeErrorDb(error, 'un producto con ese SKU o código de barras', 'createProduct');
  if (mensaje) return { ok: false, message: mensaje };
  if (!creado) return { ok: false, message: 'No se pudo guardar el producto. Intenta de nuevo.' };
  return { ok: true, id: creado.id };
}

export async function updateProduct(
  id: string,
  data: ProductInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('products')
    .update({
      sku: data.sku,
      name: data.name,
      description: data.description ?? null,
      brand: data.brand ?? null,
      barcode: data.barcode ?? null,
      category_id: data.category_id ?? null,
      unit_id: data.unit_id,
      control_mode: data.control_mode,
      stock_minimo: data.stock_minimo,
      notes: data.notes ?? null,
      is_active: data.is_active,
    })
    .eq('id', id);

  const mensaje = mensajeErrorDb(error, 'un producto con ese SKU o código de barras', 'updateProduct');
  if (mensaje) return { ok: false, message: mensaje };
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const listCategories = cache(async (): Promise<CategoryListItem[]> => {
  const supabase = await createClient();

  const [{ data: categorias, error }, { data: productos, error: errorProductos }] =
    await Promise.all([
      supabase.from('categories').select('id, code, name, parent_id, sort_order, is_active'),
      supabase.from('products').select('id, category_id, is_active'),
    ]);

  if (error) throw error;
  if (errorProductos) throw errorProductos;

  const activosPorCategoria = new Map<string, number>();
  for (const p of productos ?? []) {
    if (!p.category_id || !p.is_active) continue;
    activosPorCategoria.set(p.category_id, (activosPorCategoria.get(p.category_id) ?? 0) + 1);
  }

  return ordenarPorNombre((categorias ?? []).map((c: CategoryListRow) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    parent_id: c.parent_id,
    sort_order: c.sort_order,
    is_active: c.is_active,
    productos_activos: activosPorCategoria.get(c.id) ?? 0,
  })));
});

export async function createCategory(
  data: CategoryInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { data: creada, error } = await supabase
    .from('categories')
    .insert({
      code: data.code ?? null,
      name: data.name,
      parent_id: data.parent_id ?? null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    })
    .select('id')
    .single();

  const mensaje = mensajeErrorDb(error, 'una categoría con ese nombre o código', 'createCategory');
  if (mensaje) return { ok: false, message: mensaje };
  if (!creada) return { ok: false, message: 'No se pudo guardar la categoría. Intenta de nuevo.' };
  return { ok: true, id: creada.id };
}

export async function updateCategory(
  id: string,
  data: CategoryInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('categories')
    .update({
      code: data.code ?? null,
      name: data.name,
      parent_id: data.parent_id ?? null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    })
    .eq('id', id);

  const mensaje = mensajeErrorDb(error, 'una categoría con ese nombre o código', 'updateCategory');
  if (mensaje) return { ok: false, message: mensaje };
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export const listUnits = cache(async (): Promise<UnitListItem[]> => {
  const supabase = await createClient();

  const [{ data: unidades, error }, { data: productos, error: errorProductos }] =
    await Promise.all([
      supabase.from('units').select(
        'id, code, name, unit_type, factor_to_base, base_unit, allow_fractional, decimals, is_active',
      ),
      supabase.from('products').select('id, unit_id, is_active'),
    ]);

  if (error) throw error;
  if (errorProductos) throw errorProductos;

  const activosPorUnidad = new Map<string, number>();
  for (const p of productos ?? []) {
    if (!p.is_active) continue;
    activosPorUnidad.set(p.unit_id, (activosPorUnidad.get(p.unit_id) ?? 0) + 1);
  }

  return ordenarPorNombre(
    (unidades ?? []).map((u: UnitListRow) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      unit_type: u.unit_type,
      factor_to_base: Number(u.factor_to_base),
      base_unit: u.base_unit,
      allow_fractional: u.allow_fractional,
      decimals: u.decimals,
      is_active: u.is_active,
      productos_activos: activosPorUnidad.get(u.id) ?? 0,
    })),
  );
});

export async function createUnit(
  data: UnitInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { data: creada, error } = await supabase
    .from('units')
    .insert({
      code: data.code,
      name: data.name,
      unit_type: data.unit_type,
      factor_to_base: data.factor_to_base,
      base_unit: data.base_unit,
      allow_fractional: data.allow_fractional,
      decimals: data.decimals,
      is_active: data.is_active,
    })
    .select('id')
    .single();

  const mensaje = mensajeErrorDb(error, 'una unidad con ese código', 'createUnit');
  if (mensaje) return { ok: false, message: mensaje };
  if (!creada) return { ok: false, message: 'No se pudo guardar la unidad. Intenta de nuevo.' };
  return { ok: true, id: creada.id };
}

export async function updateUnit(
  id: string,
  data: UnitInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('units')
    .update({
      code: data.code,
      name: data.name,
      unit_type: data.unit_type,
      factor_to_base: data.factor_to_base,
      base_unit: data.base_unit,
      allow_fractional: data.allow_fractional,
      decimals: data.decimals,
      is_active: data.is_active,
    })
    .eq('id', id);

  const mensaje = mensajeErrorDb(error, 'una unidad con ese código', 'updateUnit');
  if (mensaje) return { ok: false, message: mensaje };
  return { ok: true, id };
}

/** Datos de conversion de la unidad: los necesita el servidor, jamas el cliente. */
export const findUnitForConversion = cache(
  async (id: string): Promise<UnidadParaConversion | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('units')
      .select('id, code, name, unit_type, factor_to_base, is_active')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return { ...data, factor_to_base: Number(data.factor_to_base) };
  },
);

// ---------------------------------------------------------------------------
// Activar / desactivar (soft delete: el historial no se borra)
// ---------------------------------------------------------------------------

export async function setEntityActive(
  tabla: 'products' | 'categories' | 'units',
  input: ToggleActiveInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from(tabla)
    .update({ is_active: input.isActive })
    .eq('id', input.id);

  if (error) {
    console.error(`[catalogo:setEntityActive:${tabla}] error`, {
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: 'No se pudo actualizar el estado. Intenta de nuevo.' };
  }
  return { ok: true };
}
