'use client';

import { useActionState } from 'react';

import { Checkbox, Field, inputClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { saveCategoryAction } from '@/server/actions/catalog';
import type { CategoryListItem, SelectOption } from '@/server/repositories/catalog';

/**
 * Alta y edicion de categorias. `opcionesPadre` llega ya filtrada por la
 * pagina (fuera la propia categoria y sus descendientes): la jerarquia no
 * puede crear ciclos y la comprobacion final vive en el servidor.
 */
export function CategoryForm({
  categoria,
  opcionesPadre,
}: {
  categoria?: CategoryListItem;
  opcionesPadre: SelectOption[];
}) {
  const [estado, formAction] = useActionState(saveCategoryAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  // El alta redirige al listado (el aviso lo lee alla de la URL); la edicion se
  // queda aqui, asi que el exito sale del propio estado de la accion.
  useToastDeEstado(estado, { exito: 'Guardado correctamente. La categoría quedó actualizada.' });

  const nivelActual = categoria?.parent_id ?? '';

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {categoria ? <input type="hidden" name="id" value={categoria.id} /> : null}

      <Field id="name" label="Nombre" error={errores.name}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={categoria?.name ?? ''}
          required
          placeholder="Bebidas"
          className={inputClass}
        />
      </Field>

      <Field
        id="code"
        label="Código (opcional)"
        error={errores.code}
        hint="Identificador corto para listados e importaciones."
      >
        <input
          id="code"
          name="code"
          type="text"
          defaultValue={categoria?.code ?? ''}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="bebidas"
          className={inputClass}
        />
      </Field>

      <Field
        id="parent_id"
        label="Categoría superior"
        error={errores.parent_id}
        hint="Déjalo vacío si es una categoría principal."
      >
        <select
          id="parent_id"
          name="parent_id"
          defaultValue={nivelActual}
          className={inputClass}
        >
          <option value="">— Sin categoría superior —</option>
          {opcionesPadre.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="sort_order" label="Orden" error={errores.sort_order} hint="Menor número aparece primero.">
        <input
          id="sort_order"
          name="sort_order"
          type="number"
          inputMode="numeric"
          step="1"
          defaultValue={categoria?.sort_order ?? 0}
          required
          className={inputClass}
        />
      </Field>

      <Checkbox
        id="is_active"
        label="Activa"
        defaultChecked={categoria?.is_active ?? true}
        error={errores.is_active}
      />

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Guardando…">
          {categoria ? 'Guardar cambios' : 'Crear categoría'}
        </SubmitButton>
      </div>
    </form>
  );
}
