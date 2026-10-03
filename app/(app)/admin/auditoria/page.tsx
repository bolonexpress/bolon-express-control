import { AuditBrowser } from '@/components/audit/audit-browser';
import { AuditFilters } from '@/components/audit/audit-filters';
import { Aviso } from '@/components/ui/empty-state';
import { IconAviso } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { auditoriaFiltrosSchema } from '@/lib/validation/audit';
import { requirePagePermission } from '@/server/auth/guards';
import { listAuditoria, listOpcionesAuditoria } from '@/server/repositories/audit';
import { PERMISOS } from '@/types/domain';

/**
 * Panel de auditoria (solo admin: el permiso real es `audit:read`, sensible).
 * Lee `audit_logs` directo: la RLS (`audit_logs_select`) ya lo filtra.
 *
 * Fase 9: "Quién cambió qué" es el titulo que entiende quien entra aqui; el
 * aviso de filtros invalidos usa `Aviso` para que se lea como mensaje.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission(PERMISOS.auditRead);

  const resto = await searchParams;

  const parsed = auditoriaFiltrosSchema.safeParse({
    desde: typeof resto.desde === 'string' ? resto.desde : null,
    hasta: typeof resto.hasta === 'string' ? resto.hasta : null,
    accion: typeof resto.accion === 'string' ? resto.accion : null,
    entidad: typeof resto.entidad === 'string' ? resto.entidad : null,
    usuarioId: typeof resto.usuario === 'string' ? resto.usuario : null,
    cursor: null,
  });

  const filtros = parsed.success
    ? parsed.data
    : { desde: null, hasta: null, accion: null, entidad: null, usuarioId: null, cursor: null };

  const errorFiltros = parsed.success ? null : 'Uno o más filtros no son válidos y se ignoraron.';

  const [pagina, opciones] = await Promise.all([listAuditoria(filtros), listOpcionesAuditoria()]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Quién cambió qué"
        descripcion="Cada cambio que alguien hizo en la tienda, con su nombre y la hora. No se puede borrar ni editar: aquí queda escrito para siempre."
        ayuda={{
          titulo: 'Quién cambió qué',
          resumen:
            'Es el registro de todo lo que se ha tocado en la tienda. Solo lo ven los responsables, y no se puede modificar.',
          pasos: [
            'Filtra por día, por persona o por lo que se tocó.',
            'Toca un evento para ver el valor de antes y el de después.',
            'Si algo no debería haber pasado, corrígelo en su pantalla: aquí queda el rastro.',
          ],
          nota: 'Esta pantalla no se edita. Para arreglar algo hay que hacerlo donde se hizo el cambio.',
        }}
      />

      {errorFiltros ? (
        <Aviso tono="aviso" icono={<IconAviso size={24} />}>
          {errorFiltros}
        </Aviso>
      ) : null}

      <AuditFilters filtros={filtros} opciones={opciones} />

      <AuditBrowser
        filasIniciales={pagina.filas}
        nextCursorInicial={pagina.nextCursor}
        filtros={{
          desde: filtros.desde,
          hasta: filtros.hasta,
          accion: filtros.accion,
          entidad: filtros.entidad,
          usuarioId: filtros.usuarioId,
        }}
      />
    </div>
  );
}