'use client';

import { useActionState } from 'react';

import { errorClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { botonClass } from '@/components/ui/button';
import { IconAviso, IconCamara } from '@/components/ui/icons';
import { useToastDeEstado } from '@/components/ui/toast';
import { FOTO_ACEPTADOS } from '@/lib/validation/movements';
import { adjuntarFotoMovimientoAction } from '@/server/actions/movements';

/**
 * Readjunta una foto a un movimiento que se registro sin ella.
 *
 * El caso es real y no era hipotetico: la subida a Storage puede fallar
 * (permisos, red, un nombre mal construido) DESPUES de que el movimiento ya
 * esta escrito, y los movimientos son append-only (ADR-003). Antes no habia
 * ninguna salida: el movimiento se quedaba sin la foto que el negocio declara
 * obligatoria y no habia forma de arreglarlo sin registrar otro y anular este.
 *
 * No reusa `PhotoInput` a proposito: ese componente esta disenado para el
 * formulario de movimiento, con su etiqueta "Obligatoria" y su logica de
 * reinyectar el `File` tras un envio fallido. Aqui el formulario tiene un solo
 * campo y la foto es lo unico que se envia.
 *
 * La accion responde en el sitio (no redirige); el exito sale como aviso
 * emergente y la foto se pinta con el `revalidatePath` que hace la accion.
 */
export function AdjuntarFotoForm({ movementId, codigo }: { movementId: string; codigo: string }) {
  const [estado, formAction] = useActionState(adjuntarFotoMovimientoAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  useToastDeEstado(estado, { exito: `Foto adjuntada a ${codigo}.` });

  return (
    <form action={formAction} className="mt-3 space-y-3" noValidate>
      <input type="hidden" name="movementId" value={movementId} />

      <div>
        <label htmlFor="foto-readjuntar" className="mb-1 block text-base font-semibold text-texto">
          Foto que faltaba
        </label>
        <input
          id="foto-readjuntar"
          name="foto"
          type="file"
          accept={FOTO_ACEPTADOS}
          required
          aria-invalid={errores.foto ? true : undefined}
          className="block min-h-7 w-full rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-base text-texto-suave file:mr-3 file:min-h-6 file:rounded-lg file:border-0 file:bg-marca file:px-4 file:text-base file:font-semibold file:text-white aria-invalid:border-peligro sm:max-w-sm"
        />
        <p className="mt-1 text-sm text-texto-suave">
          Formato: JPEG, PNG, WebP o HEIC. La foto se guarda en el movimiento, no se puede
          sustituir después.
        </p>
      </div>

      {errores.foto ? (
        <p role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{errores.foto}</span>
        </p>
      ) : null}

      {estado?.ok === false ? (
        <p role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{estado.error.message}</span>
        </p>
      ) : null}

      <SubmitButton
        pendingText="Subiendo la foto…"
        className={botonClass('primario', 'lg', 'w-full sm:w-auto')}
      >
        <IconCamara size={22} />
        Adjuntar foto
      </SubmitButton>
    </form>
  );
}