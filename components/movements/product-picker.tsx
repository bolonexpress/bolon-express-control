'use client';

import { useId, useMemo, useState } from 'react';

import { Field, errorClass, inputClass } from '@/components/ui/field';
import { IconAviso, IconBuscar, IconCerrar } from '@/components/ui/icons';
import type { ProductoParaFormulario } from '@/server/actions/movements';

/**
 * Selector de producto con busqueda. En movil un `<select>` nativo con cientos
 * de productos es inutilizable, asi que se busca por nombre, codigo o SKU y se
 * elige tocando un resultado.
 *
 * El id viaja en un input oculto (`producto_id`); el texto de busqueda no se
 * envia nunca, de modo que el servidor solo ve el UUID.
 *
 * Fase 9: etiqueta siempre visible, resultados de 48px de alto (se tocan con el
 * dedo) y el error se pinta aqui, que es donde el usuario esta mirando.
 */
export function ProductPicker({
  productos,
  valor,
  onSelect,
  error,
}: {
  productos: ProductoParaFormulario[];
  valor: string;
  onSelect: (id: string) => void;
  error?: string | undefined;
}) {
  const [consulta, setConsulta] = useState('');
  const listaId = useId();

  const normalizado = consulta.trim().toLowerCase();
  const encontrados = useMemo(() => {
    if (!normalizado) return [];
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(normalizado) ||
          p.codigo.toLowerCase().includes(normalizado) ||
          p.sku.toLowerCase().includes(normalizado),
      )
      .slice(0, 8);
  }, [normalizado, productos]);

  const seleccionado = productos.find((p) => p.id === valor) ?? null;

  if (seleccionado) {
    return (
      <div className="space-y-2">
        <input type="hidden" name="producto_id" value={valor} />

        <p className="text-base font-semibold text-texto">Producto</p>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-marca px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{seleccionado.nombre}</p>
            <p className="truncate text-sm text-white/85">
              {seleccionado.codigo} · {seleccionado.sku}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect('');
              setConsulta('');
            }}
            className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-xl bg-superficie/15 px-3 text-base font-semibold underline underline-offset-4 transition-colors hover:bg-superficie/25"
          >
            <IconCerrar size={20} />
            Cambiar
          </button>
        </div>

        {error ? (
          <p role="alert" className={errorClass}>
            <IconAviso size={22} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Field id="buscar-producto" label="Producto" error={error}>
      <input type="hidden" name="producto_id" value={valor} />

      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-texto-tenue"
        >
          <IconBuscar size={22} />
        </span>
        <input
          id="buscar-producto"
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && encontrados.length > 0) {
              e.preventDefault();
              onSelect(encontrados[0]!.id);
              setConsulta('');
            }
          }}
          placeholder="Escribe el nombre del producto"
          autoComplete="off"
          role="combobox"
          aria-expanded={encontrados.length > 0}
          aria-controls={listaId}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} pl-12`}
        />
      </div>

      {normalizado ? (
        <ul
          id={listaId}
          className="divide-y divide-borde overflow-hidden rounded-xl bg-superficie ring-1 ring-borde"
        >
          {encontrados.length === 0 ? (
            <li className="px-4 py-4 text-base text-texto-suave">
              Ningún producto se llama así. Prueba con menos letras o búscalo por código.
            </li>
          ) : (
            encontrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setConsulta('');
                  }}
                  className="flex min-h-6 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-marca-lima/25"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold text-texto">
                      {p.nombre}
                    </span>
                    <span className="block text-sm text-texto-suave">
                      {p.codigo} · {p.sku}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-marca">{p.unidad}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className="text-sm text-texto-suave">
          También puedes buscar por código o por SKU.
        </p>
      )}
    </Field>
  );
}