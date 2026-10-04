import Link from 'next/link';

import { UserCreateForm } from '@/components/users/user-create-form';
import { botonClass } from '@/components/ui/button';
import { IconIzquierda } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

/**
 * Alta de persona (Fase 10).
 *
 * El formulario NO pide contrasena: la genera el servidor y la muestra una sola
 * vez en la misma pantalla, porque el alta no puede redirigir con la clave en
 * la URL (quedaria en el historial del navegador).
 */
export default async function NuevoUsuarioPage() {
  await requirePagePermission(PERMISOS.usersManage);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Añadir persona"
        descripcion="Escribe quién entra y qué puede hacer. La app genera una contraseña temporal y se la entregas en mano."
        ayuda={{
          titulo: 'Añadir persona',
          resumen: 'Da de alta a alguien para que pueda entrar a la app.',
          pasos: [
            'Escribe el correo con el que va a entrar: es su usuario.',
            'Escribe su nombre, como lo verá el resto del equipo en los movimientos.',
            'Elige el rol. Cada rol abre o cierra pantallas distintas.',
            'Al guardar, te aparece una contraseña temporal. Anótala y entrégasela.',
          ],
          nota: 'Cuando la persona entre con esa clave, la app le va a pedir que elija una contraseña propia.',
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

      <div className={`${tarjetaClass} max-w-2xl`}>
        <UserCreateForm />
      </div>
    </div>
  );
}