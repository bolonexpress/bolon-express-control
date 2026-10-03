'use client';

import { useState, useTransition } from 'react';

import { AuditoriaTabla, AuditoriaTarjetas } from '@/components/audit/audit-rows';
import { consultarAuditoriaAction } from '@/server/actions/audit';
import type { AuditoriaRow } from '@/types/domain';
import type { AuditoriaFiltrosInput } from '@/lib/validation/audit';

/** Listado de auditoria con paginacion keyset ("Cargar mas"). */
export function AuditBrowser({
  filasIniciales,
  nextCursorInicial,
  filtros,
}: {
  filasIniciales: AuditoriaRow[];
  nextCursorInicial: string | null;
  filtros: Omit<AuditoriaFiltrosInput, 'cursor'>;
}) {
  const [filas, setFilas] = useState<AuditoriaRow[]>(filasIniciales);
  const [cursor, setCursor] = useState<string | null>(nextCursorInicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  const cargarMas = () => {
    if (!cursor) return;
    setError(null);
    iniciar(async () => {
      const resultado = await consultarAuditoriaAction({ ...filtros, cursor });
      if (!resultado.ok) {
        setError(resultado.error.message);
        return;
      }
      setFilas((antes) => [...antes, ...resultado.data.filas]);
      setCursor(resultado.data.nextCursor);
    });
  };

  if (filas.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        No hay eventos con esos filtros.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AuditoriaTarjetas filas={filas} />
      <AuditoriaTabla filas={filas} />

      <div className="flex flex-col items-center gap-2">
        {error ? (
          <p role="alert" className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">
            {error}
          </p>
        ) : null}
        {cursor ? (
          <button
            type="button"
            onClick={cargarMas}
            disabled={cargando}
            className="w-full rounded-lg bg-marca-fuerte px-4 py-3 text-sm font-semibold text-white hover:bg-marca disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {cargando ? 'Cargando…' : 'Cargar más'}
          </button>
        ) : (
          <p className="text-xs text-texto-tenue">No hay más eventos.</p>
        )}
      </div>
    </div>
  );
}
