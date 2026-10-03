'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import { categorySchema, productSchema, toggleActiveSchema, unitSchema } from '@/lib/validation/catalog';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import {
  createCategory,
  createProduct,
  createUnit,
  findUnitForConversion,
  listCategories,
  listUnits,
  setEntityActive,
  updateCategory,
  updateProduct,
  updateUnit,
} from '@/server/repositories/catalog';
import {
  normalizarStockMinimo,
  validarModoControl,
  validarPadreCategoria,
  validarUnidad,
} from '@/server/services/catalog';
import { PERMISOS } from '@/types/domain';
import type { CatalogActionState } from '@/types/domain';

/**
 * Server Actions del catalogo. Orden fijo en todas:
 *   1. Guard RBAC (`catalog:write`) ANTES de leer FormData.
 *   2. Zod estricto (`.strict()`): forma, rangos y longitudes.
 *   3. Reglas de negocio (`server/services/catalog.ts`) sobre datos de la BD.
 *   4. Repositorio (que a su vez pasa por RLS: `catalog:write`).
 *   5. `revalidatePath` para que las listas muestren el cambio.
 *
 * El resultado sigue el `ActionResult` normativo de ARCHITECTURE.md §7, con
 * `fields` para que el formulario marque el input responsable del error.
 */

type EntidadCatalogo = 'products' | 'categories' | 'units';

const RUTAS: Record<EntidadCatalogo, string> = {
  products: '/productos',
  categories: '/categorias',
  units: '/unidades',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** FormData -> string seguro: nunca se acepta File ni array en un campo de texto. */
function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

/** Zod issues -> `{ campo: primer mensaje }`. Los checkbox ausentes llegan como "". */
function erroresDeZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !(campo in fields)) fields[campo] = issue.message;
  }
  return fields;
}

function falloValidacion(fields: Record<string, string>): CatalogActionState {
  return {
    ok: false,
    error: {
      code: 'validacion',
      message: 'Revisa los datos marcados.',
      fields,
    },
  };
}

function falloRegla(message: string, fields: Record<string, string> = {}): CatalogActionState {
  return { ok: false, error: { code: 'regla_negocio', message, fields } };
}

function falloGuard(permission: string): CatalogActionState {
  return {
    ok: false,
    error: {
      code: 'sin_permiso',
      message: `Necesitas el permiso ${permission} para hacer este cambio.`,
    },
  };
}

/**
 * El guard se ejecuta antes de tocar FormData. Un fallo de autorizacion se
 * traduce a un mensaje cerrado; cualquier otro error se propaga para que lo
 * registre `error.tsx` en vez de fingir que se guardo.
 */
async function exigirCatalogoWrite(): Promise<CatalogActionState | null> {
  try {
    await requirePermission(PERMISOS.catalogWrite);
    return null;
  } catch (error) {
    if (error instanceof AuthError) return falloGuard(PERMISOS.catalogWrite);
    throw error;
  }
}

/** `id` solo viaja si viene informado: en alta vacio seria un uuid invalido. */
function conId(datos: Record<string, unknown>, formData: FormData): Record<string, unknown> {
  const id = texto(formData, 'id');
  return id ? { ...datos, id } : datos;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export async function saveProductAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denegado = await exigirCatalogoWrite();
  if (denegado) return denegado;

  const parsed = productSchema.safeParse(
    conId(
      {
        sku: texto(formData, 'sku'),
        name: texto(formData, 'name'),
        description: texto(formData, 'description'),
        brand: texto(formData, 'brand'),
        barcode: texto(formData, 'barcode'),
        category_id: texto(formData, 'category_id'),
        unit_id: texto(formData, 'unit_id'),
        control_mode: texto(formData, 'control_mode'),
        stock_minimo: texto(formData, 'stock_minimo'),
        notes: texto(formData, 'notes'),
        is_active: texto(formData, 'is_active'),
      },
      formData,
    ),
  );

  if (!parsed.success) return falloValidacion(erroresDeZod(parsed.error));

  const { id, ...campos } = parsed.data;
  const esAlta = id === undefined;

  const unidad = await findUnitForConversion(campos.unit_id);
  if (!unidad) return falloRegla('La unidad seleccionada ya no existe.', { unit_id: 'Selecciona una unidad.' });
  if (!unidad.is_active) {
    return falloRegla('Esa unidad está desactivada. Reactívala antes de usarla.', {
      unit_id: 'Unidad desactivada.',
    });
  }

  const errorModo = validarModoControl(campos.control_mode, unidad.unit_type);
  if (errorModo) return falloRegla(errorModo, { control_mode: errorModo });

  const stockMinimo = normalizarStockMinimo(campos.stock_minimo, unidad);
  if ('error' in stockMinimo) {
    return falloRegla(stockMinimo.error, { stock_minimo: stockMinimo.error });
  }

  const datos = { ...campos, stock_minimo: stockMinimo.valorBase };

  const resultado = esAlta ? await createProduct(datos) : await updateProduct(id, datos);
  if (!resultado.ok) {
    return { ok: false, error: { code: 'base_datos', message: resultado.message } };
  }

  revalidatePath(RUTAS.products, 'layout');

  if (esAlta) redirect(`${RUTAS.products}?mensaje=${encodeURIComponent('Producto creado.')}`);

  return { ok: true, data: { id: resultado.id, mensaje: 'Producto actualizado.' } };
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function saveCategoryAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denegado = await exigirCatalogoWrite();
  if (denegado) return denegado;

  const parsed = categorySchema.safeParse(
    conId(
      {
        code: texto(formData, 'code'),
        name: texto(formData, 'name'),
        parent_id: texto(formData, 'parent_id'),
        sort_order: texto(formData, 'sort_order'),
        is_active: texto(formData, 'is_active'),
      },
      formData,
    ),
  );

  if (!parsed.success) return falloValidacion(erroresDeZod(parsed.error));

  const { id, ...campos } = parsed.data;
  const esAlta = id === undefined;

  const categorias = await listCategories();

  if (campos.parent_id && !categorias.some((c) => c.id === campos.parent_id)) {
    return falloRegla('La categoría superior seleccionada ya no existe.', {
      parent_id: 'Selecciona otra categoría.',
    });
  }

  const errorPadre = validarPadreCategoria(campos.parent_id, id, categorias);
  if (Object.keys(errorPadre).length > 0) return falloRegla('Revisa la categoría superior.', errorPadre);

  const resultado = esAlta ? await createCategory(campos) : await updateCategory(id, campos);
  if (!resultado.ok) {
    return { ok: false, error: { code: 'base_datos', message: resultado.message } };
  }

  revalidatePath(RUTAS.categories, 'layout');

  if (esAlta) redirect(`${RUTAS.categories}?mensaje=${encodeURIComponent('Categoría creada.')}`);

  return { ok: true, data: { id: resultado.id, mensaje: 'Categoría actualizada.' } };
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export async function saveUnitAction(
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denegado = await exigirCatalogoWrite();
  if (denegado) return denegado;

  const parsed = unitSchema.safeParse(
    conId(
      {
        code: texto(formData, 'code'),
        name: texto(formData, 'name'),
        unit_type: texto(formData, 'unit_type'),
        factor_to_base: texto(formData, 'factor_to_base'),
        base_unit: texto(formData, 'base_unit'),
        allow_fractional: texto(formData, 'allow_fractional'),
        decimals: texto(formData, 'decimals'),
        is_active: texto(formData, 'is_active'),
      },
      formData,
    ),
  );

  if (!parsed.success) return falloValidacion(erroresDeZod(parsed.error));

  const { id, ...campos } = parsed.data;
  const esAlta = id === undefined;

  const unidades = await listUnits();

  const errorUnidad = validarUnidad(campos, unidades, id);
  if (Object.keys(errorUnidad).length > 0) return falloRegla('Revisa la unidad.', errorUnidad);

  const resultado = esAlta ? await createUnit(campos) : await updateUnit(id, campos);
  if (!resultado.ok) {
    return { ok: false, error: { code: 'base_datos', message: resultado.message } };
  }

  revalidatePath(RUTAS.units, 'layout');

  if (esAlta) redirect(`${RUTAS.units}?mensaje=${encodeURIComponent('Unidad creada.')}`);

  return { ok: true, data: { id: resultado.id, mensaje: 'Unidad actualizada.' } };
}

// ---------------------------------------------------------------------------
// Activar / desactivar (soft delete: el historial nunca se borra)
// ---------------------------------------------------------------------------

export async function toggleActiveAction(
  entidad: EntidadCatalogo,
  _estadoAnterior: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const denegado = await exigirCatalogoWrite();
  if (denegado) return denegado;

  const parsed = toggleActiveSchema.safeParse({
    id: texto(formData, 'id'),
    isActive: texto(formData, 'isActive'),
  });

  if (!parsed.success) return falloValidacion({ id: 'Registro no válido.' });

  const resultado = await setEntityActive(entidad, parsed.data);
  if (!resultado.ok) {
    return { ok: false, error: { code: 'base_datos', message: resultado.message } };
  }

  revalidatePath(RUTAS[entidad], 'layout');

  return {
    ok: true,
    data: {
      id: parsed.data.id,
      mensaje: parsed.data.isActive ? 'Registro activado.' : 'Registro desactivado.',
    },
  };
}
