import { z } from 'zod';

import { MOVIMIENTO_TIPO } from '@/types/domain';

/**
 * Esquema de filtros del historial (Fase 7). Los filtros llegan como
 * searchParams (URL) desde la pagina y como objeto desde la Server Action:
 * el mismo esquema los normaliza en los dos caminos.
 *
 *  - `""`/vacios -> null (sin filtro).
 *  - Fechas YYYY-MM-DD: el rango es inclusivo en hora America/Guayaquil.
 *  - El cursor keyset es `created_at|uuid`; se valida la forma, no el contenido
 *    (un cursor manipulado simplemente da la pagina equivocada, no abre nada).
 */

const vacioANulo = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
    esquema,
  );

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const cursorSeguro = vacioANulo(
  z
    .string()
    .max(120)
    .regex(/^[^|,]+\|[0-9a-f-]{36}$/i, 'Cursor invalido')
    .nullable(),
);

export const historialFiltrosSchema = z
  .object({
    desde: vacioANulo(
      z.string().regex(FECHA_RE, 'Fecha invalida (AAAA-MM-DD)').nullable(),
    ),
    hasta: vacioANulo(
      z.string().regex(FECHA_RE, 'Fecha invalida (AAAA-MM-DD)').nullable(),
    ),
    tipo: vacioANulo(z.enum(MOVIMIENTO_TIPO, { message: 'Tipo no válido' }).nullable()),
    productoId: vacioANulo(z.string().uuid('Producto no válido').nullable()),
    usuarioId: vacioANulo(z.string().uuid('Usuario no válido').nullable()),
    cursor: cursorSeguro,
  })
  .strict()
  .superRefine((datos, ctx) => {
    if (datos.desde && datos.hasta && datos.desde > datos.hasta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hasta'],
        message: 'La fecha final no puede ser anterior a la inicial.',
      });
    }
  });

export type HistorialFiltrosInput = z.input<typeof historialFiltrosSchema>;
export type HistorialFiltrosParsed = z.infer<typeof historialFiltrosSchema>;
