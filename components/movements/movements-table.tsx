import Link from 'next/link';

import { ANULACION_MOTIVO_LABEL, MOVIMIENTO_MOTIVO_LABEL, MOVIMIENTO_TIPO_LABEL } from '@/types/domain';
import type { MovimientoRow } from '@/server/repositories/movements';

/**
 * Listado de movimientos. Movil: una tarjeta por movimiento con su efecto
 * firmado (lo unico que de verdad importa al leer el libro). Escritorio: tabla.
 * Los movimientos anulados se muestran tachados y ya no afectan al stock.
 */
export function MovementsTable({ movimientos }: { movimientos: MovimientoRow[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        Todavía no hay movimientos registrados.
      </p>
    );
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es', {
      timeZone: 'America/Guayaquil',
      dateStyle: 'short',
      timeStyle: 'short',
    });

  const signo = (valor: number | null) => (valor === null ? '—' : valor > 0 ? `+${valor}` : `${valor}`);

  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {movimientos.map((m) => (
          <li key={m.id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{m.producto}</p>
                <p className="text-xs text-texto-suave">
                  {m.codigo} · {fecha(m.created_at)}
                </p>
              </div>
              <TipoBadge tipo={m.tipo} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-texto-suave">Cantidad</dt>
                <dd className="font-semibold text-texto">
                  {signo(m.delta_cantidad)} {m.unidad_original ?? ''}
                </dd>
              </div>
              <div>
                <dt className="text-texto-suave">Peso</dt>
                <dd className="font-semibold text-texto">
                  {m.delta_peso_kg === null ? '—' : `${signo(m.delta_peso_kg)} kg`}
                </dd>
              </div>
              <div>
                <dt className="text-texto-suave">Motivo</dt>
                <dd className="font-medium text-texto">{MOVIMIENTO_MOTIVO_LABEL[m.motivo]}</dd>
              </div>
              <div>
                <dt className="text-texto-suave">Registró</dt>
                <dd className="font-medium text-texto">{m.registrado_por ?? '—'}</dd>
              </div>
            </dl>

            {m.anulacion_id ? (
              <p className="mt-3 rounded-lg bg-superficie-alterna px-3 py-2 text-xs text-texto-suave">
                Anulado por {ANULACION_MOTIVO_LABEL[m.anulacion_motivo ?? 'otro']}
                {m.anulacion_detalle ? ` — ${m.anulacion_detalle}` : ''}
              </p>
            ) : null}

            <Link
              href={`/movimientos/${m.id}`}
              className="mt-3 inline-block text-sm font-medium text-texto underline"
            >
              Ver detalle
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde text-xs uppercase tracking-wide text-texto-suave">
            <tr>
              <th scope="col" className="px-4 py-3">Código</th>
              <th scope="col" className="px-4 py-3">Producto</th>
              <th scope="col" className="px-4 py-3">Tipo</th>
              <th scope="col" className="px-4 py-3">Motivo</th>
              <th scope="col" className="px-4 py-3 text-right">Cantidad</th>
              <th scope="col" className="px-4 py-3 text-right">Peso</th>
              <th scope="col" className="px-4 py-3">Registró</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {movimientos.map((m) => (
              <tr key={m.id} className={m.anulacion_id ? 'bg-fondo text-texto-suave' : undefined}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{m.codigo}</td>
                <td className="px-4 py-3">
                  <span className="block font-medium text-texto">{m.producto}</span>
                  <span className="block text-xs text-texto-suave">
                    {m.producto_codigo} · {fecha(m.created_at)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <TipoBadge tipo={m.tipo} />
                </td>
                <td className="px-4 py-3">{MOVIMIENTO_MOTIVO_LABEL[m.motivo]}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {signo(m.delta_cantidad)} {m.unidad_original ?? ''}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {m.delta_peso_kg === null ? '—' : `${signo(m.delta_peso_kg)} kg`}
                </td>
                <td className="px-4 py-3">{m.registrado_por ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {m.anulacion_id ? 'Anulado' : 'Vigente'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/movimientos/${m.id}`}
                    className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-fondo"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TipoBadge({ tipo }: { tipo: MovimientoRow['tipo'] }) {
  const clases =
    tipo === 'entrada'
      ? 'bg-exito-suave text-exito'
      : tipo === 'salida'
        ? 'bg-aviso-suave text-aviso'
        : 'bg-info-suave text-info';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${clases}`}>
      {MOVIMIENTO_TIPO_LABEL[tipo]}
    </span>
  );
}
