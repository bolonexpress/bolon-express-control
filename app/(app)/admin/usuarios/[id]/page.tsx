import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { UserActiveToggle } from '@/components/users/user-active-toggle';
import { UserContactForm } from '@/components/users/user-contact-form';
import { UserPasswordReset } from '@/components/users/user-password-reset';
import { UserRoleForm } from '@/components/users/user-role-form';
import { botonClass } from '@/components/ui/button';
import { tarjetaClass } from '@/components/ui/field';
import {
  IconAviso,
  IconCheckCirculo,
  IconIzquierda,
  IconPersona,
} from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { requirePagePermission } from '@/server/auth/guards';
import { getUsuario } from '@/server/repositories/users';
import { PERMISOS } from '@/types/domain';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FECHA = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  dateStyle: 'long',
});

function fechaCorta(iso: string | null): string {
  if (!iso) return 'Nunca ha entrado';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sin dato' : FECHA.format(d);
}

/**
 * Ficha de una persona (Fase 10).
 *
 * Cada poder que cambia es su propia Server Action (`editarUsuarioAction`,
 * `cambiarRolAction`, `setUserActiveAction`, `resetPasswordAction`), no un
 * formulario unico con un "guardar" que mezcla cuatro decisiones distintas.
 * Quien administra ve, para cada una, exactamente lo que va a pasar antes de
 * confirmarlo.
 */
export default async function UsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requirePagePermission(PERMISOS.usersManage);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const usuario = await getUsuario(id);
  if (!usuario) notFound();

  const esYo = id === sesion.user.id;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={usuario.full_name}
        descripcion={usuario.email ?? 'Correo no disponible en este entorno.'}
        ayuda={{
          titulo: `Ficha de ${usuario.full_name}`,
          resumen: 'Cambia sus datos, su rol, su acceso y su contraseña, por separado.',
          pasos: [
            'En "Datos" cambias el nombre y el teléfono que ve el resto del equipo.',
            'En "Rol" eliges qué puede hacer. El cambio cuenta de inmediato.',
            'En "Acceso" lo desactivas si se va de la tienda, o le cambias la contraseña si se le olvidó.',
          ],
          nota: 'El correo es su identidad y no se cambia desde aquí: vive en la cuenta de acceso.',
        }}
      >
        <Link
          href="/admin/usuarios"
          className={botonClass('fantasma', 'md', 'px-0 hover:bg-transparent')}
        >
          <IconIzquierda size={22} />
          <span className="underline decoration-2 underline-offset-4">Volver al listado</span>
        </Link>
      </PageHeader>

      <Resumen usuario={usuario} esYo={esYo} />

      {!usuario.is_active ? (
        <p className="flex items-start gap-2 rounded-xl bg-peligro-suave px-4 py-3 text-base leading-relaxed text-peligro ring-1 ring-peligro/25">
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>
            Esta persona <strong>no puede entrar</strong> a la app. Sus movimientos y compras
            anteriores se conservan con su nombre.
          </span>
        </p>
      ) : null}

      <section className={`${tarjetaClass} space-y-5`}>
        <h2 className="text-xl font-bold text-texto">Datos</h2>
        <UserContactForm usuario={usuario} />
      </section>

      <section className={`${tarjetaClass} space-y-5`}>
        <h2 className="text-xl font-bold text-texto">Rol</h2>
        <UserRoleForm usuario={usuario} esYo={esYo} />
      </section>

      <section className={`${tarjetaClass} space-y-5`}>
        <h2 className="text-xl font-bold text-texto">Acceso</h2>
        <UserActiveToggle usuario={usuario} esYo={esYo} />
      </section>

      <section className={`${tarjetaClass} space-y-5`}>
        <h2 className="text-xl font-bold text-texto">Contraseña</h2>
        <UserPasswordReset usuario={usuario} />
      </section>
    </div>
  );
}

/** Ficha de datos: correo, alta, última vez que entró y estado. */
function Resumen({
  usuario,
  esYo,
}: {
  usuario: { email: string | null; created_at: string; last_seen_at: string | null; is_active: boolean };
  esYo: boolean;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <Dato etiqueta="Correo">
        {usuario.email ? (
          <span className="break-all">{usuario.email}</span>
        ) : (
          <span className="text-texto-suave">No disponible</span>
        )}
      </Dato>

      <Dato etiqueta="Entró por última vez">{fechaCorta(usuario.last_seen_at)}</Dato>

      <Dato etiqueta="Estado">
        <span className="inline-flex items-center gap-2">
          {usuario.is_active ? (
            <IconCheckCirculo size={22} className="text-exito" />
          ) : (
            <IconPersona size={22} className="text-texto-tenue" />
          )}
          <span>{usuario.is_active ? 'Activo' : 'Inactivo'}</span>
        </span>
        {esYo ? <span className="block text-sm text-texto-suave">Eres tú</span> : null}
      </Dato>
    </dl>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-superficie px-4 py-3 shadow-tarjeta ring-1 ring-borde">
      <dt className="text-sm font-semibold uppercase tracking-wide text-texto-suave">{etiqueta}</dt>
      <dd className="mt-1 text-base text-texto">{children}</dd>
    </div>
  );
}