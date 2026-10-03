'use client';

import { useActionState, useState } from 'react';

import { Checkbox, Field, inputClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { UNIDAD_BASE } from '@/lib/format/units';
import { saveUnitAction } from '@/server/actions/catalog';
import type { UnitListItem } from '@/server/repositories/catalog';
import { UNIDAD_TIPO, UNIDAD_TIPO_LABEL } from '@/types/domain';
import type { UnidadTipo } from '@/types/domain';

/**
 * Alta y edicion de unidades. El factor de conversion se captura aqui y es lo
 * que permite que el resto del sistema trabaje en kg / u / l (ADR-009): el
 * formulario solo anticipa las reglas, `server/actions/catalog.ts` las impone.
 */
export function UnitForm({ unidad }: { unidad?: UnitListItem }) {
  const [estado, formAction] = useActionState(saveUnitAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  // El alta redirige al listado (el aviso lo lee alla de la URL); la edicion se
  // queda aqui, asi que el exito sale del propio estado de la accion.
  useToastDeEstado(estado, { exito: 'Guardado correctamente. La unidad quedó actualizada.' });

  const [tipoUnidad, setTipoUnidad] = useState<UnidadTipo>(unidad?.unit_type ?? 'unidad');
  const [esBase, setEsBase] = useState(unidad?.base_unit ?? false);
  const [factor, setFactor] = useState(String(unidad?.factor_to_base ?? 1));

  const alternarBase = (marcado: boolean) => {
    setEsBase(marcado);
    if (marcado) setFactor('1');
  };

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {unidad ? <input type="hidden" name="id" value={unidad.id} /> : null}

      <Field id="code" label="Código" error={errores.code} hint="Se usa internamente: minúsculas, números y guion bajo (ej. kg, u, lb).">
        <input
          id="code"
          name="code"
          type="text"
          defaultValue={unidad?.code ?? ''}
          required
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="kg"
          className={inputClass}
        />
      </Field>

      <Field id="name" label="Nombre" error={errores.name}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={unidad?.name ?? ''}
          required
          placeholder="Kilogramo"
          className={inputClass}
        />
      </Field>

      <Field
        id="unit_type"
        label="Tipo"
        error={errores.unit_type}
        hint={`Determina la unidad base hacia la que convierte: ${UNIDAD_BASE[tipoUnidad]}.`}
      >
        <select
          id="unit_type"
          name="unit_type"
          value={tipoUnidad}
          onChange={(e) => setTipoUnidad(e.target.value as UnidadTipo)}
          required
          className={inputClass}
        >
          {UNIDAD_TIPO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {UNIDAD_TIPO_LABEL[tipo]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="factor_to_base"
        label={`Factor a ${UNIDAD_BASE[tipoUnidad]}`}
        error={errores.factor_to_base}
        hint={
          esBase
            ? 'Una unidad base no convierte: su factor es 1.'
            : `1 ${unidad?.code || 'unidad'} = factor ${UNIDAD_BASE[tipoUnidad]}. Ej.: libra = 0.45359237, caja de 12 = 12.`
        }
      >
        <input
          id="factor_to_base"
          name="factor_to_base"
          type="number"
          inputMode="decimal"
          step="0.00000001"
          min="0.00000001"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Checkbox
        id="base_unit"
        label={`Es la unidad base de ${UNIDAD_TIPO_LABEL[tipoUnidad].toLowerCase()}`}
        hint="Solo puede haber una activa por tipo: primero desactiva la anterior."
        checked={esBase}
        onChange={alternarBase}
        error={errores.base_unit}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="decimals" label="Decimales permitidos" error={errores.decimals} hint="0 para piezas, 3 para kilos.">
          <input
            id="decimals"
            name="decimals"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="3"
            defaultValue={unidad?.decimals ?? 0}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <Checkbox
        id="allow_fractional"
        label="Permite fracciones"
        hint="Ej.: 0.5 kg. Si no, solo números enteros en esta unidad."
        defaultChecked={unidad?.allow_fractional ?? false}
        error={errores.allow_fractional}
      />

      <Checkbox
        id="is_active"
        label="Activa"
        defaultChecked={unidad?.is_active ?? true}
        error={errores.is_active}
      />

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Guardando…">
          {unidad ? 'Guardar cambios' : 'Crear unidad'}
        </SubmitButton>
      </div>
    </form>
  );
}
