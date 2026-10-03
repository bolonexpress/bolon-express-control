'use server';

import { auditoriaFiltrosSchema, type AuditoriaFiltrosInput } from '@/lib/validation/audit';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import { listAuditoria } from '@/server/repositories/audit';
import { PERMISOS } from '@/types/domain';
import type { AuditoriaPagina, Resultado } from '@/types/domain';

/**
 * Consulta paginada de la bitacora (Fase 8). Mismo contrato que el historial:
 *   1. Guard RBAC (`audit:read`) antes de validar. El enunciado llamaba a este
 *      permiso `admin:read`; no existe en el seed: se reusa `audit:read`,
 *      que es el permiso real que exige la RLS `audit_logs_select` (ver
 *      ADR-015).
 *   2. Zod estricto.
 *   3. Repositorio (que ademas pasa por la RLS).
 */
export async function consultarAuditoriaAction(
  filtrosInput: AuditoriaFiltrosInput,
): Promise<Resultado<AuditoriaPagina>> {
  try {
    await requirePermission(PERMISOS.auditRead);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error: {
          code: 'sin_permiso',
          message: `Necesitas el permiso ${PERMISOS.auditRead} para consultar la auditoria.`,
        },
      };
    }
    throw error;
  }

  const parsed = auditoriaFiltrosSchema.safeParse(filtrosInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'validacion', message: 'Filtros invalidos o cursor corrupto.' },
    };
  }

  const pagina = await listAuditoria(parsed.data);
  return { ok: true, data: pagina };
}
