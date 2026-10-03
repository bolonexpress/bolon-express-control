'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import type { CatalogActionState } from '@/types/domain';

/**
 * Activar / desactivar (soft delete). Es un `<form>` propio por fila con su
 * Server Action ya enlazada (`toggleActiveAction.bind(null, 'products')`), de
 * modo que no hay JavaScript de por medio en el camino critico: sin JS, el
 * formulario sigue enviandose.
 *
 * La accion devuelve `{ ok: true }` sin redirigir, asi que el aviso sale del
 * propio estado: "Guardado correctamente" no necesita viajar por la URL.
 */
export function ToggleActiveButton({
  accion,
  id,
  isActive,
  etiqueta,
}: {
  accion: (estado: CatalogActionState, formData: FormData) => Promise<CatalogActionState>;
  id: string;
  isActive: boolean;
  etiqueta: string;
}) {
  const [estado, formAction] = useActionState(accion, null);
  const error = estado?.ok === false ? estado.error.message : null;

  useToastDeEstado(estado, {
    exito: isActive ? 'Guardado correctamente. Queda desactivado.' : 'Guardado correctamente. Queda activo.',
  });

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
      <SubmitButton
        pendingText="Guardando…"
        className={
          isActive
            ? 'min-h-6 rounded-xl border-2 border-borde px-3 text-sm font-semibold text-texto hover:bg-fondo disabled:cursor-not-allowed disabled:opacity-60'
            : 'min-h-6 rounded-xl border-2 border-exito/40 px-3 text-sm font-semibold text-exito hover:bg-exito-suave disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {isActive ? `Desactivar ${etiqueta}` : `Reactivar ${etiqueta}`}
      </SubmitButton>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-peligro">
          {error}
        </p>
      ) : null}
    </form>
  );
}
