import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import type { AuditoriaFiltrosParsed } from '@/lib/validation/audit';
import type { AuditoriaOpciones, AuditoriaPagina, AuditoriaRow } from '@/types/domain';

// ---------------------------------------------------------------------------
// Panel de auditoria (Fase 8)
//
// Paginacion keyset `(created_at, id)` igual que el historial (Fase 7): sin
// offset, sin `count`, LIMIT+1 decide si hay mas. La RLS `audit_logs_select`
// exige `audit:read`; la pagina lo vuelve a exigir en el guard.
// ---------------------------------------------------------------------------

export const AUDITORIA_PAGE_SIZE = 50;

/* Literal unico: concatenar ensancha el tipo y PostgREST deja de reconocerlo
 * (ver movements.ts). NOTA: `actor_id` no es FK a profiles, no hay join; el
 * mostrable es `actor_email` (la RPC/triggers ya lo graban). */
const AUDITORIA_SELECT =
  'id, actor_id, actor_email, accion, entidad, entidad_id, entidad_codigo, datos, ip_address, created_at';

const ZONA = '-05:00';

function inicioDelDia(fecha: string): string {
  return `${fecha}T00:00:00${ZONA}`;
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function listAuditoria(filtros: AuditoriaFiltrosParsed): Promise<AuditoriaPagina> {
  const supabase = await createClient();

  let consulta = supabase
    .from('audit_logs')
    .select(AUDITORIA_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(AUDITORIA_PAGE_SIZE + 1);

  if (filtros.accion) consulta = consulta.eq('accion', filtros.accion);
  if (filtros.entidad) consulta = consulta.eq('entidad', filtros.entidad);
  if (filtros.usuarioId) consulta = consulta.eq('actor_id', filtros.usuarioId);
  if (filtros.desde) consulta = consulta.gte('created_at', inicioDelDia(filtros.desde));
  if (filtros.hasta) consulta = consulta.lt('created_at', inicioDelDia(diaSiguiente(filtros.hasta)));

  if (filtros.cursor) {
    const sep = filtros.cursor.lastIndexOf('|');
    const creado = filtros.cursor.slice(0, sep);
    const id = filtros.cursor.slice(sep + 1);
    consulta = consulta.or(`created_at.lt.${creado},and(created_at.eq.${creado},id.lt.${id})`);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  const filas = (data ?? []) as AuditoriaRow[];

  const hayMas = filas.length > AUDITORIA_PAGE_SIZE;
  const pagina = hayMas ? filas.slice(0, AUDITORIA_PAGE_SIZE) : filas;

  const ultima = pagina[pagina.length - 1];
  const nextCursor = hayMas && ultima ? `${ultima.created_at}|${ultima.id}` : null;

  return { filas: pagina, nextCursor };
}

/** Opciones para los filtros (usuarios activos + entidades auditadas conocidas). */
export const listOpcionesAuditoria = cache(async (): Promise<AuditoriaOpciones> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) throw error;

  return {
    usuarios: (data ?? []).map((u) => ({ id: u.id, nombre: u.full_name })),
  };
});
