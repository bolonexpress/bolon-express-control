'use client';

import { useState, useTransition } from 'react';

import { UsersTable } from '@/components/users/users-table';
import { consultarUsuariosAction, type FiltrosUsuarios } from '@/server/actions/users';
import type { UsuarioRow } from '@/types/domain';

/**
 * Listado de usuarios con paginacion keyset ("Cargar mas").
 *
 * La primera pagina viene SSR (searchParams) para que la URL sea compartible y
 * la carga inicial no pida JS. Las siguientes se ACUMULAN en estado cliente con
 * `consultarUsuariosAction` y el cursor de la ultima fila visible: nada de
 * `offset`, que releeria todas las paginas anteriores en la base.
 */
export function UsersBrowser({
  usuariosIniciales,
  nextCursorInicial,
  filtros,
  yoId,
}: {
  usuariosIniciales: UsuarioRow[];
  nextCursorInicial: string | null;
  filtros: FiltrosUsuarios;
  yoId: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>(usuariosIniciales);
  const [cursor, setCursor] = useState<string | null>(nextCursorInicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  const esYO = (id: string) => id === yoId;

  const cargarMas = () => {
    if (!cursor) return;

    setError(null);
    iniciar(async () => {
      const resultado = await consultarUsuariosAction(filtros, cursor);
      if (!resultado.ok) {
        setError(resultado.error.message);
        return;
      }
      setUsuarios((antes) => [...antes, ...(resultado.data.filas ?? [])]);
      setCursor(resultado.data.nextCursor ?? null);
    });
  };

  if (usuarios.length === 0) return null;

  return (
    <div className="space-y-4">
      <UsersTable usuarios={usuarios} esYO={esYO} />

      <div className="flex flex-col items-center gap-2">
        {error ? (
          <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-base font-medium text-peligro ring-1 ring-peligro/25">
            {error}
          </p>
        ) : null}
        {cursor ? (
          <button
            type="button"
            onClick={cargarMas}
            disabled={cargando}
            className="inline-flex min-h-6 w-full items-center justify-center rounded-xl bg-marca-fuerte px-5 text-base font-semibold text-white hover:bg-marca disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {cargando ? 'Cargando…' : 'Cargar más'}
          </button>
        ) : (
          <p className="text-sm text-texto-tenue">No hay más personas.</p>
        )}
      </div>
    </div>
  );
}