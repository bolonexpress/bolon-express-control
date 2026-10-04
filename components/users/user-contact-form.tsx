'use client';

import { useActionState } from 'react';

import { botonClass } from '@/components/ui/button';
import { Field, errorClass, inputClass } from '@/components/ui/field';
import { IconCheckCirculo } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { editarUsuarioAction } from '@/server/actions/users';
import type { UsuarioRow, UsuariosActionState } from '@/types/domain';

/**
 * Nombre y telefono de un usuario.
 *
 * El correo NO se edita aqui: es la identidad en Supabase Auth y cambiarlo exige
 * otro flujo (verificar el nuevo correo). Se muestra, no se toca, para que quien
 * administra sepa a que cuenta corresponde el registro.
 */
export function UserContactForm({ usuario }: { usuario: UsuarioRow }) {
  const [estado, formAction] = useActionState<UsuariosActionState, FormData>(
    editarUsuarioAction,
    null,
  );

  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  useToastDeEstado(estado, { exito: 'Guardado correctamente. Los datos quedaron actualizados.' });

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="userId" value={usuario.id} />

      <Field
        id="full_name"
        label="Nombre y apellido"
        error={errores.full_name}
        hint="Es el nombre que verá el resto del equipo en los movimientos y la bitácora."
      >
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={usuario.full_name}
          className={inputClass}
        />
      </Field>

      <Field
        id="email"
        label="Correo"
        hint="Con este correo entra a la app. No se puede cambiar desde aquí."
      >
        <input
          id="email"
          type="email"
          readOnly
          disabled
          value={usuario.email ?? 'No disponible'}
          className={inputClass}
        />
      </Field>

      <Field
        id="phone"
        label="Teléfono (opcional)"
        error={errores.phone}
        hint="Sirve para poder llamar si alguien se queda sin contraseña."
      >
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={usuario.phone ?? ''}
          placeholder="099 123 4567"
          className={inputClass}
        />
      </Field>

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className={errorClass}>
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Guardando…" className={botonClass('primario', 'md')}>
          <IconCheckCirculo size={22} />
          <span>Guardar cambios</span>
        </SubmitButton>
      </div>
    </form>
  );
}