import { UsersBrowser } from '@/components/users/users-browser';
import { UsersFilterBar } from '@/components/users/users-filter-bar';
import { ResumenRoles } from '@/components/users/users-table';
import { BotonEnlace } from '@/components/ui/button';
import { Aviso, EstadoVacio } from '@/components/ui/empty-state';
import { IconAviso, IconMas, IconPersona } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { usuariosFiltrosSchema } from '@/lib/validation/users';
import { requirePagePermission } from '@/server/auth/guards';
import { listUsuariosPagina } from '@/server/repositories/users';
import { PERMISOS } from '@/types/domain';

/**
 * Listado de personas (Fase 10).
 *
 * Un solo permiso, `users:manage`: no existe `users:read`, asi que el boton de
 * "añadir" no necesita una segunda comprobacion.
 *
 * La primera pagina se arma en el servidor desde `searchParams` (URL
 * compartible, recarga sin JS) y de ahi la recibe `UsersBrowser`, que pide las
 * siguientes con cursor.
 */
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requirePagePermission(PERMISOS.usersManage);
  const params = await searchParams;

  const parsed = usuariosFiltrosSchema.safeParse({
    busqueda: typeof params.busqueda === 'string' ? params.busqueda : null,
    rol: typeof params.rol === 'string' ? params.rol : null,
    estado: typeof params.estado === 'string' ? params.estado : undefined,
    cursor: null,
  });

  const filtros = parsed.success
    ? parsed.data
    : { busqueda: null, rol: null, estado: 'todos' as const, cursor: null };

  const errorFiltros = parsed.success
    ? null
    : 'No entendí ese filtro, así que te muestro todas las personas.';

  const pagina = await listUsuariosPagina(filtros);
  const hayFiltros = Boolean(filtros.busqueda || filtros.rol || filtros.estado !== 'todos');

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Personas"
        descripcion="Quién entra a la app y qué puede hacer cada uno. Nadie se borra: a quien se va de la tienda se le desactiva y su historial se queda."
        acciones={
          <BotonEnlace
            href="/admin/usuarios/nuevo"
            tamano="lg"
            icono={<IconMas size={24} />}
          >
            Añadir persona
          </BotonEnlace>
        }
        ayuda={{
          titulo: 'Personas',
          resumen:
            'Aquí entra y sale la gente de la tienda, y qué puede ver o hacer cada persona.',
          pasos: [
            'Toca "Añadir persona": escribe su correo, su nombre y su rol. La app te da una contraseña temporal.',
            'Filtra por rol o por estado cuando la lista crezca, para encontrar a alguien rápido.',
            'Para quitarle el acceso, desactívala. No se borra nada y su historial se queda.',
          ],
          nota: 'Nunca se puede desactivar tu propia cuenta ni dejar a la tienda sin ningún administrador.',
        }}
      />

      <ResumenRoles />

      <UsersFilterBar filtros={filtros} />

      {errorFiltros ? (
        <Aviso tono="aviso" icono={<IconAviso size={24} />}>
          {errorFiltros}
        </Aviso>
      ) : null}

      {pagina.filas.length === 0 ? (
        <EstadoVacio
          icono={<IconPersona size={32} />}
          titulo={hayFiltros ? 'No hay nadie con eso' : 'Todavía no hay nadie'}
          descripcion={
            hayFiltros
              ? 'Prueba con otro filtro, o limpia la búsqueda para ver a todas las personas.'
              : 'Añade a la primera persona para que pueda entrar a la app.'
          }
          accion={
            hayFiltros ? (
              <BotonEnlace href="/admin/usuarios" variante="secundario">
                Ver todas
              </BotonEnlace>
            ) : (
              <BotonEnlace
                href="/admin/usuarios/nuevo"
                icono={<IconMas size={22} />}
              >
                Añadir persona
              </BotonEnlace>
            )
          }
        />
      ) : (
        <UsersBrowser
          usuariosIniciales={pagina.filas}
          nextCursorInicial={pagina.nextCursor}
          filtros={filtros}
          yoId={sesion.user.id}
        />
      )}
    </div>
  );
}