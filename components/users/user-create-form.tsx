'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';

import { botonClass } from '@/components/ui/button';
import { Field, errorClass, inputClass, labelClass } from '@/components/ui/field';
import { IconCerrar, IconCheckCirculo, IconOjo } from '@/components/ui/icons';
import { useToastDeEstado } from '@/components/ui/toast';
import { crearUsuarioAction } from '@/server/actions/users';
import { ROLES_KEY, ROL_LABEL, ROL_RESUMEN, type RolKey } from '@/lib/validation/users';
import type { UsuariosActionState } from '@/types/domain';

/**
 * Alta de usuario.
 *
 * La contrasena NO se escribe aqui: la genera el servidor y se muestra una sola
 * vez, en el panel de `ClaveTemporal`. Se decide asi porque una contrasena
 * temporal que el admin elige suele ser debil, y porque el alta no puede
 * redirigir con la clave en la URL (quedaria en el historial del navegador).
 *
 * Los roles salen como radios y no como un `<select>` porque cada uno cambia lo
 * que la persona puede hacer: ver que pasa al elegirlo ayuda a no equivocarse.
 */
export function UserCreateForm() {
  const [estado, formAction] = useActionState<UsuariosActionState, FormData>(
    crearUsuarioAction,
    null,
  );
  const [rol, setRol] = useState<RolKey>('operador');

  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};
  const creado = estado?.ok === true ? estado.data : null;

  // El exito se anuncia como toast Y como panel: el toast dice que paso, el
  // panel contiene la clave, que es lo que hay que hacer ahora.
  useToastDeEstado(estado, { exito: 'Usuario creado. Anota la contraseña que aparece abajo.' });

  if (creado?.claveTemporal) {
    return (
      <div className="space-y-6">
        <ClaveTemporal
          clave={creado.claveTemporal}
          email={creado.email ?? ''}
          onListo={() => window.location.assign('/admin/usuarios')}
        />

        <p className="text-base text-texto-suave">
          ¿Necesitas crear a otra persona? Vuelve al formulario.
        </p>
        <Link href="/admin/usuarios/nuevo" className={botonClass('secundario', 'md')}>
          <IconOjo size={22} />
          <span>Crear otra persona</span>
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Field
        id="full_name"
        label="Nombre y apellido"
        error={errores.full_name}
        hint="Es el nombre que vera el resto del equipo en los movimientos."
      >
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="off"
          placeholder="María Fernanda Quizhpe"
          className={inputClass}
        />
      </Field>

      <Field
        id="email"
        label="Correo"
        error={errores.email}
        hint="Con este correo entra a la app. No se puede cambiar después."
      >
        <input
          id="email"
          name="email"
          type="email"
          required
          inputMode="email"
          autoComplete="off"
          placeholder="maria@bolonexpress.ec"
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
          autoComplete="off"
          placeholder="099 123 4567"
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className={labelClass}>¿Qué puede hacer?</legend>
        {ROLES_KEY.map((key) => (
          <label
            key={key}
            className={`flex min-h-7 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
              rol === key
                ? 'border-marca bg-marca-lima/15'
                : 'border-borde bg-superficie hover:bg-superficie-alterna'
            }`}
          >
            <input
              type="radio"
              name="rol"
              value={key}
              checked={rol === key}
              onChange={() => setRol(key)}
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

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className={errorClass}>
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button type="submit" className={botonClass('primario', 'lg')}>
          <IconCheckCirculo size={22} />
          <span>Crear usuario</span>
        </button>
      </div>

      <p className="text-sm leading-relaxed text-texto-suave">
        Se genera una contraseña temporal de 16 caracteres y se muestra una sola vez. Al primer
        ingreso la persona tendrá que escribir la suya.
      </p>
    </form>
  );
}

/**
 * La contraseña temporal, mostrada UNA vez.
 *
 * Se explica en voz de mostrador qué tiene que hacer con ella, porque quien
 * entra aquí es alguien que quizá nunca haya dado de alta a un usuario: no
 * basta con mostrar 16 caracteres.
 */
function ClaveTemporal({
  clave,
  email,
  onListo,
}: {
  clave: string;
  email: string;
  onListo: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles: la clave se lee a mano, no pasa nada.
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-5 rounded-2xl bg-exito-suave p-5 ring-1 ring-exito/25">
      <div className="flex items-start gap-3">
        <IconCheckCirculo size={26} className="mt-0.5 shrink-0 text-exito" />
        <div>
          <p className="text-lg font-bold text-exito">
            {email} ya existe y puede entrar.
          </p>
          <p className="mt-1 text-base leading-relaxed text-texto">
            Entrégasela <strong>en mano</strong>. Cuando la use por primera vez, la app le pedirá
            escribir una contraseña suya.
          </p>
        </div>
      </div>

      <p className="text-base font-semibold text-texto">Contraseña temporal</p>
      <p className="flex flex-wrap items-center gap-3 font-mono text-2xl font-bold tracking-wide text-texto">
        <span>{clave}</span>
        <button
          type="button"
          onClick={copiar}
          className="rounded-xl bg-superficie px-3 py-2 text-sm font-semibold text-marca ring-2 ring-marca/35 hover:bg-marca-lima/25"
        >
          {copiado ? 'Copiada' : 'Copiar'}
        </button>
      </p>

      <p className="flex items-start gap-2 text-sm leading-relaxed text-texto-suave">
        <IconCerrar size={22} className="mt-0.5 shrink-0" />
        <span>
          Esta clave <strong>no se vuelve a mostrar</strong>. Si se pierde, vuelve a esta pantalla y
          genera otra.
        </span>
      </p>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button type="button" onClick={onListo} className={botonClass('primario', 'md')}>
          <span>Ya la anoté, ir al listado</span>
        </button>
      </div>
    </div>
  );
}