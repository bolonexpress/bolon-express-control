import Link from 'next/link';

import { EstadoBadge } from '@/components/catalog/estado-badge';
import { ToggleActiveButton } from '@/components/ui/toggle-active-button';
import { formatearCantidad } from '@/lib/format/units';
import { toggleActiveAction } from '@/server/actions/catalog';
import type { ProductListItem } from '@/server/repositories/catalog';
import { MODO_CONTROL_LABEL } from '@/types/domain';

/**
 * Listado de productos. Mobile-first: en pantalla pequena cada producto es una
 * tarjeta (sin scroll horizontal); desde `sm` se vuelve tabla. Mismos datos,
 * dos disposiciones — no hay paginado porque el catalogo se pagina en fases
 * posteriores (ARCHITECTURE.md §8 exige paginacion server-side antes de que el
 * volumen lo justifique).
 */
export function ProductsTable({
  productos,
  puedeEditar,
}: {
  productos: ProductListItem[];
  puedeEditar: boolean;
}) {
  const activar = toggleActiveAction.bind(null, 'products');

  if (productos.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        Todavía no hay productos.
      </p>
    );
  }

  return (
    <>
      {/* Movil: tarjetas */}
      <ul className="space-y-3 sm:hidden">
        {productos.map((p) => (
          <li key={p.id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-texto-suave">{p.codigo}</p>
                <p className="truncate text-sm font-semibold text-texto">{p.name}</p>
                <p className="truncate text-xs text-texto-suave">
                  {p.sku}
                  {p.brand ? ` · ${p.brand}` : ''}
                </p>
              </div>
              <EstadoBadge activo={p.is_active} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Dato termino="Categoría" valor={p.categoria ?? '—'} />
              <Dato termino="Unidad" valor={`${p.unidad} · ${MODO_CONTROL_LABEL[p.control_mode]}`} />
              <Dato
                termino="Stock"
                valor={`${formatearCantidad(p.stock_actual)} ${p.unidad}`}
                destacado={p.bajo_minimo}
              />
              <Dato termino="Stock mínimo" valor={`${formatearCantidad(p.stock_minimo)} ${p.unidad}`} />
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-borde pt-3">
              <Link
                href={`/productos/${p.id}/editar`}
                className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
              >
                Editar
              </Link>
              {puedeEditar ? (
                <ToggleActiveButton accion={activar} id={p.id} isActive={p.is_active} etiqueta="producto" />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th scope="col" className="px-4 py-3">Código</th>
              <th scope="col" className="px-4 py-3">Producto</th>
              <th scope="col" className="px-4 py-3">Categoría</th>
              <th scope="col" className="px-4 py-3">Unidad / control</th>
              <th scope="col" className="px-4 py-3 text-right">Stock</th>
              <th scope="col" className="px-4 py-3 text-right">Mínimo</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {productos.map((p) => (
              <tr key={p.id} className={p.is_active ? undefined : 'bg-fondo text-texto-suave'}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{p.codigo}</td>
                <td className="px-4 py-3">
                  <span className="block font-medium text-texto">{p.name}</span>
                  <span className="block text-xs text-texto-suave">
                    {p.sku}
                    {p.brand ? ` · ${p.brand}` : ''}
                    {p.barcode ? ` · ${p.barcode}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3">{p.categoria ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {p.unidad}
                  <span className="block text-xs text-texto-suave">{MODO_CONTROL_LABEL[p.control_mode]}</span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${p.bajo_minimo ? 'font-semibold text-peligro' : ''}`}
                >
                  {formatearCantidad(p.stock_actual)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-texto-suave">
                  {formatearCantidad(p.stock_minimo)}
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge activo={p.is_active} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/productos/${p.id}/editar`}
                      className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                    >
                      Editar
                    </Link>
                    {puedeEditar ? (
                      <ToggleActiveButton accion={activar} id={p.id} isActive={p.is_active} etiqueta="producto" />
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

function Dato({
  termino,
  valor,
  destacado,
}: {
  termino: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div>
      <dt className="text-texto-suave">{termino}</dt>
      <dd className={destacado ? 'font-semibold text-peligro' : 'font-medium text-texto'}>{valor}</dd>
    </div>
  );
}
