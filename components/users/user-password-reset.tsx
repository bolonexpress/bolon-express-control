'use client';

import { useActionState, useEffect, useState } from 'react';

import { botonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconAviso, IconCheckCirculo, IconLlave } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { resetPasswordAction } from '@/server/actions/users';
import type { UsuarioRow, UsuariosActionState } from '@/types/domain';

/**
 * Reset de contrasena.
 *
 * El resultado es una clave TEMPORAL que la persona usa para entrar una vez y
 * `/cambiar-password` le obliga a definir la suya. Esa clave viaja en la
 * respuesta de la Server Action y NUNCA por la URL: un query param queda en el
 * historial del navegador, en el log del servidor y en el `Referer`.
 *
 * Por la misma razon la clave no se anuncia por toast (la pantalla la
 * comparten) y el bloque que la muestra se limpia solo: al cerrar el modal se
 * descarta de la memoria del cliente.
 */
export function UserPasswordReset({ usuario }: { usuario: UsuarioRow }) {
  const [estado, formAction] = useActionState<UsuariosActionState, FormData>(
    resetPasswordAction,
    null,
  );
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const claveTemporal = estado?.ok === true ? (estado.data.claveTemporal ?? null) : null;
  const error = estado?.ok === false ? estado.error.message : null;

  useToastDeEstado(estado, {
    exito: 'Contraseña cambiada. Entrégasela a la persona.',
  });

  /**
   * Copia de verdad, no un cartel: un boton que dice "Copiar la clave" y solo
   * cambia de texto obliga a comprobar a mano, y al final nadie lo usa. Si la
   * API no esta (contexto sin HTTPS, denegada por permisos), el `<code>` es
   * `select: all`: se puede seleccionar y copiar a mano.
   */
  const copiar = async () => {
    if (!claveTemporal) return;
    try {
      await navigator.clipboard.writeText(claveTemporal);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  // Al cerrar el modal se borra la clave de la pantalla. Reabrir el modal no
  // la vuelve a pintar: hace falta generar otra.
  useEffect(() => {
    if (!confirmando) setCopiado(false);
  }, [confirmando]);

  return (
    <>
      <div className="flex flex-col gap-3">
        {usuario.force_password_change ? (
          <p className="rounded-xl bg-aviso-suave px-4 py-3 text-base leading-relaxed text-aviso ring-1 ring-aviso/25">
            Esta persona todavia no ha cambiado la clave temporal que le diste. Puede que ni
            siquiera haya entrado.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className={botonClass('secundario', 'md')}
        >
          <IconLlave size={22} />
          <span>Cambiar su contraseña</span>
        </button>
      </div>

      <Dialog
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo={claveTemporal ? 'Contraseña temporal' : `¿Cambiar la contraseña de ${usuario.full_name}?`}
        descripcion={
          claveTemporal
            ? 'Copia esta clave y entrégasela a la persona. Solo se muestra una vez.'
            : 'La anterior deja de servir de inmediato.'
        }
        pie={
          claveTemporal ? (
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className={botonClass('primario', 'md')}
            >
              <span>Listo, ya la entregué</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className={botonClass('secundario', 'md')}
              >
                <span>Mejor no</span>
              </button>
              <form action={formAction}>
                <input type="hidden" name="userId" value={usuario.id} />
                <SubmitButton pendingText="Cambiando…" className={botonClass('primario', 'md')}>
                  <IconLlave size={22} />
                  <span>Sí, cambiar</span>
                </SubmitButton>
              </form>
            </>
          )
        }
      >
        {claveTemporal ? (
          <ClaveTemporal
            clave={claveTemporal}
            copiado={copiado}
            onCopiar={copiar}
            nombre={usuario.full_name}
          />
        ) : (
          <ul className="space-y-3 text-base leading-relaxed text-texto">
            <li className="flex items-start gap-2">
              <IconAviso size={22} className="mt-0.5 shrink-0 text-texto-suave" />
              <span>
                Se genera una <strong>clave nueva y temporal</strong>. La que tenía deja de servir
                desde este momento, sin aviso.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <IconAviso size={22} className="mt-0.5 shrink-0 text-texto-suave" />
              <span>
                Cuando entre con esa clave, la app le va a{' '}
                <strong>pedir que elija la suya</strong> antes de dejarlo pasar.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <IconAviso size={22} className="mt-0.5 shrink-0 text-exito" />
              <span>
                La clave se muestra <strong>una sola vez</strong>. Si la pierdes, puedes cambiarla
                otra vez desde aquí.
              </span>
            </li>
          </ul>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-peligro-suave px-4 py-3 text-base leading-relaxed text-peligro"
          >
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

/**
 * El bloque de la clave es `select-all` y tiene un boton que copia de verdad al
 * portapapeles. Entregar una clave temporal escribiendola a mano garantiza al
 * menos un error, y la alternativa natural —mandarla por chat— tampoco es
 * segura, asi que el boton es lo mas rapido de las dos.
 */
function ClaveTemporal({
  clave,
  copiado,
  onCopiar,
  nombre,
}: {
  clave: string;
  copiado: boolean;
  onCopiar: () => void;
  nombre: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-texto">
        Esta es la clave temporal de <strong>{nombre}</strong>. Se muestra una sola vez: cuando
        cierres esta ventana no vuelve a aparecer.
      </p>

      <code className="block select-all break-all rounded-2xl bg-fondo px-4 py-5 text-center font-mono text-2xl font-bold tracking-wide text-texto ring-1 ring-borde">
        {clave}
      </code>

      <button type="button" onClick={onCopiar} className={botonClass('secundario', 'md', 'w-full')}>
        {copiado ? <IconCheckCirculo size={22} className="text-exito" /> : null}
        <span>{copiado ? 'Copiada' : 'Copiar la clave'}</span>
      </button>

      <p className="text-sm leading-relaxed text-texto-suave">
        {copiado
          ? 'Está en el portapapeles. Entrégasela a la persona por un medio seguro.'
          : 'Toca la clave para seleccionarla y copiala, o usa el botón de arriba.'}
      </p>
    </div>
  );
}