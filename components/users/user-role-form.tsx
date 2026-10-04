'use client';

import { useActionState } from 'react';

import { botonClass } from '@/components/ui/button';
import { errorClass, labelClass } from '@/components/ui/field';
import { IconCheckCirculo, IconEscudo } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { cambiarRolAction } from '@/server/actions/users';
import { ROLES_KEY, ROL_LABEL, ROL_RESUMEN } from '@/lib/validation/users';
import type { UsuarioRow, UsuariosActionState } from '@/types/domain';

/**
 * Cambio de rol. Deja al usuario con EXACTAMENTE el rol elegido.
 *
 * El servidor guarda `granted_by` (quien concedio el rol) y `granted_at`, asi que
 * la bitacora sabe despues quien dio de alta a quien y cuando. Aqui no hace
 * falta mandar el admin: sale de la sesion.
 *
 * Si el usuario es uno mismo y tiene rol admin, el boton se explica en vez de
 * desaparecer: el cerrojo esta en el servidor, pero dejar el control sin
 * explicacion parece un fallo de la pantalla.
 */
export function UserRoleForm({
  usuario,
  esYo,
}: {
  usuario: UsuarioRow;
  esYo: boolean;
}) {
  const [estado, formAction] = useActionState<UsuariosActionState, FormData>(
    cambiarRolAction,
    null,
  );

  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};
  const rolActual = usuario.roleKeys[0] ?? '';
  const esAdminActual = usuario.roleKeys.includes('admin');
  const propioRolAdmin = esYo && esAdminActual;

  useToastDeEstado(estado, { exito: 'Guardado correctamente. El rol quedó actualizado.' });

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="userId" value={usuario.id} />

      <p className="flex items-start gap-2 rounded-xl bg-superficie-alterna px-4 py-3 text-sm leading-relaxed text-texto-suave ring-1 ring-borde">
        <IconEscudo size={22} className="mt-0.5 shrink-0" />
        <span>
          Ahora mismo es{' '}
          <strong className="text-texto">
            {rolActual ? ROL_LABEL[rolActual as keyof typeof ROL_LABEL] : 'sin rol'}
          </strong>
          . Al cambiarlo, esta persona deja de poder hacer lo que el rol anterior le dejaba.
        </span>
      </p>

      <fieldset className="space-y-3">
        <legend className={labelClass}>¿Qué debe poder hacer?</legend>
        {ROLES_KEY.map((key) => (
          <label
            key={key}
            className={`flex min-h-7 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
              rolActual === key
                ? 'border-marca bg-marca-lima/15'
                : 'border-borde bg-superficie hover:bg-superficie-alterna'
            }`}
          >
            <input
              type="radio"
              name="rol"
              value={key}
              defaultChecked={rolActual === key}
              className="mt-0.5 size-[28px] shrink-0 accent-marca"
            />
            <span>
              <span className="block text-base font-semibold text-texto">{ROL_LABEL[key]}</span>
              <span className="block text-sm leading-relaxed text-texto-suave">
                {ROL_RESUMEN[key]}
              </span>
            </span>
          </label>
        ))}
        {errores.rol ? (
          <p role="alert" className={errorClass}>
            {errores.rol}
          </p>
        ) : null}
      </fieldset>

      {propioRolAdmin ? (
        <p className="rounded-xl bg-aviso-suave px-4 py-3 text-base leading-relaxed text-aviso ring-1 ring-aviso/25">
          Te cambias el rol a ti mismo. El sistema no te lo va a permitir: si nadie más es
          administrador, la app se quedaría sin nadie que la administre. Pide que lo haga otra
          persona.
        </p>
      ) : null}

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className={errorClass}>
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Guardando…" className={botonClass('primario', 'md')}>
          <IconCheckCirculo size={22} />
          <span>Guardar rol</span>
        </SubmitButton>
      </div>
    </form>
  );
}