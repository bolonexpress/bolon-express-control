import { inputClass, labelClass } from '@/components/ui/field';
import { MOVIMIENTO_TIPO, MOVIMIENTO_TIPO_LABEL } from '@/types/domain';
import type { HistorialFiltros } from '@/types/domain';
import type { HistorialOpciones } from '@/types/domain';

/**
 * Barra de filtros del historial (Fase 7). Navegacion por URL (GET): los
 * filtros quedan en la direccion, se comparten y sobreviven al "Compartir
 * enlace" del equipo. En movil el panel se pliega/despliega con el
 * `<details>`; en escritorio queda siempre abierto.
 */
export function FilterBar({
  filtros,
  opciones,
}: {
  filtros: Omit<HistorialFiltros, 'cursor'>;
  opciones: HistorialOpciones;
}) {
  const hayFiltros = Boolean(
    filtros.desde || filtros.hasta || filtros.tipo || filtros.productoId || filtros.usuarioId,
  );

  return (
    <details open className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
      <summary className="cursor-pointer text-sm font-semibold text-texto sm:cursor-default sm:list-none">
        Filtros
        {hayFiltros ? (
          <span className="ml-2 rounded-full bg-marca-fuerte px-2 py-0.5 text-xs font-normal text-white">
            activos
          </span>
        ) : null}
      </summary>

      <form
        method="GET"
        action="/historial"
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="space-y-1">
          <label htmlFor="f-desde" className={labelClass}>
            Desde
          </label>
          <input
            id="f-desde"
            name="desde"
            type="date"
            defaultValue={filtros.desde ?? ''}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="f-hasta" className={labelClass}>
            Hasta
          </label>
          <input
            id="f-hasta"
            name="hasta"
            type="date"
            defaultValue={filtros.hasta ?? ''}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="f-tipo" className={labelClass}>
            Tipo
          </label>
          <select id="f-tipo" name="tipo" defaultValue={filtros.tipo ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {MOVIMIENTO_TIPO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {MOVIMIENTO_TIPO_LABEL[tipo]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-producto" className={labelClass}>
            Producto
          </label>
          <select
            id="f-producto"
            name="producto"
            defaultValue={filtros.productoId ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {opciones.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.codigo ? ` (${p.codigo})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-usuario" className={labelClass}>
            Responsable
          </label>
          <select
            id="f-usuario"
            name="usuario"
            defaultValue={filtros.usuarioId ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {opciones.usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-marca-fuerte px-4 py-2.5 text-sm font-semibold text-white hover:bg-marca sm:flex-none"
          >
            Aplicar filtros
          </button>
          {hayFiltros ? (
            <a
              href="/historial"
              className="rounded-lg border border-borde px-4 py-2.5 text-sm font-semibold text-texto hover:bg-fondo"
            >
              Limpiar
            </a>
          ) : null}
        </div>
      </form>
    </details>
  );
}
