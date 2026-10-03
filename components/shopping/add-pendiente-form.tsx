'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, inputClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { agregarPendienteAction } from '@/server/actions/shopping';
import { PRIORIDAD_LABEL } from '@/types/domain';
import type { ProductoCompraOption, ShoppingActionState } from '@/types/domain';

/**
 * Formulario rapido de pendientes (Fase 6): o un producto del catalogo con su
 * unidad ya resuelta, o un texto libre. Una sola pantalla, sin pasos: esta
 * pensado para agregarse en la puerta del mercado con una mano.
 */
export function AddPendienteForm({
  productos,
  prioridadPorDefecto,
}: {
  productos: ProductoCompraOption[];
  prioridadPorDefecto: number;
}) {
  const [estado, accion] = useActionState<ShoppingActionState, FormData>(
    agregarPendienteAction,
    null,
  );
  const [usarTextoLibre, setUsarTextoLibre] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errores = estado && !estado.ok ? estado.error.fields ?? {} : {};

  // Alta exitosa: resetear el form pero conservar el modo elegido.
  useEffect(() => {
    if (estado?.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form ref={formRef} action={accion} noValidate className="space-y-4">
      <fieldset className="grid grid-cols-2 gap-2 rounded-lg border border-borde p-1 text-sm font-medium">
        <legend className="sr-only">Tipo de pendiente</legend>
        <button
          type="button"
          onClick={() => setUsarTextoLibre(false)}
          aria-pressed={!usarTextoLibre}
          className={`rounded-md px-3 py-2 ${
            !usarTextoLibre ? 'bg-marca-fuerte text-white' : 'text-texto-suave hover:bg-superficie-alterna'
          }`}
        >
          Del catálogo
        </button>
        <button
          type="button"
          onClick={() => setUsarTextoLibre(true)}
          aria-pressed={usarTextoLibre}
          className={`rounded-md px-3 py-2 ${
            usarTextoLibre ? 'bg-marca-fuerte text-white' : 'text-texto-suave hover:bg-superficie-alterna'
          }`}
        >
          Texto libre
        </button>
      </fieldset>

      {usarTextoLibre ? (
        <Field
          id="descripcion"
          label="Qué hay que comprar"
          error={errores.descripcion}
          hint="Ej.: 2 tarrinas de hielo, bolsas grandes."
        >
          <input
            id="descripcion"
            name="descripcion"
            type="text"
            maxLength={300}
            placeholder="Describe lo que falta…"
            className={inputClass}
            autoFocus
            required
          />
        </Field>
      ) : (
        <Field id="producto_id" label="Producto" error={errores.producto_id}>
          <select id="producto_id" name="producto_id" required className={inputClass}>
            <option value="">Elige un producto…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.unidad ? ` (${p.unidad})` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id="cantidad" label="Cantidad" error={errores.cantidad}>
          <input
            id="cantidad"
            name="cantidad"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue={1}
            required
            className={`${inputClass} text-lg font-semibold tabular-nums`}
          />
        </Field>
        <Field id="prioridad" label="Prioridad" error={errores.prioridad}>
          <select
            id="prioridad"
            name="prioridad"
            defaultValue={prioridadPorDefecto}
            required
            className={inputClass}
          >
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {PRIORIDAD_LABEL[p as 1 | 2 | 3]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="proveedor" label="Proveedor (opcional)" error={errores.proveedor}>
        <input id="proveedor" name="proveedor" type="text" maxLength={120} className={inputClass} />
      </Field>

      <Field id="notas" label="Notas (opcional)" error={errores.notas}>
        <input id="notas" name="notas" type="text" maxLength={500} className={inputClass} />
      </Field>

      {estado && !estado.ok && !estado.error.fields ? (
        <p role="alert" className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {estado.error.message}
        </p>
      ) : null}
      {estado?.ok ? (
        <p role="status" className="rounded-lg bg-exito-suave px-3 py-2 text-sm text-exito">
          {estado.data.mensaje}
        </p>
      ) : null}

      <SubmitButton pendingText="Agregando…">Agregar pendiente</SubmitButton>
    </form>
  );
}
