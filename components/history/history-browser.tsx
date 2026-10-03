'use client';

import { useState, useTransition } from 'react';

import { HistorialTabla, HistorialTarjetas } from '@/components/history/history-rows';
import { consultarHistorialAction } from '@/server/actions/history';
import type { HistorialRow } from '@/types/domain';
import type { HistorialFiltrosInput } from '@/lib/validation/history';

/**
 * Listado del historial con paginacion keyset ("Cargar mas").
 *
 * La primera pagina viene SSR (searchParams) para que la URL sea compartible
 * y la carga inicial no pida JS. Las siguientes se ACUMULAN en estado cliente
 * usando `consultarHistorialAction` con el cursor `created_at|id` del ultimo
 * dato visible: no hay `offset` (no se re-ecanean paginas anteriores en la
 * base) y la vista implicitamente excluye anulados del stock, no del libro.
 */
export function HistorialBrowser({
  filasIniciales,
  nextCursorInicial,
  filtros,
}: {
  filasIniciales: HistorialRow[];
  nextCursorInicial: string | null;
  filtros: Omit<HistorialFiltrosInput, 'cursor'>;
}) {
  const [filas, setFilas] = useState<HistorialRow[]>(filasIniciales);
  const [cursor, setCursor] = useState<string | null>(nextCursorInicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  const cargarMas = () => {
    if (!cursor) return;

    setError(null);
    iniciar(async () => {
      const resultado = await consultarHistorialAction({ ...filtros, cursor });
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
        No hay movimientos con esos filtros.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <HistorialTarjetas filas={filas} />
      <HistorialTabla filas={filas} />

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
          <p className="text-xs text-texto-tenue">No hay más movimientos.</p>
        )}
      </div>
    </div>
  );
}
