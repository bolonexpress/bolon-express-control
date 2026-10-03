'use client';

import { useActionState } from 'react';

import { botonClass } from '@/components/ui/button';
import { Field, errorClass, inputClass } from '@/components/ui/field';
import { IconAviso, IconSalir } from '@/components/ui/icons';
import { loginAction } from '@/server/actions/auth';

/**
 * Login.
 *
 * Cambios de la Fase 9:
 *   - Etiquetas visibles y grandes (las ya habia; ahora con el estilo del
 *     sistema).
 *   - El boton es del sistema, con icono y de 56px de alto.
 *   - El error se anuncia en `role="alert"` y dice que hacer.
 *
 * El `placeholder` se mantiene como PISTA, nunca como nombre del campo: si se
 * escribe, desaparece, y un input sin etiqueta se queda sin identificar.
 */
export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [state, formAction] = useActionState(loginAction, { error: initialError });

  return (
    <form action={formAction} className="space-y-5" noValidate={false}>
      <div>
        <h1 className="text-2xl font-bold text-texto">Entrar a la app</h1>
        <p className="mt-1 text-base text-texto-suave">
          Escribe tu correo y tu contraseña.
        </p>
      </div>

      <Field id="email" label="Tu correo">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="nombre@correo.com"
          className={inputClass}
        />
      </Field>

      <Field id="password" label="Tu contraseña">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Escribe tu contraseña"
          className={inputClass}
        />
      </Field>

      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <p role="alert" className={`${errorClass} rounded-xl bg-peligro-suave px-4 py-3 ring-1 ring-peligro/25`}>
          <IconAviso size={22} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state.error !== null}
        className={botonClass('primario', 'lg', 'w-full')}
      >
        <IconSalir size={22} />
        <span>Entrar</span>
      </button>
    </form>
  );
}