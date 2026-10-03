import type { Enums } from '@/types/database';

/**
 * Conversion y presentacion de cantidades. Codigo puro: lo usan el cliente
 * (para previsualizar) y el servidor (que es quien decide el valor guardado).
 *
 * Invariante del proyecto (ADR-001): todo peso se persiste en KG. Los demas
 * tipos persisten en su propia base (u para conteo, l para volumen).
 */

/** Unidad base de cada tipo. Debe coincidir con el seed 06. */
export const UNIDAD_BASE: Record<Enums['unidad_tipo'], string> = {
  peso: 'kg',
  unidad: 'u',
  volumen: 'l',
};

/** Capacidad de `numeric(14,3)`: 11 enteros y 3 decimales. */
export const MAX_NUMERIC_14_3 = 99_999_999_999.999;

/** Redondeo con protector contra el error de coma flotante (1.005 * 100 = ...4999). */
export function redondear(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return 0;
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON * Math.abs(valor)) * factor) / factor;
}

/**
 * Cantidad expresada en la unidad del producto -> cantidad en la unidad base
 * de su tipo (peso -> kg, conteo -> u, volumen -> l).
 */
export function aUnidadBase(cantidad: number, factorToBase: number): number {
  return redondear(cantidad * factorToBase, 3);
}

/** Inverso de `aUnidadBase`: reabre un valor guardado para editarlo en su unidad. */
export function desdeUnidadBase(cantidadBase: number, factorToBase: number): number {
  return redondear(cantidadBase / factorToBase, 6);
}

/** Cantidad legible con separador de miles y hasta `decimales` decimales. */
export function formatearCantidad(valor: number | null | undefined, decimales = 3): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return valor.toLocaleString('es-EC', { maximumFractionDigits: decimales });
}

/** Factor de conversion legible: entero sin decimales, resto con 8 (columna). */
export function formatearFactor(factor: number): string {
  return factor.toLocaleString('es-EC', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}
