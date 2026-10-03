import { z } from 'zod';

import { MODO_CONTROL, UNIDAD_TIPO } from '@/types/domain';

/**
 * Esquemas Zod del catalogo (primera barrera; la base de datos
 * vuelve a validar con constraints, uniques y RLS).
 *
 * Convenciones:
 *  - Todos los esquemas son .strict(): no se aceptan campos extra.
 *  - Los textos opcionales llegan como "" y se normalizan a null.
 *  - Los checkboxes llegan como "on"/"" y se coercen a boolean.
 */

const CODIGO_UNIDAD_RE = /^[a-z][a-z0-9_]*$/;
const CODIGO_CATEGORIA_RE = /^[a-z0-9_-]*$/;
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** "" -> null (para textos opcionales que viajan en FormData). */
const vacioANulo = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
    esquema,
  );

const textoOpcional = (max: number, mensaje: string) =>
  vacioANulo(z.string().trim().max(max, mensaje).nullable());

const uuidOpcional = (mensaje: string) =>
  vacioANulo(z.string().uuid({ message: mensaje }).nullable());

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export const unitSchema = z
  .object({
    id: z.string().uuid('ID de unidad no válido').optional(),
    code: z
      .string()
      .trim()
      .min(1, 'Ingresa el código')
      .max(20, 'Máximo 20 caracteres')
      .regex(CODIGO_UNIDAD_RE, 'Solo minúsculas, números y guion bajo; debe empezar con letra'),
    name: z
      .string()
      .trim()
      .min(1, 'Ingresa el nombre')
      .max(60, 'Máximo 60 caracteres'),
    unit_type: z.enum(UNIDAD_TIPO, { message: 'Tipo de unidad no válido' }),
    // Factor de conversion HACIA la unidad base del tipo (peso -> kg,
    // conteo -> u, volumen -> l). Ej.: libra = 0.45359237, caja de 12 = 12.
    factor_to_base: z.coerce
      .number({ invalid_type_error: 'Ingresa un número válido' })
      .positive('El factor debe ser mayor que 0')
      .max(1_000_000_000, 'Valor demasiado grande'),
    base_unit: z.coerce.boolean(),
    allow_fractional: z.coerce.boolean(),
    decimals: z.coerce
      .number({ invalid_type_error: 'Ingresa un número válido' })
      .int('Debe ser un número entero')
      .min(0, 'Mínimo 0 decimales')
      .max(3, 'Máximo 3 decimales'),
    is_active: z.coerce.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const categorySchema = z
  .object({
    id: z.string().uuid('ID de categoría no válido').optional(),
    code: vacioANulo(
      z
        .string()
        .trim()
        .max(40, 'Máximo 40 caracteres')
        .regex(CODIGO_CATEGORIA_RE, 'Solo minúsculas, números, guion y guion bajo'),
    ),
    name: z
      .string()
      .trim()
      .min(1, 'Ingresa el nombre')
      .max(120, 'Máximo 120 caracteres'),
    parent_id: uuidOpcional('Categoría superior no válida'),
    sort_order: z.coerce
      .number({ invalid_type_error: 'Ingresa un número válido' })
      .int('Debe ser un número entero')
      .min(-32768, 'Fuera de rango')
      .max(32767, 'Fuera de rango'),
    is_active: z.coerce.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export const productSchema = z
  .object({
    id: z.string().uuid('ID de producto no válido').optional(),
    sku: z
      .string()
      .trim()
      .min(1, 'Ingresa el SKU')
      .max(64, 'Máximo 64 caracteres')
      .regex(SKU_RE, 'El SKU solo admite letras, números, punto, guion y guion bajo'),
    name: z
      .string()
      .trim()
      .min(1, 'Ingresa el nombre')
      .max(200, 'Máximo 200 caracteres'),
    description: textoOpcional(2000, 'Máximo 2000 caracteres'),
    brand: textoOpcional(120, 'Máximo 120 caracteres'),
    barcode: textoOpcional(80, 'Máximo 80 caracteres'),
    category_id: uuidOpcional('Categoría no válida'),
    unit_id: z.string().uuid({ message: 'Selecciona una unidad' }),
    control_mode: z.enum(MODO_CONTROL, { message: 'Modo de control no válido' }),
    stock_minimo: z.coerce
      .number({ invalid_type_error: 'Ingresa un número válido' })
      .min(0, 'El stock mínimo no puede ser negativo')
      .max(1_000_000_000_000, 'Valor demasiado grande'),
    notes: textoOpcional(2000, 'Máximo 2000 caracteres'),
    is_active: z.coerce.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Activar / desactivar (soft delete del catalogo)
// ---------------------------------------------------------------------------

export const toggleActiveSchema = z
  .object({
    id: z.string().uuid({ message: 'ID no válido' }),
    isActive: z
      .string()
      .transform((valor) => valor === 'true'),
  })
  .strict();

export type UnitInput = z.infer<typeof unitSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ToggleActiveInput = z.infer<typeof toggleActiveSchema>;
