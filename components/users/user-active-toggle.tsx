'use client';

import { useActionState, useEffect, useState } from 'react';

import { botonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconAviso, IconPersona } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { setUserActiveAction } from '@/server/actions/users';
import type { UsuarioRow, UsuariosActionState } from '@/types/domain';

/**
 * Activar / desactivar una cuenta.
 *
 * Desactivar NO es un boton suelto: pasa por un modal que dice exactamente qué
 * va a pasar ("esta persona no va a poder entrar") y por qué no se borra
 * ("el historial se queda"). Quien administra se equivoca de botón con menos
 * contexto del mundo, y esto es de lo que no tiene vuelta atrás.
 *
 * El usuario NUNCA se borra: el historial depende de `profiles.id`.
 */
export function UserActiveToggle({ usuario, esYo }: { usuario: UsuarioRow; esYo: boolean }) {
  const [estado, formAction] = useActionState<UsuariosActionState, FormData>(
    setUserActiveAction,
    null,
  );
  const [confirmando, setConfirmando] = useState(false);

  const error = estado?.ok === false ? estado.error.message : null;

  useToastDeEstado(estado, {
    exito: usuario.is_active
      ? 'Guardado correctamente. Quedó desactivado y no podrá entrar.'
      : 'Guardado correctamente. Quedó activo y ya puede entrar.',
  });

  // El modal se cierra solo cuando el cambio SI salio. Si el servidor lo rebate
  // (cerrojo anti-encierro), el modal sigue abierto y el error se ve dentro: si
  // se cerrara, el admin veria un toast y pensaria que se guardó.
  useEffect(() => {
    if (estado?.ok) setConfirmando(false);
  }, [estado]);

  if (usuario.is_active) {
    return (
      <>
        <div className="flex flex-col gap-3">
          {esYo ? (
            <p className="rounded-xl bg-aviso-suave px-4 py-3 text-base leading-relaxed text-aviso ring-1 ring-aviso/25">
              Esta es tu propia cuenta. El sistema no te va a dejar desactivarla: te quedarías
              fuera de la app sin poder entrar.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={esYo}
            className={botonClass('peligro', 'md', esYo ? 'cursor-not-allowed opacity-60' : '')}
          >
            <IconPersona size={22} />
            <span>Desactivar {usuario.full_name}</span>
          </button>
        </div>

        <ConfirmarDesactivacion
          abierto={confirmando}
          onCerrar={() => setConfirmando(false)}
          usuario={usuario}
          formAction={formAction}
          error={confirmando ? error : null}
        />
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={usuario.id} />
      <input type="hidden" name="isActive" value="true" />
      <SubmitButton pendingText="Activando…" className={botonClass('exito', 'md')}>
        <IconPersona size={22} />
        <span>Reactivar {usuario.full_name}</span>
      </SubmitButton>
      {error ? (
        <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-base text-peligro">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ConfirmarDesactivacion({
  abierto,
  onCerrar,
  usuario,
  formAction,
  error,
}: {
  abierto: boolean;
  onCerrar: () => void;
  usuario: UsuarioRow;
  formAction: (formData: FormData) => void;
  error: string | null;
}) {
  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`¿Desactivar a ${usuario.full_name}?`}
      descripcion="Vas a quitándole el acceso a la app."
      pie={
        <>
          <button type="button" onClick={onCerrar} className={botonClass('secundario', 'md')}>
            <span>Mejor no</span>
          </button>
          <form action={formAction}>
            <input type="hidden" name="userId" value={usuario.id} />
            <input type="hidden" name="isActive" value="false" />
            <SubmitButton pendingText="Desactivando…" className={botonClass('peligro', 'md')}>
              <span>Sí, desactivar</span>
            </SubmitButton>
          </form>
        </>
      }
    >
      <ul className="space-y-3 text-base leading-relaxed text-texto">
        <li className="flex items-start gap-2">
          <IconAviso size={22} className="mt-0.5 shrink-0 text-peligro" />
          <span>
            <strong>{usuario.full_name}</strong> no va a poder entrar a la app. Los movimientos y
            compras que ya registró se quedan con su nombre.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <IconAviso size={22} className="mt-0.5 shrink-0 text-texto-suave" />
          <span>
            <strong>No se borra nada.</strong> El registro y todo su historial se conservan; solo se
            le cierra la puerta. Puedes reactivarlo cuando quieras desde aquí.
          </span>
        </li>
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-peligro-suave px-4 py-3 text-base leading-relaxed text-peligro"
        >
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}