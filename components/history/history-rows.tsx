import Link from 'next/link';

import { BotonFoto } from '@/components/photos/photo-viewer';
import { formatearCantidad } from '@/lib/format/units';
import { MOVIMIENTO_MOTIVO_LABEL, MOVIMIENTO_TIPO_LABEL } from '@/types/domain';
import type { HistorialRow } from '@/types/domain';

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleString('es', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const TIPO_PILL: Record<HistorialRow['tipo'], string> = {
  entrada: 'bg-exito-suave text-exito ring-exito/30',
  salida: 'bg-peligro-suave text-peligro ring-peligro/30',
  ajuste: 'bg-aviso-suave text-aviso ring-aviso/40',
};

function Efecto({ m }: { m: HistorialRow }) {
  // Lo unico que importa al leer el libro: el efecto firmado (delta_*).
  if (m.delta_cantidad !== null && m.delta_cantidad !== 0) {
    return (
      <>
        {m.delta_cantidad > 0 ? '+' : ''}
        {formatearCantidad(m.delta_cantidad)} {m.unidad_original ?? 'u'}
      </>
    );
  }
  if (m.delta_peso_kg !== null && m.delta_peso_kg !== 0) {
    return (
      <>
        {m.delta_peso_kg > 0 ? '+' : ''}
        {formatearCantidad(m.delta_peso_kg)} kg
      </>
    );
  }
  return <>—</>;
}

/**
 * Filas del historial (Fase 7). Componentes PUROS: los usa la pagina en el
 * servidor y tambien el boton "Cargar mas" del cliente, asi que aqui no se
 * importa nada de `server/`.
 *
 * El listado NUNCA carga las imagenes: solo el conteo (ADR-014, Fase 7). Lo que
 * hace el conteo es abrir el VISOR (Fase 12B), que si pide y firma las fotos en
 * ese momento: la decision de no gastar ancho de banda se mantiene, y aun asi
 * la foto se puede ver en grande desde el listado.
 */
export function HistorialTarjetas({ filas }: { filas: HistorialRow[] }) {
  return (
    <ul className="space-y-2 sm:hidden sm:space-y-3">
      {filas.map((m) => {
        const anulado = m.anulacion_id !== null;
        return (
          <li
            key={m.id}
            className={`rounded-xl bg-superficie p-3 shadow-sm ring-1 ring-borde sm:p-4 ${anulado ? 'opacity-75' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-semibold ${
                    anulado ? 'text-texto-suave line-through' : 'text-texto'
                  }`}
                >
                  <Link href={`/movimientos/${m.id}`} className="hover:underline">
                    {m.codigo} · {m.producto}
                  </Link>
                </p>
                <p className="text-xs text-texto-suave">{horaLocal(m.created_at)}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TIPO_PILL[m.tipo]}`}
              >
                {MOVIMIENTO_TIPO_LABEL[m.tipo]}
              </span>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div>
                <dt className="text-texto-suave">Efecto</dt>
                <dd className="font-semibold tabular-nums text-texto">
                  <Efecto m={m} />
                </dd>
              </div>
              <div>
                <dt className="text-texto-suave">Responsable</dt>
                <dd className="font-medium text-texto">{m.registrado_por ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-texto-suave">Motivo</dt>
                <dd className="text-texto">{MOVIMIENTO_MOTIVO_LABEL[m.motivo]}</dd>
              </div>
              <div className="flex items-end gap-2">
                <BotonFoto
                  movimientoId={m.id}
                  codigo={m.codigo}
                  fecha={m.created_at}
                  conteo={m.fotos_count}
                />
                {anulado ? (
                  <span className="rounded bg-marca px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Anulado
                  </span>
                ) : null}
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** Escritorio: tabla. Mismo orden de columnas que la tarjeta. */
export function HistorialTabla({ filas }: { filas: HistorialRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
      <table className="min-w-full divide-y divide-borde text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-texto-suave">
            <th className="px-4 py-3 font-semibold">ID · Fecha</th>
            <th className="px-4 py-3 font-semibold">Tipo</th>
            <th className="px-4 py-3 font-semibold">Producto</th>
            <th className="px-4 py-3 text-right font-semibold">Efecto</th>
            <th className="px-4 py-3 font-semibold">Responsable</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((m) => {
            const anulado = m.anulacion_id !== null;
            return (
              <tr key={m.id} className={`align-top hover:bg-fondo ${anulado ? 'opacity-75' : ''}`}>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/movimientos/${m.id}`}
                    className={`font-medium hover:underline ${
                      anulado ? 'text-texto-suave line-through' : 'text-texto'
                    }`}
                  >
                    {m.codigo}
                  </Link>
                  <span className="block text-xs text-texto-suave">{horaLocal(m.created_at)}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TIPO_PILL[m.tipo]}`}
                  >
                    {MOVIMIENTO_TIPO_LABEL[m.tipo]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`block font-medium ${
                      anulado ? 'text-texto-suave line-through' : 'text-texto'
                    }`}
                  >
                    {m.producto}
                  </span>
                  <span className="block text-xs text-texto-suave">
                    {MOVIMIENTO_MOTIVO_LABEL[m.motivo]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-texto">
                  <Efecto m={m} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-texto-suave">{m.registrado_por ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {anulado ? (
                    <span className="rounded bg-marca px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Anulado
                    </span>
                  ) : (
                    <span className="rounded bg-exito-suave px-1.5 py-0.5 text-[10px] font-semibold uppercase text-exito ring-1 ring-exito/20">
                      Vigente
                    </span>
                  )}
                  {m.fotos_count > 0 ? (
                    <BotonFoto
                      movimientoId={m.id}
                      codigo={m.codigo}
                      fecha={m.created_at}
                      conteo={m.fotos_count}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
