import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AnularForm } from '@/components/movements/anular-form';
import { tarjetaClass } from '@/components/ui/field';
import { HelpButton } from '@/components/ui/help-button';
import { formatearCantidad } from '@/lib/format/units';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listFotosDelMovimiento } from '@/server/repositories/history';
import { getMovimiento } from '@/server/repositories/movements';
import {
  ANULACION_MOTIVO_LABEL,
  MOVIMIENTO_MOTIVO_LABEL,
  MOVIMIENTO_TIPO_LABEL,
  PERMISOS,
} from '@/types/domain';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detalle de un movimiento y su anulacion. Ruta de lectura (`movements:read`);
 * el formulario de anulacion solo se muestra con `movements:anular` y cuando el
 * movimiento sigue vigente.
 */
export default async function DetalleMovimientoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.movementsRead);

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const movimiento = await getMovimiento(id);
  if (!movimiento) notFound();

  const puedeAnular = contextHasPermission(context, PERMISOS.movementsAnular) && !movimiento.anulacion_id;
  const puedeVerFotos = contextHasPermission(context, PERMISOS.photosRead);
  // Solo el detalle firma fotos (el listado pinta un icono). Sin photos:read
  // la policy de storage falla y llegan filas sin url: el placeholder las cubre.
  const fotos = puedeVerFotos ? await listFotosDelMovimiento(movimiento.id) : [];

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es', {
      timeZone: 'America/Guayaquil',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const filas: [string, string][] = [
    ['Código', movimiento.codigo],
    ['Producto', `${movimiento.producto} (${movimiento.producto_codigo})`],
    ['SKU', movimiento.sku],
    ['Tipo', MOVIMIENTO_TIPO_LABEL[movimiento.tipo]],
    ['Motivo', MOVIMIENTO_MOTIVO_LABEL[movimiento.motivo]],
    [
      'Cantidad capturada',
      movimiento.cantidad_original !== null
        ? `${formatearCantidad(movimiento.cantidad_original)} ${movimiento.unidad_original ?? ''}`.trim()
        : '—',
    ],
    [
      'Cantidad en unidad base',
      movimiento.cantidad === null
        ? '—'
        : `${formatearCantidad(movimiento.cantidad)} (efecto ${formatearCantidad(movimiento.delta_cantidad)})`,
    ],
    [
      'Peso',
      movimiento.peso_kg === null
        ? '—'
        : `${formatearCantidad(movimiento.peso_kg)} kg (efecto ${formatearCantidad(movimiento.delta_peso_kg)} kg)`,
    ],
    ['Modo de control', movimiento.control_mode],
    ['Registró', `${movimiento.registrado_por ?? '—'} · ${fecha(movimiento.created_at)}`],
    ['Observaciones', movimiento.notes ?? '—'],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/movimientos" className="text-sm font-medium text-texto-suave hover:text-texto">
          ← Movimientos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-texto">
            {movimiento.codigo} · {movimiento.producto}
          </h1>
          <HelpButton
            titulo="Detalle de un movimiento"
            resumen="Esta es la constancia de una entrada, una salida o un ajuste. Dice qué se movió, en qué cantidad y qué foto se tomó."
            pasos={[
              'Abajo del todo, «Detalle» dice el producto, la cantidad y el motivo.',
              'La sección de fotos muestra lo que se tomó en el momento de anotarlo.',
              'Si está mal, abajo se puede anular con un motivo.',
            ]}
            nota="Anular no borra: deja el movimiento escrito, pero ya no suma ni resta al inventario."
          />
        </div>
      </div>

      {movimiento.anulacion_id ? (
        <div className="rounded-xl bg-superficie-alterna p-4 ring-1 ring-borde">
          <p className="text-sm font-semibold text-texto">
            Anulado por {ANULACION_MOTIVO_LABEL[movimiento.anulacion_motivo ?? 'otro']}
          </p>
          <p className="mt-1 text-sm text-texto-suave">
            {movimiento.anulacion_detalle ?? 'Sin detalle.'}
          </p>
          <p className="mt-1 text-xs text-texto-suave">
            {movimiento.anulado_at ? fecha(movimiento.anulado_at) : ''} · Este movimiento ya no
            afecta al stock.
          </p>
        </div>
      ) : null}

      <section className={tarjetaClass}>
        <h2 className="text-sm font-semibold text-texto">Detalle</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {filas.map(([termino, valor]) => (
            <div key={termino}>
              <dt className="text-xs uppercase tracking-wide text-texto-suave">{termino}</dt>
              <dd className="text-sm font-medium text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={tarjetaClass}>
        <h2 className="text-sm font-semibold text-texto">
          Fotografía{movimiento.fotos_count > 1 ? 's' : ''} del movimiento
        </h2>
        {movimiento.fotos_count === 0 ? (
          <p className="mt-2 text-sm text-texto-suave">
            Sin fotos. Debería haber al menos una: el movimiento se registra con foto.
          </p>
        ) : !puedeVerFotos ? (
          <p className="mt-2 text-sm text-texto-suave">
            Hay {movimiento.fotos_count} foto(s), pero tu rol no tiene {PERMISOS.photosRead} para
            verlas.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {fotos.map((foto) => (
              <li key={foto.id} className="overflow-hidden rounded-lg ring-1 ring-borde">
                {foto.url ? (
                  // URL firmada de corta vida (2 min): no se puede rastrear el
                  // path interno del bucket ni compartirse una URL eterna.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto.url}
                    alt={`Foto del movimiento ${movimiento.codigo}`}
                    className="h-auto w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-superficie-alterna text-sm text-texto-suave">
                    La foto existe pero no se pudo firmar su URL. Recarga en un momento.
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {movimiento.anulacion_id ? (
        <p className="text-sm text-texto-suave">
          Un movimiento anulado no se puede volver a anular ni modificar. Si el error persiste,
          registra un movimiento nuevo con el motivo «Corrección de inventario».
        </p>
      ) : puedeAnular ? (
        <section className={tarjetaClass}>
          <h2 className="text-sm font-semibold text-texto">Anular movimiento</h2>
          <p className="mt-1 mb-4 text-sm text-texto-suave">
            La anulación no borra nada: guarda el snapshot del movimiento y lo excluye del stock.
          </p>
          <AnularForm movementId={movimiento.id} />
        </section>
      ) : (
        <p className="text-sm text-texto-suave">
          No tienes el permiso {PERMISOS.movementsAnular} para anular movimientos.
        </p>
      )}
    </div>
  );
}
