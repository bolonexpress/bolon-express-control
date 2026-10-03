'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { assignRoleSchema, setUserActiveSchema } from '@/lib/validation/auth';
import { requirePermission } from '@/server/auth/guards';

export type ActionState = { ok: boolean; message: string };

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

export async function setUserActiveAction(
  _estadoAnterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePermission('users:manage');

  const parsed = setUserActiveSchema.safeParse({
    userId: texto(formData, 'userId'),
    isActive: texto(formData, 'isActive') === 'true',
  });

  if (!parsed.success) return { ok: false, message: 'Datos invalidos.' };

  if (parsed.data.userId === user.id && !parsed.data.isActive) {
    return { ok: false, message: 'No puedes desactivar tu propia cuenta.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.userId);

  if (error) {
    console.error('[usuarios] no se pudo cambiar is_active', { motivo: error.message });
    return { ok: false, message: 'No se pudo actualizar el usuario.' };
  }

  revalidatePath('/administracion/usuarios');
  return { ok: true, message: parsed.data.isActive ? 'Usuario activado.' : 'Usuario desactivado.' };
}

export async function assignRoleAction(
  _estadoAnterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('users:manage');

  const parsed = assignRoleSchema.safeParse({
    userId: texto(formData, 'userId'),
    roleId: texto(formData, 'roleId'),
  });

  if (!parsed.success) return { ok: false, message: 'Datos invalidos.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: parsed.data.userId, role_id: parsed.data.roleId });

  if (error && error.code !== '23505') {
    console.error('[usuarios] no se pudo asignar el rol', { motivo: error.message });
    return { ok: false, message: 'No se pudo asignar el rol.' };
  }

  revalidatePath('/administracion/usuarios');
  return { ok: true, message: 'Rol asignado.' };
}

export async function removeRoleAction(
  _estadoAnterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('users:manage');

  const parsed = assignRoleSchema.safeParse({
    userId: texto(formData, 'userId'),
    roleId: texto(formData, 'roleId'),
  });

  if (!parsed.success) return { ok: false, message: 'Datos invalidos.' };

  const supabase = await createClient();

  const { data: role } = await supabase
    .from('roles')
    .select('id, key')
    .eq('id', parsed.data.roleId)
    .maybeSingle();

  if (!role) return { ok: false, message: 'El rol no existe.' };

  // Blindaje: el sistema nunca puede quedarse sin administradores.
  if (role.key === 'admin') {
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', role.id);

    const otros = (admins ?? []).filter((row) => row.user_id !== parsed.data.userId);
    if (otros.length === 0) {
      return { ok: false, message: 'Debe quedar al menos un administrador activo.' };
    }
  }

  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', parsed.data.userId)
    .eq('role_id', parsed.data.roleId);

  if (error) {
    console.error('[usuarios] no se pudo quitar el rol', { motivo: error.message });
    return { ok: false, message: 'No se pudo quitar el rol.' };
  }

  revalidatePath('/administracion/usuarios');
  return { ok: true, message: 'Rol retirado.' };
}