import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

type SearchParams = {
  error?: string | string[] | undefined;
  next?: string | string[] | undefined;
};

/**
 * Pagina de login. La unica ruta publica: el middleware redirige aqui a todo
 * lo demas cuando no hay sesion.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  // Solo se acepta "next" si es una ruta interna: evita redirecciones abiertas.
  const nextCandidato = typeof params.next === 'string' ? params.next : '';
  const next =
    nextCandidato.startsWith('/') && !nextCandidato.startsWith('//') && !nextCandidato.includes('\\')
      ? nextCandidato
      : '';

  const errorParam = typeof params.error === 'string' ? params.error : '';
  const initialError =
    errorParam === 'inactivo'
      ? 'Tu cuenta está desactivada. Contacta al administrador.'
      : errorParam === 'rate-limited'
        ? 'Demasiados intentos fallidos. Intenta más tarde.'
        : null;

  return <LoginForm next={next} initialError={initialError} />;
}
