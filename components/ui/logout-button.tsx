'use client';

import { useTransition } from 'react';

import { botonClass } from '@/components/ui/button';
import { IconSalir } from '@/components/ui/icons';
import { logoutAction } from '@/server/actions/auth';

/**
 * "Cerrar sesión". Vive en el menu de la cuenta, asi que comparte su aspecto de
 * boton de sistema. `onClick` es opcional para poder cerrar el menu al pulsarlo.
 */
export function LogoutButton({ onClick }: { onClick?: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        startTransition(() => logoutAction());
      }}
      disabled={pending}
      className={botonClass('secundario', 'md', 'w-full justify-start')}
    >
      <IconSalir size={22} />
      <span>{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
    </button>
  );
}