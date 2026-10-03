import Link from 'next/link';

import { EstadoBadge } from '@/components/catalog/estado-badge';
import { ToggleActiveButton } from '@/components/ui/toggle-active-button';
import { toggleActiveAction } from '@/server/actions/catalog';
import type { CategoryListItem } from '@/server/repositories/catalog';

/** Categorias con su conteo de productos activos y su categoria superior. */
export function CategoriesTable({
  categorias,
  puedeEditar,
}: {
  categorias: CategoryListItem[];
  puedeEditar: boolean;
}) {
  const activar = toggleActiveAction.bind(null, 'categories');
  const nombrePadre = new Map(categorias.map((c) => [c.id, c.name]));

  if (categorias.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        Todavía no hay categorías.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {categorias.map((c) => (
          <li key={c.id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{c.name}</p>
                <p className="truncate text-xs text-texto-suave">
                  {c.code ?? 'sin código'}
                  {c.parent_id ? ` · bajo ${nombrePadre.get(c.parent_id) ?? '—'}` : ''}
                </p>
              </div>
              <EstadoBadge activo={c.is_active} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-borde pt-3">
              <span className="text-xs text-texto-suave">
                {c.productos_activos} producto{c.productos_activos === 1 ? '' : 's'} activo
                {c.productos_activos === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/categorias/${c.id}/editar`}
                  className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                >
                  Editar
                </Link>
                {puedeEditar ? (
                  <ToggleActiveButton accion={activar} id={c.id} isActive={c.is_active} etiqueta="categoría" />
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
              <th scope="col" className="px-4 py-3">Nombre</th>
              <th scope="col" className="px-4 py-3">Código</th>
              <th scope="col" className="px-4 py-3">Superior</th>
              <th scope="col" className="px-4 py-3 text-right">Orden</th>
              <th scope="col" className="px-4 py-3 text-right">Productos</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {categorias.map((c) => (
              <tr key={c.id} className={c.is_active ? undefined : 'bg-fondo text-texto-suave'}>
                <td className="px-4 py-3 font-medium text-texto">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.code ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.parent_id ? (nombrePadre.get(c.parent_id) ?? '—') : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.sort_order}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.productos_activos}</td>
                <td className="px-4 py-3">
                  <EstadoBadge activo={c.is_active} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/categorias/${c.id}/editar`}
                      className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                    >
                      Editar
                    </Link>
                    {puedeEditar ? (
                      <ToggleActiveButton accion={activar} id={c.id} isActive={c.is_active} etiqueta="categoría" />
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
