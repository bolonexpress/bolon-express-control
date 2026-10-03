import { formatearCantidad } from '@/lib/format/units';
import { AUDITORIA_ACCION_LABEL, AUDITORIA_ENTIDAD_LABEL } from '@/types/domain';
import type { AuditoriaRow } from '@/types/domain';
import type { Json } from '@/types/database';

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleString('es', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const ACCION_PILL: Partial<Record<AuditoriaRow['accion'], string>> = {
  crear: 'bg-exito-suave text-exito ring-exito/30',
  actualizar: 'bg-superficie-alterna text-texto ring-borde-fuerte/30',
  anular: 'bg-aviso-suave text-aviso ring-aviso/40',
  eliminar: 'bg-peligro-suave text-peligro ring-peligro/30',
  login: 'bg-superficie-alterna text-texto-suave ring-borde-fuerte/30',
  logout: 'bg-superficie-alterna text-texto-suave ring-borde-fuerte/30',
};

/** Campos que el diff no necesita repetir porque son ruido de infraestructura. */
const IGNORAR = new Set(['updated_at', 'created_at', 'display_id']);

function esObjeto(v: unknown): v is Record<string, Json> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function textoValor(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'number') return formatearCantidad(v);
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  return JSON.stringify(v);
}

/**
 * Diferencia antes → despues de `datos`: solo los campos que CAMBIARON
 * (para `actualizar`), el `after` (para `crear`/config) o el `before`
 * (para `eliminar`). El diff se hace al leer: es presentacion de la fila, no
 * una transformacion de la bitacora.
 */
export function DiffDatos({ datos }: { datos: Json }) {
  if (!esObjeto(datos)) return null;

  const before = esObjeto(datos.before) ? datos.before : null;
  const after = esObjeto(datos.after) ? datos.after : null;

  if (!before && !after) return null;

  // Campos presentes en ambos lados, en orden del "antes".
  const camposBase = before ? Object.keys(before) : Object.keys(after ?? {});
  const campos = camposBase.filter((c) => !IGNORAR.has(c));

  const filas = campos
    .map((campo) => {
      const antes = before ? before[campo] : undefined;
      const despues = after ? after[campo] : undefined;
      return { campo, antes, despues, cambio: JSON.stringify(antes) !== JSON.stringify(despues) };
    })
    .filter((f) => before === null || after === null || f.cambio)
    .slice(0, 8);

  if (filas.length === 0) return null;

  return (
    <dl className="mt-2 space-y-1 text-xs">
      {filas.map(({ campo, antes, despues }) => (
        <div key={campo} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="font-mono text-texto-suave">{campo}</dt>
          <dd className="tabular-nums">
            {before !== null ? (
              <span className="text-peligro line-through">{textoValor(antes)}</span>
            ) : null}
            {before !== null && after !== null ? <span className="mx-1 text-texto-tenue">→</span> : null}
            {after !== null ? (
              <span className={before !== null ? 'font-medium text-exito' : 'text-texto'}>
                {textoValor(despues)}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BadgeAccion({ accion }: { accion: AuditoriaRow['accion'] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
        ACCION_PILL[accion] ?? 'bg-superficie-alterna text-texto-suave ring-borde-fuerte/30'
      }`}
    >
      {AUDITORIA_ACCION_LABEL[accion]}
    </span>
  );
}

/** Panel de auditoria: tarjeta movil / tabla escritorio con antes-despues. */
export function AuditoriaTarjetas({ filas }: { filas: AuditoriaRow[] }) {
  return (
    <ul className="space-y-3 sm:hidden">
      {filas.map((a) => (
        <li key={a.id} className="rounded-xl bg-superficie p-4 shadow-sm ring-1 ring-borde">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-texto">
                {AUDITORIA_ENTIDAD_LABEL[a.entidad] ?? a.entidad}
                {a.entidad_codigo ? <span className="text-texto-suave"> · {a.entidad_codigo}</span> : null}
              </p>
              <p className="text-xs text-texto-suave">
                {a.actor_email ?? 'anónimo'} · {horaLocal(a.created_at)}
              </p>
            </div>
            <BadgeAccion accion={a.accion} />
          </div>
          <DiffDatos datos={a.datos} />
          {a.ip_address ? (
            <p className="mt-2 text-xs text-texto-tenue">IP {a.ip_address}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AuditoriaTabla({ filas }: { filas: AuditoriaRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde sm:block">
      <table className="min-w-full divide-y divide-borde text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-texto-suave">
            <th className="px-4 py-3 font-semibold">Fecha</th>
            <th className="px-4 py-3 font-semibold">Acción</th>
            <th className="px-4 py-3 font-semibold">Entidad</th>
            <th className="px-4 py-3 font-semibold">Responsable</th>
            <th className="px-4 py-3 font-semibold">Antes → después</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((a) => (
            <tr key={a.id} className="align-top hover:bg-fondo">
              <td className="whitespace-nowrap px-4 py-3 text-texto">{horaLocal(a.created_at)}</td>
              <td className="px-4 py-3">
                <BadgeAccion accion={a.accion} />
              </td>
              <td className="px-4 py-3 text-texto">
                {AUDITORIA_ENTIDAD_LABEL[a.entidad] ?? a.entidad}
                {a.entidad_codigo ? (
                  <span className="block text-xs text-texto-suave">{a.entidad_codigo}</span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-texto-suave">{a.actor_email ?? '—'}</td>
              <td className="px-4 py-3">
                <DiffDatos datos={a.datos} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
