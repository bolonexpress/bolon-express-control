import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EstadoButtons } from '@/components/shopping/estado-buttons';
import { ShoppingRealtime } from '@/components/shopping/shopping-realtime';
import { tarjetaClass } from '@/components/ui/field';
import { HelpButton } from '@/components/ui/help-button';
import { formatearCantidad } from '@/lib/format/units';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { getCompra, listHistorialCompra } from '@/server/repositories/shopping';
import {
  COMPRAS_ESTADO_LABEL,
  COMPRAS_HISTORIAL_TIPO_LABEL,
  COMPRAS_TRANSICIONES,
  PRIORIDAD_LABEL,
  PERMISOS,
} from '@/types/domain';

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Detalle del pendiente: datos completos y el historial (quien lo creo, quien
 * cambio cada estado y cuando). Ruta protegida con `shopping:read`.
 */
export default async function CompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISOS.shoppingRead);
  const puedeEscribir = contextHasPermission(context, PERMISOS.shoppingWrite);

  const { id } = await params;
  const item = await getCompra(id);
  if (!item) notFound();

  const historial = await listHistorialCompra(item.id);
  const transiciones = COMPRAS_TRANSICIONES[item.estado];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-texto-suave">
            <Link href="/compras" className="hover:underline">
              Lista de compras
            </Link>{' '}
            · {item.codigo}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-texto">
            {item.producto ?? item.descripcion}
          </h1>
          <p className="mt-1 text-sm text-texto-suave">
            {COMPRAS_ESTADO_LABEL[item.estado]} · {textoCantidad(item)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ShoppingRealtime />
          <HelpButton
            titulo="Detalle de una compra"
            resumen="Esta es una cosa que hay que comprar. Aquí se ve todo lo que se sabe de ella y quién fue tocando su estado."
            pasos={[
              'Arriba dice en qué estado está: pendiente, en proceso, comprado o descartado.',
              'Abajo, los botones grandes mueven el estado de un toque.',
              'Si está comprado, se ven la cantidad y el precio que se anotaron.',
              'En «Historial» queda quién creó la compra y quién cambió cada estado.',
            ]}
            nota="Un pendiente comprado ya no se puede volver a pendiente. Si te equivocaste, descartar y crear uno nuevo."
          />
        </div>
      </div>

      <section className={tarjetaClass}>
        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-texto-suave">Cantidad sugerida</dt>
            <dd className="font-medium tabular-nums text-texto">{textoCantidad(item)}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Prioridad</dt>
            <dd className="font-medium text-texto">
              {PRIORIDAD_LABEL[item.prioridad as 1 | 2 | 3] ?? item.prioridad}
            </dd>
          </div>
          <div>
            <dt className="text-texto-suave">Proveedor</dt>
            <dd className="font-medium text-texto">{item.proveedor ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Estado</dt>
            <dd className="font-medium text-texto">{COMPRAS_ESTADO_LABEL[item.estado]}</dd>
          </div>
          {item.estado === 'comprado' ? (
            <>
              <div>
                <dt className="text-texto-suave">Cantidad comprada</dt>
                <dd className="font-medium tabular-nums text-texto">
                  {formatearCantidad(item.cantidad_comprada)} {item.unidad ?? 'u'}
                </dd>
              </div>
              <div>
                <dt className="text-texto-suave">Precio unitario</dt>
                <dd className="font-medium tabular-nums text-texto">
                  {item.precio_unitario !== null ? `$${formatearCantidad(item.precio_unitario, 4)}` : '—'}
                </dd>
              </div>
            </>
          ) : null}
          {item.notas ? (
            <div className="sm:col-span-2">
              <dt className="text-texto-suave">Notas</dt>
              <dd className="font-medium text-texto">{item.notas}</dd>
            </div>
          ) : null}
        </dl>

        {puedeEscribir && transiciones.length > 0 ? (
          <div className="mt-4 border-t border-borde pt-4">
            <EstadoButtons id={item.id} transiciones={transiciones} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="historial-titulo" className={tarjetaClass}>
        <h2 id="historial-titulo" className="text-sm font-semibold text-texto">
          Historial
        </h2>
        {historial.length === 0 ? (
          <p className="mt-3 text-sm text-texto-suave">Todavía no hay cambios registrados.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {historial.map((entrada) => (
              <li key={entrada.id} className="flex gap-3 border-l-2 border-borde pl-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-texto">
                    {COMPRAS_HISTORIAL_TIPO_LABEL[entrada.tipo_registro]}
                    {entrada.estado_anterior && entrada.estado_nuevo ? (
                      <span className="ml-1 font-normal text-texto-suave">
                        {COMPRAS_ESTADO_LABEL[entrada.estado_anterior]} →{' '}
                        {COMPRAS_ESTADO_LABEL[entrada.estado_nuevo]}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-texto-suave">
                    {entrada.changed_by_nombre ?? entrada.changed_by.slice(0, 8)} ·{' '}
                    {fecha(entrada.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function textoCantidad(item: NonNullable<Awaited<ReturnType<typeof getCompra>>>): string {
  const unidad = item.unidad ?? 'u';
  return `${formatearCantidad(item.cantidad_sugerida)} ${unidad}`;
}
