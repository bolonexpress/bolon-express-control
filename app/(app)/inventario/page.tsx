import Link from 'next/link';

import { InventoryTable } from '@/components/inventory/inventory-table';
import { PageHeader } from '@/components/ui/page-header';
import { estadoInventario, listInventario, resumenInventario } from '@/server/repositories/inventory';
import { requirePagePermission } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'bajo', label: 'Bajo mínimo' },
  { valor: 'ok', label: 'En nivel' },
] as const;

/**
 * Inventario calculado (Fase 5). Ruta protegida con `inventory:read`.
 *
 * SOLO LECTURA: el stock no es una columna editable, se suma de los movimientos
 * no anulados (`v_stock_productos`). Esta pagina no ofrece ninguna edicion
 * directa; para mover stock hay que registrar un movimiento.
 *
 * Fase 9: el titulo dice lo que se hace ("Ver qué queda"), los tres numeros de
 * arriba usan los tonos de marca y los filtros son botones altos (48px) para
 * que se acierten con el dedo.
 */
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await requirePagePermission(PERMISOS.inventoryRead);

  const { filtro } = await searchParams;
  const inventario = await listInventario();
  const resumen = resumenInventario(inventario);

  const filas =
    filtro === 'bajo'
      ? inventario.filter((f) => estadoInventario(f) !== 'ok')
      : filtro === 'ok'
        ? inventario.filter((f) => estadoInventario(f) === 'ok')
        : inventario;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <PageHeader
          titulo="Ver qué queda"
          descripcion="Cuánto hay de cada cosa y qué se está acabando. Aquí no se escribe nada: las cantidades cambian solas cuando anotas entradas, salidas o ajustes."
          ayuda={{
            titulo: 'Ver qué queda',
            resumen:
              'Esta pantalla te dice cuánto queda de cada producto. No se puede escribir en ella: el número sale de todo lo que se ha anotado.',
            pasos: [
              'Toca «Todos», «Bajo mínimo» o «En nivel» para ver solo una parte.',
              'Busca el producto y mira la cantidad que hay ahora.',
              'Si falta algo, anótalo con «Recibir mercancía».',
            ],
            nota: 'En rojo no queda nada. En amarillo queda poco: conviene comprarlo pronto.',
          }}
        >
          <dl className="grid max-w-md grid-cols-3 gap-2">
            <div className="rounded-2xl bg-superficie p-3 text-center shadow-tarjeta ring-1 ring-borde">
              <dt className="text-xs text-texto-suave">Ya no queda</dt>
              <dd className="text-2xl font-bold tabular-nums text-peligro">{resumen.criticos}</dd>
            </div>
            <div className="rounded-2xl bg-superficie p-3 text-center shadow-tarjeta ring-1 ring-borde">
              <dt className="text-xs text-texto-suave">Queda poco</dt>
              <dd className="text-2xl font-bold tabular-nums text-aviso">{resumen.bajos}</dd>
            </div>
            <div className="rounded-2xl bg-superficie p-3 text-center shadow-tarjeta ring-1 ring-borde">
              <dt className="text-xs text-texto-suave">Hay de sobra</dt>
              <dd className="text-2xl font-bold tabular-nums text-exito">{resumen.ok}</dd>
            </div>
          </dl>
        </PageHeader>

        <nav aria-label="Filtrar inventario">
          <ul className="flex gap-2 overflow-x-auto">
            {FILTROS.map((f) => {
              const activa = (filtro ?? '') === f.valor;
              return (
                <li key={f.valor || 'todos'}>
                  <Link
                    href={f.valor ? `/inventario?filtro=${f.valor}` : '/inventario'}
                    aria-current={activa ? 'page' : undefined}
                    className={
                      activa
                        ? 'inline-flex min-h-6 items-center rounded-xl bg-marca-fuerte px-4 text-base font-semibold text-white'
                        : 'inline-flex min-h-6 items-center rounded-xl border-2 border-borde bg-superficie px-4 text-base font-semibold text-texto-suave hover:border-marca hover:bg-marca-lima/20'
                    }
                  >
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <InventoryTable filas={filas} />
    </div>
  );
}