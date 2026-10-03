'use client';

import { useActionState, useState } from 'react';

import { Checkbox, Field, inputClass } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { UNIDAD_BASE, aUnidadBase, desdeUnidadBase } from '@/lib/format/units';
import { saveProductAction } from '@/server/actions/catalog';
import type { ProductDetail, SelectOption } from '@/server/repositories/catalog';
import { MODO_CONTROL, MODO_CONTROL_LABEL } from '@/types/domain';
import type { UnitFormOption } from '@/types/domain';

type ProductoFormProps = {
  producto?: ProductDetail;
  categorias: SelectOption[];
  unidades: UnitFormOption[];
};

/**
 * Alta y edicion de productos.
 *
 * `stock_minimo` se captura en la unidad del producto y el servidor lo guarda
 * convertido a la unidad base (kg para peso) —ADR-009—. El formulario solo lo
 * anticipa; el valor que manda es el del servidor.
 */
export function ProductForm({ producto, categorias, unidades }: ProductoFormProps) {
  const [estado, formAction] = useActionState(saveProductAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  // El alta redirige al listado (el aviso lo lee alla de la URL); la edicion se
  // queda aqui, asi que el exito sale del propio estado de la accion.
  useToastDeEstado(estado, { exito: 'Guardado correctamente. El producto quedó actualizado.' });

  const [unitId, setUnitId] = useState(producto?.unit_id ?? '');
  const [modo, setModo] = useState<string>(producto?.control_mode ?? 'cantidad');

  const unidad = unidades.find((u) => u.value === unitId) ?? null;
  const factor = unidad?.factor_to_base ?? 1;

  // `stock_minimo` se guarda SIEMPRE en la unidad base (kg / u / l) porque es lo
  // que se compara contra el stock; el campo muestra la unidad del producto
  // para que quien captura no tenga que convertir a mano (ADR-011).
  const unidadActual = unidades.find((u) => u.value === producto?.unit_id) ?? null;
  const [stockMinimo, setStockMinimo] = useState(
    String(
      producto ? desdeUnidadBase(producto.stock_minimo, unidadActual?.factor_to_base ?? 1) : 0,
    ),
  );

  const captura = Number(stockMinimo);
  const stockMinimoEnUnidad = Number.isFinite(captura) ? captura : 0;

  const avisoModo =
    (modo === 'peso' || modo === 'ambos') && unidad && unidad.unit_type !== 'peso' ? (
      <p className="text-xs text-aviso">
        El control por peso necesita una unidad de tipo Peso (kg, g, lb).
      </p>
    ) : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {producto ? <input type="hidden" name="id" value={producto.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="sku" label="SKU" error={errores.sku} hint="Código interno único.">
          <input
            id="sku"
            name="sku"
            type="text"
            defaultValue={producto?.sku ?? ''}
            required
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="BEB-001"
            className={inputClass}
          />
        </Field>

        <Field id="barcode" label="Código de barras" error={errores.barcode}>
          <input
            id="barcode"
            name="barcode"
            type="text"
            inputMode="numeric"
            defaultValue={producto?.barcode ?? ''}
            placeholder="Opcional"
            className={inputClass}
          />
        </Field>
      </div>

      <Field id="name" label="Nombre" error={errores.name}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={producto?.name ?? ''}
          required
          placeholder="Agua mineral 600 ml"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="brand" label="Marca" error={errores.brand}>
          <input
            id="brand"
            name="brand"
            type="text"
            defaultValue={producto?.brand ?? ''}
            placeholder="Opcional"
            className={inputClass}
          />
        </Field>

        <Field id="category_id" label="Categoría" error={errores.category_id}>
          <select
            id="category_id"
            name="category_id"
            defaultValue={producto?.category_id ?? ''}
            className={inputClass}
          >
            <option value="">— Sin categoría —</option>
            {categorias.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="unit_id" label="Unidad" error={errores.unit_id} hint="Unidad en la que se cuenta o se pesa.">
          <select
            id="unit_id"
            name="unit_id"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="">— Selecciona una unidad —</option>
            {unidades.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
                {opcion.is_active ? '' : ' (desactivada)'}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="control_mode"
          label="Modo de control"
          error={errores.control_mode}
          hint="Cantidad: piezas. Peso: kilos. Ambos: piezas y kilos."
        >
          <select
            id="control_mode"
            name="control_mode"
            value={modo}
            onChange={(e) => setModo(e.target.value)}
            required
            className={inputClass}
          >
            {MODO_CONTROL.map((opcion) => (
              <option key={opcion} value={opcion}>
                {MODO_CONTROL_LABEL[opcion]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {avisoModo}

      <Field
        id="stock_minimo"
        label={`Stock mínimo${unidad ? ` (${unidad.label})` : ''}`}
        error={errores.stock_minimo}
        hint={
          unidad
            ? `Se compara contra el stock en ${UNIDAD_BASE[unidad.unit_type]}: se guarda como ${aUnidadBase(stockMinimoEnUnidad, factor)} ${UNIDAD_BASE[unidad.unit_type]}.`
            : 'Aviso de reposición cuando el stock calculado baje de este valor.'
        }
      >
        <input
          id="stock_minimo"
          name="stock_minimo"
          type="number"
          inputMode="decimal"
          step="0.001"
          min="0"
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Field id="description" label="Descripción" error={errores.description}>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={producto?.description ?? ''}
          placeholder="Opcional"
          className={inputClass}
        />
      </Field>

      <Field id="notes" label="Notas internas" error={errores.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={producto?.notes ?? ''}
          placeholder="Opcional, no se muestra en la app móvil"
          className={inputClass}
        />
      </Field>

      <Checkbox
        id="is_active"
        label="Activo"
        defaultChecked={producto?.is_active ?? true}
        error={errores.is_active}
      />

      {estado?.ok === false && !estado.error.fields ? (
        <p role="alert" className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {estado.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <SubmitButton pendingText="Guardando…">
          {producto ? 'Guardar cambios' : 'Crear producto'}
        </SubmitButton>
      </div>
    </form>
  );
}
