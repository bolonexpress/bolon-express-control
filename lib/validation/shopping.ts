import { z } from 'zod';

import { COMPRAS_ESTADO } from '@/types/domain';
import { MAX_NUMERIC_14_3 } from '@/lib/format/units';

/**
 * Esquemas Zod de la lista de compras (primera barrera; la base vuelve a
 * validar con constraints, trigger de transiciones y RLS).
 *
 * Mismas convenciones que `catalog.ts`: `.strict()`, textos opcionales llegan
 * como "" y se normalizan a null.
 */

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
// Agregar pendiente
//
// El pendiente puede ser UN producto del catalogo (con su unidad) o un texto
// libre ("2 tarrinas de hielo", "bolsas grandes"). La base lo exige con el
// check `shopping_item_definido`; aqui lo anticipamos.
// ---------------------------------------------------------------------------

export const agregarPendienteSchema = z
  .object({
    producto_id: uuidOpcional('Producto no válido'),
    descripcion: textoOpcional(300, 'Máximo 300 caracteres'),
    cantidad: z.coerce
      .number({ invalid_type_error: 'Ingresa un número válido' })
      .positive('La cantidad debe ser mayor que 0')
      .max(MAX_NUMERIC_14_3, 'Valor demasiado grande'),
    prioridad: z.coerce
      .number({ invalid_type_error: 'Selecciona una prioridad' })
      .int('Selecciona una prioridad')
      .min(1, 'Prioridad no válida')
      .max(3, 'Prioridad no válida'),
    proveedor: textoOpcional(120, 'Máximo 120 caracteres'),
    notas: textoOpcional(500, 'Máximo 500 caracteres'),
  })
  .strict()
  .superRefine((datos, ctx) => {
    if (!datos.producto_id && !datos.descripcion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['descripcion'],
        message: 'Elige un producto del catálogo o describe lo que falta.',
      });
    }
    if (datos.producto_id && datos.descripcion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['descripcion'],
        message: 'Elige el producto o escribe el texto libre, no ambos.',
      });
    }
  });

export type AgregarPendienteInput = z.infer<typeof agregarPendienteSchema>;

// ---------------------------------------------------------------------------
// Cambiar estado (pendiente → en_proceso → comprado / descartado)
// ---------------------------------------------------------------------------

export const cambiarEstadoSchema = z
  .object({
    id: z.string().uuid('Pendiente no válido'),
    estado: z.enum(COMPRAS_ESTADO, { message: 'Selecciona un estado válido' }),
    cantidad_comprada: vacioANulo(
      z.coerce
        .number({ invalid_type_error: 'Ingresa un número válido' })
        .positive('La cantidad comprada debe ser mayor que 0')
        .max(MAX_NUMERIC_14_3, 'Valor demasiado grande')
        .nullable(),
    ),
    precio_unitario: vacioANulo(
      z.coerce
        .number({ invalid_type_error: 'Ingresa un número válido' })
        .nonnegative('El precio no puede ser negativo')
        .max(999_999_999.9999, 'Valor demasiado grande')
        .nullable(),
    ),
  })
  .strict();

export type CambiarEstadoInput = z.infer<typeof cambiarEstadoSchema>;
