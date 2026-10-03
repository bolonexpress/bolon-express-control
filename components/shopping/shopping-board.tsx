import Link from 'next/link';

import { EstadoButtons } from '@/components/shopping/estado-buttons';
import { formatearCantidad } from '@/lib/format/units';
import { COMPRAS_ESTADO_LABEL, COMPRAS_TRANSICIONES, PRIORIDAD_LABEL } from '@/types/domain';
import type { CompraItem } from '@/types/domain';

const ORDEN_ESTADO: readonly CompraItem['estado'][] = [
  'pendiente',
  'en_proceso',
  'comprado',
  'descartado',
];

const ESTILO_ESTADO: Record<CompraItem['estado'], string> = {
  pendiente: 'text-texto',
  en_proceso: 'text-aviso',
  comprado: 'text-exito',
  descartado: 'text-texto-tenue line-through',
};

function textoCantidad(item: CompraItem): string {
  const unidad = item.unidad ?? 'u';
  return `${formatearCantidad(item.cantidad_sugerida)} ${unidad}`;
}

function TarjetaPendiente({ item, puedeEscribir }: { item: CompraItem; puedeEscribir: boolean }) {
  const transiciones = COMPRAS_TRANSICIONES[item.estado];

  return (
    <li
      className={`rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde ${
        item.estado === 'descartado' ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${ESTILO_ESTADO[item.estado]}`}>
            <Link href={`/compras/${item.id}`} className="hover:underline">
              {item.producto ?? item.descripcion}
            </Link>
          </p>
          <p className="text-xs text-texto-suave">
            {item.codigo}
            {' · '}
            {textoCantidad(item)}
            {item.proveedor ? ` · ${item.proveedor}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
            item.prioridad === 1
              ? 'bg-peligro-suave text-peligro ring-peligro/30'
              : item.prioridad === 2
                ? 'bg-superficie-alterna text-texto ring-borde-fuerte/30'
                : 'bg-fondo text-texto-suave ring-borde/40'
          }`}
        >
          {PRIORIDAD_LABEL[item.prioridad as 1 | 2 | 3] ?? item.prioridad}
        </span>
      </div>

      {item.bajo_minimo && item.estado === 'pendiente' ? (
        <p className="mt-2 rounded-lg bg-aviso-suave px-3 py-1.5 text-xs text-aviso">
          ⚠️ Inventario bajo (stock actual: {formatearCantidad(item.stock_principal)}).
        </p>
      ) : null}

      {puedeEscribir && transiciones.length > 0 ? (
        <div className="mt-3">
          <EstadoButtons id={item.id} transiciones={transiciones} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Tablero de compras agrupado por estado (kanban vertical mobile-first: en la
 * pantalla del telefono las columnas apiladas se leen mejor que un kanban con
 * scroll horizontal). Los estados terminales quedan al final y atenuados.
 */
export function ShoppingBoard({
  items,
  puedeEscribir,
}: {
  items: CompraItem[];
  puedeEscribir: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borde">
        No hay pendientes. Agrega el primero arriba.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {ORDEN_ESTADO.map((estado) => {
        const delEstado = items.filter((i) => i.estado === estado);
        if (delEstado.length === 0) return null;

        const esTerminal = estado === 'comprado' || estado === 'descartado';
        return (
          <section key={estado} aria-labelledby={`compras-${estado}`}>
            <h2
              id={`compras-${estado}`}
              className={`mb-2 text-sm font-semibold uppercase tracking-wide ${
                esTerminal ? 'text-texto-tenue' : 'text-texto-suave'
              }`}
            >
              {COMPRAS_ESTADO_LABEL[estado]}{' '}
              <span className="text-xs font-normal text-texto-tenue">({delEstado.length})</span>
            </h2>
            <ul className="space-y-2">
              {delEstado.map((item) => (
                <TarjetaPendiente
                  key={item.id}
                  item={item}
                  puedeEscribir={puedeEscribir && !esTerminal}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
