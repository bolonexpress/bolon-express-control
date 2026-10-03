'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/rate-limit/login';
import { getClientIp } from '@/lib/request';
import { changePasswordSchema, loginSchema } from '@/lib/validation/auth';
import { logAudit } from '@/server/lib/audit';

export type AuthActionState = { error: string | null };

const CREDENCIALES_INVALIDAS = 'Correo o contrasena incorrectos.';

/** FormData -> string seguro: nunca se acepta File ni array en un campo de texto. */
function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

export async function loginAction(
  _estadoAnterior: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: texto(formData, 'email'),
    password: texto(formData, 'password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' };
  }

  const email = parsed.data.email.toLowerCase();
  const ip = await getClientIp();

  const limite = await checkLoginRateLimit(email, ip);
  if (!limite.allowed) {
    const minutos = Math.max(Math.ceil(limite.retryAfterSeconds / 60), 1);
    console.warn('[auth] login bloqueado por limite', { email, source: limite.source, ip });
    return { error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} min.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await recordLoginAttempt(email, ip, false);
    console.warn('[auth] login fallido', { email, motivo: error?.message });
    // Fire-and-forget: la bitacora no puede alargar ni tumbar el intento.
    void logAudit({
      accion: 'login',
      entidad: 'auth',
      datos: { resultado: 'fallo', email },
    });
    // Mensaje generico: no revela si el correo existe.
    return { error: CREDENCIALES_INVALIDAS };
  }

  await recordLoginAttempt(email, ip, true);
  void logAudit({
    accion: 'login',
    entidad: 'auth',
    datos: { resultado: 'exito', email },
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, force_password_change')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: 'No pudimos validar tu cuenta. Intenta de nuevo.' };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'Tu cuenta esta desactivada. Contacta al administrador.' };
  }

  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', data.user.id);

  if (profile.force_password_change) {
    redirect('/cambiar-password');
  }

  const next = texto(formData, 'next');
  redirect(isSafeRedirect(next) ? next : '/');
}

/** Solo rutas internas: evita redirecciones abiertas hacia sitios externos. */
function isSafeRedirect(candidato: string): boolean {
  return candidato.startsWith('/') && !candidato.startsWith('//') && !candidato.includes('\\');
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  void logAudit({ accion: 'logout', entidad: 'auth' });
  await supabase.auth.signOut();
  redirect('/login');
}

export async function changePasswordAction(
  _estadoAnterior: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: texto(formData, 'currentPassword'),
    password: texto(formData, 'password'),
    confirmPassword: texto(formData, 'confirmPassword'),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Datos invalidos' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { error: 'Sesion requerida. Vuelve a iniciar sesion.' };

  const email = user.email ?? '';

  // Verifica la contrasena provisional antes de permitir el cambio.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });

  if (verifyError) return { error: 'La contrasena actual no es correcta.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    console.error('[auth] fallo al actualizar la contrasena', { userId: user.id, motivo: updateError.message });
    return { error: 'No se pudo actualizar la contrasena. Intenta de nuevo.' };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id);

  if (profileError) {
    console.error('[auth] no se pudo limpiar force_password_change', { userId: user.id });
  }

  // Await: al volver, la bitacora ya tiene el evento (y es barato).
  await logAudit({ accion: 'cambio_password', entidad: 'auth' });

  redirect('/');
}