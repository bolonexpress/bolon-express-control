import Link from 'next/link';

import { IconLapiz, IconInterrogacion, IconVer } from '@/components/ui/icons';
import { ROL_LABEL, type RolKey } from '@/lib/validation/users';
import type { UsuarioRow } from '@/types/domain';

/**
 * Listado de usuarios: tarjeta en movil, tabla en escritorio.
 *
 * Fase 9 aplicado: una tarjeta por persona en < 640px (sin scroll horizontal),
 * tabla a partir de ahi. El estado nunca depende solo del color —ademas del
 * punto verde, dice "Activo" o "Inactivo"— porque con luz de tienda el verde y
 * el gris se confunden.
 */

function fecha(iso: string | null): string {
  if (!iso) return 'Nunca ha entrado';
  return new Date(iso).toLocaleString('es', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function etiquetaRol(key: string): string {
  return ROL_LABEL[key as RolKey] ?? key;
}

function correo(usuario: UsuarioRow) {
  return usuario.email ?? 'Correo no disponible';
}

export function UsersTable({
  usuarios,
  esYO,
}: {
  usuarios: UsuarioRow[];
  /** Marca la fila del usuario con sesion: no se puede desactivar ni quitarse el rol. */
  esYO: (id: string) => boolean;
}) {
  if (usuarios.length === 0) return null;

  return (
    <>
      {/* Movil: una tarjeta por persona. */}
      <ul className="space-y-3 sm:hidden">
        {usuarios.map((usuario) => (
          <li
            key={usuario.id}
            className={`rounded-2xl bg-superficie p-4 shadow-tarjeta ring-1 ring-borde ${
              usuario.is_active ? '' : 'opacity-75'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-texto">{usuario.full_name}</p>
                <p className="truncate text-sm text-texto-suave">{correo(usuario)}</p>
              </div>
              <EstadoBadge usuario={usuario} />
            </div>

            <p className="mt-2 text-sm text-texto-suave">
              {usuario.roleKeys.length > 0
                ? usuario.roleKeys.map(etiquetaRol).join(' · ')
                : 'Sin rol asignado'}
            </p>
            <p className="mt-1 text-xs text-texto-tenue">
              Último acceso: {fecha(usuario.last_seen_at)}
            </p>

            <Link
              href={`/admin/usuarios/${usuario.id}`}
              className="mt-3 inline-flex min-h-6 items-center justify-center gap-2 rounded-xl bg-superficie px-4 text-base font-semibold text-marca ring-2 ring-marca/35 hover:bg-marca-lima/25"
            >
              <IconLapiz size={22} />
              <span>Ver y editar</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla. */}
      <div className="hidden overflow-x-auto rounded-2xl bg-superficie shadow-tarjeta ring-1 ring-borde sm:block">
        <table className="w-full text-left text-base">
          <caption className="sr-only">
            Personas con acceso a la app, con su rol, su estado y su último acceso
          </caption>
          <thead>
            <tr className="border-b border-borde">
              <th scope="col" className="px-4 py-3 font-semibold text-texto">
                Nombre
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-texto">
                Correo
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-texto">
                Rol
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-texto">
                Estado
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-texto">
                Último acceso
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr
                key={usuario.id}
                className={`border-b border-borde last:border-0 ${
                  usuario.is_active ? '' : 'bg-superficie-alterna'
                }`}
              >
                <th scope="row" className="px-4 py-3 font-semibold text-texto">
                  <span className="flex items-center gap-2">
                    {usuario.full_name}
                    {esYO(usuario.id) ? (
                      <span className="rounded-full bg-info-suave px-2 py-0.5 text-xs font-medium text-info">
                        Tú
                      </span>
                    ) : null}
                  </span>
                  {usuario.phone ? (
                    <span className="block text-xs font-normal text-texto-suave">
                      {usuario.phone}
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-3 text-texto-suave">{correo(usuario)}</td>
                <td className="px-4 py-3 text-texto-suave">
                  {usuario.roleKeys.length > 0
                    ? usuario.roleKeys.map(etiquetaRol).join(' · ')
                    : 'Sin rol asignado'}
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge usuario={usuario} />
                </td>
                <td className="px-4 py-3 text-sm text-texto-suave">
                  {fecha(usuario.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/usuarios/${usuario.id}`}
                    className="inline-flex min-h-6 items-center gap-2 rounded-xl px-3 font-semibold text-marca ring-2 ring-marca/35 hover:bg-marca-lima/25"
                  >
                    <IconVer size={22} />
                    <span>Ver</span>
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

/** Estado con texto y color: el color solo no basta con luz de lado. */
function EstadoBadge({ usuario }: { usuario: UsuarioRow }) {
  return usuario.is_active ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-exito-suave px-3 py-1 text-sm font-semibold text-exito ring-1 ring-exito/25">
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-exito" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-peligro-suave px-3 py-1 text-sm font-semibold text-peligro ring-1 ring-peligro/25">
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-peligro" />
      Inactivo
    </span>
  );
}

/** Aviso de las tarjetas: el rol decide qué puede hacer cada persona. */
export function ResumenRoles() {
  return (
    <p className="flex items-start gap-2 text-sm text-texto-suave">
      <IconInterrogacion size={22} className="mt-0.5 shrink-0 text-texto-tenue" />
      <span>
        El rol decide qué puede hacer cada persona: un <strong>Operador</strong> anota
        movimientos y compras, un <strong>Supervisor</strong> además los anula, y solo un{' '}
        <strong>Administrador</strong> entra a estas pantallas.
      </span>
    </p>
  );
}