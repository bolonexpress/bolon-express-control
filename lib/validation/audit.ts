import { z } from 'zod';

import { AUDITORIA_ACCIONES, AUDITORIA_ENTIDADES } from '@/types/domain';

/**
 * Filtros del panel de auditoria (Fase 8). Mismas reglas que el historial:
 * vacios -> null, fechas locales inclusivas, cursor keyset `created_at|id`.
 * La entidad queda restringida a la lista conocida: es texto en la base,
 * pero la UI solo consulta lo que tiene label.
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
    .regex(/^[^|]+\|\d+$/, 'Cursor invalido')
    .nullable(),
);

export const auditoriaFiltrosSchema = z
  .object({
    desde: vacioANulo(z.string().regex(FECHA_RE, 'Fecha invalida (AAAA-MM-DD)').nullable()),
    hasta: vacioANulo(z.string().regex(FECHA_RE, 'Fecha invalida (AAAA-MM-DD)').nullable()),
    accion: vacioANulo(z.enum(AUDITORIA_ACCIONES, { message: 'Accion no valida' }).nullable()),
    entidad: vacioANulo(z.enum(AUDITORIA_ENTIDADES, { message: 'Entidad no valida' }).nullable()),
    usuarioId: vacioANulo(z.string().uuid('Usuario no valido').nullable()),
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

export type AuditoriaFiltrosInput = z.input<typeof auditoriaFiltrosSchema>;
export type AuditoriaFiltrosParsed = z.infer<typeof auditoriaFiltrosSchema>;
