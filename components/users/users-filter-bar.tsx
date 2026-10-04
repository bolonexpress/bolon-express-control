import Link from 'next/link';

import { inputClass, labelClass } from '@/components/ui/field';
import { ESTADO_FILTRO, ESTADO_LABEL, ROLES_KEY, ROL_LABEL } from '@/lib/validation/users';
import type { EstadoFiltro, RolKey } from '@/lib/validation/users';

/**
 * Barra de filtros del listado de usuarios (Fase 10).
 *
 * Navegacion por URL (GET), igual que el historial: los filtros quedan en la
 * direccion, se comparten y sobreviven al recargar. En movil el panel se
 * pliega con `<details>`; en escritorio queda abierto.
 *
 * El campo de busqueda es `type="search"` y su `name` es `busqueda`, el mismo
 * que lee la pagina: el servidor busca tanto en el nombre como en el correo.
 */
export function UsersFilterBar({
  filtros,
}: {
  filtros: { busqueda: string | null; rol: RolKey | null; estado: EstadoFiltro };
}) {
  const hayFiltros = Boolean(filtros.busqueda || filtros.rol || filtros.estado !== 'todos');

  return (
    <details open className="rounded-2xl bg-superficie p-4 shadow-tarjeta ring-1 ring-borde">
      <summary className="cursor-pointer text-base font-semibold text-texto sm:cursor-default sm:list-none">
        Buscar y filtrar
        {hayFiltros ? (
          <span className="ml-2 rounded-full bg-marca px-2 py-0.5 text-xs text-white">activos</span>
        ) : null}
      </summary>

      <form method="GET" action="/admin/usuarios" className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="f-busqueda" className={labelClass}>
            Buscar
          </label>
          <input
            id="f-busqueda"
            name="busqueda"
            type="search"
            defaultValue={filtros.busqueda ?? ''}
            placeholder="Nombre o correo"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="f-rol" className={labelClass}>
            Rol
          </label>
          <select id="f-rol" name="rol" defaultValue={filtros.rol ?? ''} className={inputClass}>
            <option value="">Todos los roles</option>
            {ROLES_KEY.map((rol) => (
              <option key={rol} value={rol}>
                {ROL_LABEL[rol]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="f-estado" className={labelClass}>
            Estado
          </label>
          <select
            id="f-estado"
            name="estado"
            defaultValue={filtros.estado}
            className={inputClass}
          >
            {ESTADO_FILTRO.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_LABEL[estado]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:justify-end">
          {hayFiltros ? (
            <Link
              href="/admin/usuarios"
              className="inline-flex min-h-6 items-center justify-center rounded-xl bg-superficie px-5 text-base font-semibold text-marca ring-2 ring-marca/35 hover:bg-marca-lima/25"
            >
              Quitar filtros
            </Link>
          ) : null}
          <button
            type="submit"
            className="inline-flex min-h-6 items-center justify-center rounded-xl bg-marca px-5 text-base font-semibold text-white shadow-tarjeta hover:bg-marca-fuerte"
          >
            Buscar
          </button>
        </div>
      </form>
    </details>
  );
}