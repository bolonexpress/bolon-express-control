import type { ChangeEvent, ReactNode } from 'react';

import { botonClass } from '@/components/ui/button';
import { IconAviso, IconCheckCirculo } from '@/components/ui/icons';

/**
 * Primitivos de formulario compartidos por toda la app.
 * Sin `'use client'`: los usan tanto Server Components como los formularios
 * interactivos, y no pasan funciones a traves del limite.
 *
 * Reglas de la Fase 9 aplicadas aqui, que es donde se ganha el resto:
 *   - Etiqueta SIEMPRE visible. El `placeholder` es una pista, nunca el nombre
 *     del campo: desaparece al escribir y deja el input sin identificar.
 *   - Controles de 56px de alto (`min-h-7` con rejilla de 8px), por encima del
 *     minimo tactil de 48px.
 *   - El error se pinta bajo el campo Y se marca el borde con `aria-invalid`.
 *     Los dos: el texto para quien lee, el color para quien escanea.
 */

/**
 * Los controles que reciben `aria-invalid` (cuando la Server Action devuelve
 * error para ese campo) se marcan con borde y foco rojos.
 *
 * Fase 12B: el alto de 56px se mantiene en movil (es el minimo que garantiza
 * acertar con el dedo), pero el relleno baja: la caja no crece de alto, lo que
 * se recorta es el aire de los lados, que en un campo de formulario es aire que
 * no aporta nada.
 */
export const inputClass =
  'w-full min-h-7 rounded-xl border-2 border-borde bg-superficie px-3 py-2.5 text-base text-texto placeholder:text-texto-tenue focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/20 disabled:bg-fondo disabled:text-texto-suave aria-invalid:border-peligro aria-invalid:focus:ring-peligro/20 sm:px-4 sm:py-3';

/** Etiqueta: 15px en movil, 17px en escritorio. El nombre del campo va grande. */
export const labelClass = 'block text-[15px] font-semibold text-texto sm:text-base';

export const helpClass = 'text-sm text-texto-suave';

/** Boton de formulario: ancho completo en movil, ancho de contenido en escritorio. */
export const botonPrimarioClass = botonClass('primario', 'lg', 'w-full sm:w-auto');

export const errorClass = 'flex items-start gap-2 text-sm font-medium text-peligro sm:text-base';

type FieldProps = {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
};

/**
 * Etiqueta + control + error bajo el control.
 *
 * El error va en `role="alert"`: se anuncia en cuanto llega, sin que el usuario
 * tenga que recorrer el formulario buscandolo. El `hint` va despues del control
 * y antes del error, porque una ayuda no debe competir con un fallo.
 */
export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5 sm:space-y-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint ? <p className={helpClass}>{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

type CheckboxProps = {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  defaultChecked?: boolean;
  /** Modo controlado: los formularios que reaccionan a cambios lo necesitan. */
  checked?: boolean;
  onChange?: (marcado: boolean) => void;
};

/**
 * Checkbox grande: 32px de caja y 56px de alto de fila. En movil es el unico
 * control comodo para marcar y desmarcar.
 */
export function Checkbox({
  id,
  label,
  error,
  hint,
  defaultChecked,
  checked,
  onChange,
}: CheckboxProps) {
  const controlada = checked !== undefined;

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <div className="flex min-h-7 items-center gap-3 rounded-xl border-2 border-borde bg-superficie px-3 py-2.5 sm:px-4 sm:py-3">
        <input
          id={id}
          name={id}
          type="checkbox"
          {...(controlada
            ? {
                checked,
                onChange: (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked),
              }
            : { defaultChecked })}
          className="size-[32px] shrink-0 rounded-lg border-2 border-borde-fuerte accent-marca focus:ring-4 focus:ring-marca/20"
        />
        <label htmlFor={id} className="text-[15px] font-medium text-texto sm:text-base">
          {label}
        </label>
      </div>
      {hint ? <p className={helpClass}>{hint}</p> : null}
      {error ? (
        <p role="alert" className={errorClass}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Superficie de alto contraste. Mismo aspecto que `Card` de `components/ui/card`. */
export const tarjetaClass =
  'rounded-2xl bg-superficie p-4 shadow-tarjeta ring-1 ring-borde sm:p-6';

/** Aviso de exito dentro de un formulario (mismo tono que los toasts). */
export function ExitoInline({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-exito-suave px-4 py-3 text-base font-medium text-exito ring-1 ring-exito/25">
      <IconCheckCirculo size={22} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}