'use client';

import { useActionState, useEffect } from 'react';

import { botonClass } from '@/components/ui/button';
import { Field, errorClass, inputClass } from '@/components/ui/field';
import { IconAviso, IconCheck } from '@/components/ui/icons';
import { descartarAviso, guardarAviso } from '@/components/ui/toast-consulta';
import { changePasswordAction } from '@/server/actions/auth';

/**
 * Cambio de contrasena. Fase 9: los mismos primitivos que el login (etiquetas
 * grandes, campos de 56px, boton del sistema con icono) para que las dos
 * pantallas de acceso se parezcan y el cambio no se sienta como otra app.
 *
 * El exito cruza una redireccion (`/`) y la accion no admite parametro, asi que
 * el aviso viaja por `sessionStorage`: se deja antes de enviar y lo consume el
 * `ToastProvider` del shell, que sobrevive a la navegacion. Si el guardado falla
 * se descarta, para no celebrar un cambio que no ocurrio.
 */
export function PasswordForm({ fullName, forced }: { fullName: string; forced: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, { error: null });

  // Un error descarta el aviso pendiente: todavia no hay nada que celebrar.
  useEffect(() => {
    if (state.error) descartarAviso();
  }, [state.error]);

  return (
    <form
      action={formAction}
      className="space-y-5"
      noValidate
      onSubmit={() =>
        guardarAviso('Tu contraseña quedó actualizada. Ya puedes usarla para entrar.')
      }
    >
      <div>
        <h1 className="text-2xl font-bold text-texto">Cambiar contraseña</h1>
        <p className="mt-1 text-base leading-relaxed text-texto-suave">
          {forced
            ? `Hola ${fullName}: estás usando una contraseña provisional. Define la tuya para poder seguir usando la app.`
            : 'Define una nueva contraseña para tu cuenta.'}
        </p>
      </div>

      <Field id="currentPassword" label="Contraseña actual">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Escribe la que usas hoy"
          className={inputClass}
        />
      </Field>

      <Field
        id="password"
        label="Nueva contraseña"
        hint="Mínimo 12 caracteres, con una mayúscula, una minúscula y un número."
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          placeholder="Mínimo 12 caracteres"
          className={inputClass}
        />
      </Field>

      <Field id="confirmPassword" label="Repite la nueva contraseña">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Escríbela otra vez"
          className={inputClass}
        />
      </Field>

      {state.error ? (
        <p
          role="alert"
          className={`${errorClass} rounded-xl bg-peligro-suave px-4 py-3 ring-1 ring-peligro/25`}
        >
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        className={botonClass('primario', 'lg', 'w-full')}
      >
        <IconCheck size={22} />
        <span>Guardar contraseña</span>
      </button>
    </form>
  );
}