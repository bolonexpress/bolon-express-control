import Link from 'next/link';

import { EstadoBadge } from '@/components/catalog/estado-badge';
import { ToggleActiveButton } from '@/components/ui/toggle-active-button';
import { UNIDAD_BASE, formatearFactor } from '@/lib/format/units';
import { toggleActiveAction } from '@/server/actions/catalog';
import type { UnitListItem } from '@/server/repositories/catalog';
import { UNIDAD_TIPO_LABEL } from '@/types/domain';

/**
 * Unidades con su factor de conversion. La columna "1 unidad = ?" es la que
 * hace tangible la regla de negocio: todo se convierte a kg / u / l antes de
 * guardarse o compararse.
 */
export function UnitsTable({
  unidades,
  puedeEditar,
}: {
  unidades: UnitListItem[];
  puedeEditar: boolean;
}) {
  const activar = toggleActiveAction.bind(null, 'units');

  if (unidades.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        Todavía no hay unidades.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {unidades.map((u) => (
          <li key={u.id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">
                  {u.name} <span className="font-mono text-xs text-texto-suave">({u.code})</span>
                </p>
                <p className="text-xs text-texto-suave">{UNIDAD_TIPO_LABEL[u.unit_type]}</p>
              </div>
              <EstadoBadge activo={u.is_active} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-texto-suave">Conversión</dt>
                <dd className="font-medium text-texto">
                  1 {u.code} = {formatearFactor(u.factor_to_base)} {UNIDAD_BASE[u.unit_type]}
                </dd>
              </div>
              <div>
                <dt className="text-texto-suave">Decimales</dt>
                <dd className="font-medium text-texto">
                  {u.decimals}
                  {u.allow_fractional ? ' · fracciones' : ''}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-borde pt-3">
              <span className="text-xs text-texto-suave">
                {u.productos_activos} producto{u.productos_activos === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/unidades/${u.id}/editar`}
                  className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                >
                  Editar
                </Link>
                {puedeEditar ? (
                  <ToggleActiveButton accion={activar} id={u.id} isActive={u.is_active} etiqueta="unidad" />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th scope="col" className="px-4 py-3">Unidad</th>
              <th scope="col" className="px-4 py-3">Código</th>
              <th scope="col" className="px-4 py-3">Tipo</th>
              <th scope="col" className="px-4 py-3">Conversión</th>
              <th scope="col" className="px-4 py-3 text-right">Decimales</th>
              <th scope="col" className="px-4 py-3 text-right">Productos</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {unidades.map((u) => (
              <tr key={u.id} className={u.is_active ? undefined : 'bg-fondo text-texto-suave'}>
                <td className="px-4 py-3 font-medium text-texto">
                  {u.name}
                  {u.base_unit ? (
                    <span className="ml-2 rounded-full bg-marca-fuerte px-2 py-0.5 text-xs font-medium text-white">
                      base
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{u.code}</td>
                <td className="whitespace-nowrap px-4 py-3">{UNIDAD_TIPO_LABEL[u.unit_type]}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                  1 {u.code} = {formatearFactor(u.factor_to_base)} {UNIDAD_BASE[u.unit_type]}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {u.decimals}
                  {u.allow_fractional ? ' · frac' : ''}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{u.productos_activos}</td>
                <td className="px-4 py-3">
                  <EstadoBadge activo={u.is_active} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/unidades/${u.id}/editar`}
                      className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                    >
                      Editar
                    </Link>
                    {puedeEditar ? (
                      <ToggleActiveButton accion={activar} id={u.id} isActive={u.is_active} etiqueta="unidad" />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
