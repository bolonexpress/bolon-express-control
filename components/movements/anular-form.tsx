'use client';

import { useActionState } from 'react';

import { Field, inputClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { botonClass } from '@/components/ui/button';
import { IconAviso } from '@/components/ui/icons';
import { anularMovimientoAction } from '@/server/actions/movements';
import { ANULACION_MOTIVO, ANULACION_MOTIVO_LABEL } from '@/types/domain';

/**
 * Anulacion logica de un movimiento. No borra nada: la RPC escribe una fila en
 * `movement_anulations` con el `snapshot` del movimiento y deja de contarlo en
 * el stock (ADR-003). El motivo es obligatorio y el detalle se exige para que la
 * auditoria diga por que se corrigio.
 *
 * La accion responde en el sitio (no redirige), asi que la confirmacion sale del
 * estado como aviso emergente.
 */
export function AnularForm({ movementId }: { movementId: string }) {
  const [estado, formAction] = useActionState(anularMovimientoAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  useToastDeEstado(estado, { exito: 'Movimiento anulado. El inventario volvió a como estaba.' });

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="movementId" value={movementId} />

      <Field id="motivo" label="Motivo de la anulación" error={errores.motivo}>
        <select id="motivo" name="motivo" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Selecciona un motivo
          </option>
          {ANULACION_MOTIVO.map((motivo) => (
            <option key={motivo} value={motivo}>
              {ANULACION_MOTIVO_LABEL[motivo]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="detalle"
        label="Detalle"
        error={errores.detalle}
        hint="Queda guardado en la bitácora junto al snapshot del movimiento."
      >
        <textarea
          id="detalle"
          name="detalle"
          rows={3}
          placeholder="Explica qué ocurrió y por qué se anula"
          className={inputClass}
        />
      </Field>

      {estado?.ok === false ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-peligro-suave px-4 py-3 text-base text-peligro ring-1 ring-peligro/25">
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{estado.error.message}</span>
        </p>
      ) : null}

      <SubmitButton
        pendingText="Anulando…"
        className={botonClass('peligro', 'lg', 'w-full sm:w-auto')}
      >
        Anular movimiento
      </SubmitButton>
    </form>
  );
}
