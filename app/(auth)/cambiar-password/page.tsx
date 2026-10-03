import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/server/auth/guards';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Cambiar contraseña' };

/**
 * Cambio de contrasena. El middleware fuerza esta ruta cuando el perfil tiene
 * force_password_change = true; un usuario autenticado tambien puede entrar
 * aqui para cambiar su contrasena en cualquier momento.
 */
export default async function CambiarPasswordPage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');

  return (
    <PasswordForm
      fullName={context.profile.full_name}
      forced={context.profile.force_password_change}
    />
  );
}
