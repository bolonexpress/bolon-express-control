'use server';

import { historialFiltrosSchema, type HistorialFiltrosInput } from '@/lib/validation/history';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import { listHistorial } from '@/server/repositories/history';
import { PERMISOS } from '@/types/domain';
import type { HistorialPagina, Resultado } from '@/types/domain';

/**
 * Consulta paginada del historial (Fase 7). La primera pagina la pinta la
 * pagina `/historial` en el servidor con los filtros de la URL; esta accion
 * sirve el "Cargar mas" del cliente con el cursor keyset.
 *
 * Orden fijo, igual que el resto de acciones:
 *   1. Guard RBAC (`history:read`) ANTES de validar.
 *   2. Zod estricto (los campos vienen JSON desde el cliente, no FormData).
 *   3. Repositorio (que a su vez pasa por la RLS de `movements:read` en la
 *      vista; el permiso `history:read` no sustituye ninguno de los de la
 *      Fase 1, es el de ESTA ruta).
 */
export async function consultarHistorialAction(
  filtrosInput: HistorialFiltrosInput,
): Promise<Resultado<HistorialPagina>> {
  try {
    await requirePermission(PERMISOS.historyRead);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error: {
          code: 'sin_permiso',
          message: `Necesitas el permiso ${PERMISOS.historyRead} para consultar el historial.`,
        },
      };
    }
    throw error;
  }

  const parsed = historialFiltrosSchema.safeParse(filtrosInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'validacion', message: 'Filtros invalidos o cursor corrupto.' },
    };
  }

  const pagina = await listHistorial(parsed.data);
  return { ok: true, data: pagina };
}
