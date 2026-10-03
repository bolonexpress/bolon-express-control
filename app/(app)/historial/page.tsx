import { FilterBar } from '@/components/history/filter-bar';
import { HistorialBrowser } from '@/components/history/history-browser';
import { MensajeBanner } from '@/components/catalog/catalog-header';
import { Aviso } from '@/components/ui/empty-state';
import { IconAviso } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { historialFiltrosSchema } from '@/lib/validation/history';
import { requirePagePermission } from '@/server/auth/guards';
import { listHistorial, listOpcionesHistorial } from '@/server/repositories/history';
import { PERMISOS } from '@/types/domain';

/**
 * Historial de movimientos con filtros y paginacion keyset (Fase 7).
 * Ruta protegida con `history:read`. La primera pagina se renderiza en el
 * servidor desde los searchParams (URL compartible); el "Cargar mas" del
 * cliente la continua con `consultarHistorialAction`.
 *
 * Fase 9: el titulo no dice "Historial" sino "Todo lo que ha pasado", que es
 * lo que alguien busca al abrirla; el aviso de filtros invalidos pasa a
 * `Aviso` para que se lea como mensaje y no como parte de la tabla.
 */
export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission(PERMISOS.historyRead);

  const { mensaje, aviso, ...resto } = await searchParams;

  // Los filtros llegan de la URL: si no validan, se ensenan vacios con el
  // mensaje (un URL manipulado debe degradar, nunca reventar la pagina).
  const parsed = historialFiltrosSchema.safeParse({
    desde: typeof resto.desde === 'string' ? resto.desde : null,
    hasta: typeof resto.hasta === 'string' ? resto.hasta : null,
    tipo: typeof resto.tipo === 'string' ? resto.tipo : null,
    productoId: typeof resto.producto === 'string' ? resto.producto : null,
    usuarioId: typeof resto.usuario === 'string' ? resto.usuario : null,
    cursor: null,
  });

  const filtros = parsed.success
    ? parsed.data
    : { desde: null, hasta: null, tipo: null, productoId: null, usuarioId: null, cursor: null };

  const errorFiltros = parsed.success ? null : 'Uno o más filtros no son válidos y se ignoraron.';

  const [pagina, opciones] = await Promise.all([listHistorial(filtros), listOpcionesHistorial()]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Todo lo que ha pasado"
        descripcion={`${
          pagina.filas.length === 0 ? 'Sin resultados. ' : ''
        }Cada entrada, cada salida y cada corrección, con la fecha y quién la anotó. Lo que se anuló sale tachado: ya no cambia el inventario, pero sigue aquí.`}
        ayuda={{
          titulo: 'Todo lo que ha pasado',
          resumen:
            'Aquí se lee el historial completo: qué entró, qué salió y quién lo anotó. Sirve para buscar una entrada antigua o para saber quién tocó algo.',
          pasos: [
            'Toca «Filtrar» y elige un día, un producto o una persona.',
            'Toca una línea para ver el detalle y la foto.',
            'Si algo está mal, abre esa línea y anúlalo con un motivo.',
          ],
          nota: 'Lo anulado se ve tachado y ya no suma ni resta: por eso el inventario sigue cuadrando.',
        }}
      />

      <MensajeBanner texto={typeof mensaje === 'string' ? mensaje : undefined} />
      {aviso || errorFiltros ? (
        <Aviso tono="aviso" icono={<IconAviso size={24} />}>
          {typeof aviso === 'string' ? aviso : errorFiltros}
        </Aviso>
      ) : null}

      <FilterBar filtros={filtros} opciones={opciones} />

      <HistorialBrowser filasIniciales={pagina.filas} nextCursorInicial={pagina.nextCursor} filtros={{
        desde: filtros.desde,
        hasta: filtros.hasta,
        tipo: filtros.tipo,
        productoId: filtros.productoId,
        usuarioId: filtros.usuarioId,
      }} />
    </div>
  );
}