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

  // `falta_config`, `fallo_supabase` y `fallo` los manda el middleware cuando no
  // pudo verificar la sesion. Sin este texto el usuario ve un formulario normal y
  // no tiene forma de saber que el problema es del servidor, no su clave.
  const erroresConocidos: Record<string, string> = {
    inactivo: 'Tu cuenta está desactivada. Contacta al administrador.',
    'rate-limited': 'Demasiados intentos fallidos. Intenta más tarde.',
    falta_config:
      'El servidor no tiene configuradas las credenciales de Supabase. Avisa al administrador.',
    fallo_supabase: 'No se pudo verificar la sesión con el servidor. Intenta más tarde.',
    fallo: 'Ocurrió un error al verificar la sesión. Intenta más tarde.',
  };

  const initialError = erroresConocidos[errorParam] ?? null;

  return <LoginForm next={next} initialError={initialError} />;
}
