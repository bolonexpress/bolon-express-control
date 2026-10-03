import 'server-only';

import { MAX_NUMERIC_14_3, UNIDAD_BASE, aUnidadBase } from '@/lib/format/units';
import type { CategoryListItem, SelectOption, UnitListItem } from '@/server/repositories/catalog';
import type { Enums, UnitFormOption } from '@/types/domain';

/**
 * Reglas de negocio del catalogo que no dependen de como se capturen los
 * datos. Los formularios las anticipan para dar feedback inmediato; las Server
 * Actions las aplican SIEMPRE antes de escribir (el cliente no es una barrera).
 *
 * Devuelven `Record<campo, mensaje>`, la misma forma que los `fields` de
 * `Resultado`, para que la UI pinte el error junto al input que lo produjo.
 */

export type ErroresDeCampo = Record<string, string>;

export type UnidadTipo = Pick<UnitListItem, 'unit_type' | 'factor_to_base'>;

// ---------------------------------------------------------------------------
// Unidades: factor de conversion y unidad base
// ---------------------------------------------------------------------------

/**
 * El factor convierte hacia la unidad base del tipo (peso -> kg, conteo -> u,
 * volumen -> l). La unidad base es, por definicion, la que no convierte, y solo
 * puede haber una activa por tipo (reforzado por el indice unico de la
 * migracion 08).
 */
export function validarUnidad(
  input: { unit_type: Enums['unidad_tipo']; factor_to_base: number; base_unit: boolean },
  existentes: UnitListItem[],
  idActual?: string,
): ErroresDeCampo {
  const errores: ErroresDeCampo = {};

  if (input.base_unit && input.factor_to_base !== 1) {
    errores.factor_to_base = `La unidad base (${UNIDAD_BASE[input.unit_type]}) no convierte: su factor debe ser 1.`;
  }

  if (input.base_unit) {
    const conflicto = existentes.find(
      (u) =>
        u.id !== idActual && u.base_unit && u.is_active && u.unit_type === input.unit_type,
    );
    if (conflicto) {
      errores.base_unit = `Ya existe la unidad base de tipo ${UNIDAD_BASE[input.unit_type]}: «${conflicto.name}». Desactiva esa primero.`;
    }
  }

  return errores;
}

/**
 * `stock_minimo` se captura en la unidad del producto y **siempre** se guarda en
 * la unidad base (kg / u / l), porque es lo que se compara contra el stock.
 *
 * La razon esta en el esquema de la Fase 1:
 *   - `movements.delta_cantidad` esta en la UNIDAD BASE del producto;
 *   - `movements.cantidad_original` guarda lo que escribio el usuario, antes de
 *     convertir (trazabilidad);
 *   - `v_stock_productos.cantidad` es la suma de `delta_cantidad`, y es contra
 *     esa cifra (o contra `peso_kg`) lo que compara `stock_minimo`.
 *
 * Sin convertir, un minimo de 10 capturado en libras se compararia contra
 * 4,536 kg y la alerta de reposicion saltaria mas tarde de la cuenta. Ver
 * ADR-011, que sustituye la segunda parte de ADR-009.
 */
export function normalizarStockMinimo(
  stockMinimo: number,
  unidad: UnidadTipo,
): { valorBase: number } | { error: string } {
  const valorBase = aUnidadBase(stockMinimo, unidad.factor_to_base);

  if (valorBase > MAX_NUMERIC_14_3) {
    return { error: 'El stock mínimo es demasiado grande para esta unidad.' };
  }

  return { valorBase };
}

// ---------------------------------------------------------------------------
// Productos: modo de control vs unidad
// ---------------------------------------------------------------------------

/**
 * `peso` y `ambos` se persisten en KG (ADR-001) y `v_stock_productos` compara
 * `peso_kg` contra `stock_minimo`, asi que la unidad debe admitir peso.
 * `cantidad` admite cualquier unidad: contar litros o piezas es legitimo.
 */
export function validarModoControl(
  controlMode: Enums['modo_control'],
  unitType: Enums['unidad_tipo'],
): string | null {
  if ((controlMode === 'peso' || controlMode === 'ambos') && unitType !== 'peso') {
    return 'El control por peso exige una unidad de tipo Peso (kg, g, lb).';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Categorias: jerarquia sin ciclos
// ---------------------------------------------------------------------------

export type CategoriaNodo = Pick<CategoryListItem, 'id' | 'parent_id'>;

/**
 * Opciones del formulario de producto: solo las entidades activas, mas la que
 * ya tenga asignada el producto (si se desactivo despues, el `<select>` debe
 * seguir mostrandola en lugar de saltarse al primer valor).
 */
export function opcionesCategorias(
  categorias: CategoryListItem[],
  idActual: string | null,
): SelectOption[] {
  return categorias
    .filter((c) => c.is_active || c.id === idActual)
    .map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (desactivada)` }));
}

export function opcionesUnidades(
  unidades: UnitListItem[],
  idActual: string | null,
): UnitFormOption[] {
  return unidades
    .filter((u) => u.is_active || u.id === idActual)
    .map((u) => ({
      value: u.id,
      label: u.name,
      unit_type: u.unit_type,
      factor_to_base: u.factor_to_base,
      is_active: u.is_active,
    }));
}

/** Una categoria no puede ser su propia superior ni quedar bajo su propio hijo. */
export function validarPadreCategoria(
  parentId: string | null,
  idActual: string | undefined,
  categorias: CategoriaNodo[],
): ErroresDeCampo {
  if (!parentId) return {};
  if (idActual && parentId === idActual) {
    return { parent_id: 'Una categoría no puede ser su propia superior.' };
  }

  const padrePorId = new Map(categorias.map((c) => [c.id, c.parent_id]));

  // Recorre la cadena de superiores con un tope: ademas de detectar el ciclo,
  // evita un bucle infinito si el arbol ya viniera corrupto.
  let cursor: string | null = parentId;
  for (let paso = 0; paso <= categorias.length; paso += 1) {
    if (cursor === null) return {};
    if (idActual && cursor === idActual) {
      return { parent_id: 'Esa categoría ya cuelga de esta; elija otra superior.' };
    }
    cursor = padrePorId.get(cursor) ?? null;
  }

  return { parent_id: 'La jerarquía de categorías es demasiado profunda o tiene un ciclo.' };
}

/** Ids que no pueden elegirse como superior: la propia categoria y sus hijas. */
export function idsNoSeleccionablesComoPadre(
  categorias: CategoriaNodo[],
  idActual: string | undefined,
): Set<string> {
  const bloqueados = new Set<string>();
  if (!idActual) return bloqueados;

  const padrePorId = new Map(categorias.map((c) => [c.id, c.parent_id]));
  bloqueados.add(idActual);

  for (const categoria of categorias) {
    let cursor: string | null = categoria.parent_id;
    for (let paso = 0; paso <= categorias.length && cursor !== null; paso += 1) {
      if (cursor === idActual) {
        bloqueados.add(categoria.id);
        break;
      }
      cursor = padrePorId.get(cursor) ?? null;
    }
  }

  return bloqueados;
}
