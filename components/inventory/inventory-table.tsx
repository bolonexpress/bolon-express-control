import { formatearCantidad } from '@/lib/format/units';
import {
  estadoInventario,
  ESTADO_LABEL,
  type EstadoInventario,
  type InventarioRow,
} from '@/server/repositories/inventory';

const ESTADO_STYLES: Record<EstadoInventario, string> = {
  ok: 'bg-exito-suave text-exito ring-exito/20',
  bajo: 'bg-aviso-suave text-aviso ring-aviso/30',
  critico: 'bg-peligro-suave text-peligro ring-peligro/30',
};

function EstadoPill({ estado }: { estado: EstadoInventario }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${ESTADO_STYLES[estado]}`}
    >
      {estado === 'critico' ? '⛔ ' : estado === 'bajo' ? '⚠️ ' : ''}
      {ESTADO_LABEL[estado]}
    </span>
  );
}

/** Texto del stock segun el modo: peso en KG (ADR-001), conteo en su unidad. */
function textoStock(fila: InventarioRow): { principal: string; secundario: string | null } {
  const modo = fila.control_mode;
  if (modo === 'cantidad') {
    return { principal: `${formatearCantidad(fila.cantidad)} ${fila.unidad}`, secundario: null };
  }
  if (modo === 'peso') {
    return { principal: `${formatearCantidad(fila.peso_kg)} kg`, secundario: null };
  }
  return {
    principal: `${formatearCantidad(fila.peso_kg)} kg`,
    secundario: `${formatearCantidad(fila.cantidad)} ${fila.unidad}`,
  };
}

/**
 * Vista de inventario: SOLO LECTURA. El stock se calcula de los movimientos no
 * anulados y no existe ninguna columna editable: no se renderiza ningun
 * formulario ni boton de edicion, solo enlaces al catalogo para subir/bajar el
 * minimo (que es configuracion, no stock).
 */
export function InventoryTable({ filas }: { filas: InventarioRow[] }) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        No hay productos que mostrar con este filtro.
      </p>
    );
  }

  const textoMinimo = (fila: InventarioRow) =>
    `${formatearCantidad(fila.stock_minimo)} ${fila.control_mode === 'cantidad' ? fila.unidad : 'kg'}`;

  return (
    <>
      {/* Movil: una tarjeta por producto */}
      <ul className="space-y-3 sm:hidden">
        {filas.map((fila) => {
          const estado = estadoInventario(fila);
          const stock = textoStock(fila);
          return (
            <li key={fila.product_id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-texto">{fila.producto}</p>
                  <p className="text-xs text-texto-suave">
                    {fila.codigo}
                    {fila.categoria ? ` · ${fila.categoria}` : ''}
                  </p>
                </div>
                <EstadoPill estado={estado} />
              </div>

              {estado !== 'ok' ? (
                <p
                  role="alert"
                  className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                    estado === 'critico' ? 'bg-peligro-suave text-peligro' : 'bg-aviso-suave text-aviso'
                  }`}
                >
                  {estado === 'critico'
                    ? '⛔ Sin stock: está en cero o en negativo.'
                    : '⚠️ Inventario bajo: por debajo del mínimo configurado.'}
                </p>
              ) : null}

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-texto-suave">Stock actual</dt>
                  <dd className="text-base font-semibold tabular-nums text-texto">
                    {stock.principal}
                  </dd>
                  {stock.secundario ? (
                    <dd className="mt-0.5 text-xs tabular-nums text-texto-suave">{stock.secundario}</dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-texto-suave">Stock mínimo</dt>
                  <dd className="font-medium tabular-nums text-texto">{textoMinimo(fila)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
        <table className="min-w-full divide-y divide-borde text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-texto-suave">
              <th className="px-4 py-3 font-semibold">Producto</th>
              <th className="px-4 py-3 font-semibold">Categoría</th>
              <th className="px-4 py-3 text-right font-semibold">Stock actual</th>
              <th className="px-4 py-3 text-right font-semibold">Stock mínimo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.map((fila) => {
              const estado = estadoInventario(fila);
              const stock = textoStock(fila);
              return (
                <tr key={fila.product_id} className="align-top hover:bg-fondo">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-texto">{fila.producto}</span>
                    <span className="block text-xs text-texto-suave">
                      {fila.codigo}
                      {fila.sku ? ` · ${fila.sku}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-texto-suave">{fila.categoria ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    <span
                      className={`font-semibold ${
                        estado === 'critico'
                          ? 'text-peligro'
                          : estado === 'bajo'
                            ? 'text-aviso'
                            : 'text-texto'
                      }`}
                    >
                      {stock.principal}
                    </span>
                    {stock.secundario ? (
                      <span className="block text-xs text-texto-suave">{stock.secundario}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-texto-suave">
                    {textoMinimo(fila)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoPill estado={estado} />
                    {estado !== 'ok' ? (
                      <span className="mt-1 block text-xs text-texto-suave">
                        {estado === 'critico' ? '⛔ Sin stock' : '⚠️ Inventario bajo'}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
