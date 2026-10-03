import { inputClass, labelClass } from '@/components/ui/field';
import { AUDITORIA_ACCIONES, AUDITORIA_ACCION_LABEL, AUDITORIA_ENTIDADES, AUDITORIA_ENTIDAD_LABEL } from '@/types/domain';
import type { AuditoriaOpciones } from '@/types/domain';
import type { AuditoriaFiltrosParsed } from '@/lib/validation/audit';

/**
 * Filtros del panel de auditoria (Fase 8). Como en el historial: GET y URL
 * compartible; en movil el panel se pliega con `<details>`.
 */
export function AuditFilters({
  filtros,
  opciones,
}: {
  filtros: Omit<AuditoriaFiltrosParsed, 'cursor'>;
  opciones: AuditoriaOpciones;
}) {
  const hayFiltros = Boolean(
    filtros.desde || filtros.hasta || filtros.accion || filtros.entidad || filtros.usuarioId,
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
        action="/admin/auditoria"
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="space-y-1">
          <label htmlFor="a-desde" className={labelClass}>
            Desde
          </label>
          <input
            id="a-desde"
            name="desde"
            type="date"
            defaultValue={filtros.desde ?? ''}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="a-hasta" className={labelClass}>
            Hasta
          </label>
          <input
            id="a-hasta"
            name="hasta"
            type="date"
            defaultValue={filtros.hasta ?? ''}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="a-accion" className={labelClass}>
            Acción
          </label>
          <select
            id="a-accion"
            name="accion"
            defaultValue={filtros.accion ?? ''}
            className={inputClass}
          >
            <option value="">Todas</option>
            {AUDITORIA_ACCIONES.map((a) => (
              <option key={a} value={a}>
                {AUDITORIA_ACCION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="a-entidad" className={labelClass}>
            Entidad
          </label>
          <select
            id="a-entidad"
            name="entidad"
            defaultValue={filtros.entidad ?? ''}
            className={inputClass}
          >
            <option value="">Todas</option>
            {AUDITORIA_ENTIDADES.map((e) => (
              <option key={e} value={e}>
                {AUDITORIA_ENTIDAD_LABEL[e] ?? e}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="a-usuario" className={labelClass}>
            Responsable
          </label>
          <select
            id="a-usuario"
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
              href="/admin/auditoria"
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
