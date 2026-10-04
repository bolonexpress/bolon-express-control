'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { PhotoInput } from '@/components/movements/photo-input';
import { ProductPicker } from '@/components/movements/product-picker';
import { botonClass } from '@/components/ui/button';
import { errorClass, inputClass } from '@/components/ui/field';
import {
  IconAtras,
  IconAviso,
  IconCamara,
  IconCheck,
  IconCheckCirculo,
  IconDerecha,
  IconEtiqueta,
  IconReloj,
} from '@/components/ui/icons';
import { BarraPasos } from '@/components/ui/progress-steps';
import { SubmitButton } from '@/components/ui/submit-button';
import { useToastDeEstado } from '@/components/ui/toast';
import { formatearCantidad } from '@/lib/format/units';
import { nuevoUuid } from '@/lib/uuid';
import { CAMPO_FORMULARIO, validarValoresSegunModo } from '@/lib/validation/movements';
import type { RegistrarMovimientoInput } from '@/lib/validation/movements';
import { consultarStockAction, registrarMovimientoAction } from '@/server/actions/movements';
import type { ProductoParaFormulario } from '@/server/actions/movements';
import { MOTIVOS_POR_TIPO, MOVIMIENTO_MOTIVO_LABEL } from '@/types/domain';
import type { EnumValue } from '@/types/database';

type TipoMovimiento = EnumValue<'movimiento_tipo'>;

/**
 * Asistente de 3 pasos para entrada, salida y ajuste (Fase 9).
 *
 * Antes era un formulario largo de una sola pantalla: ocho campos, un boton al
 * final y quien no био la foto se enteraba al guardar. Ahora son tres pasos con
 * barra de progreso, un boton "Continuar" enorme en cada uno y un RESUMEN antes
 * de confirmar, con la frase que explica que va a pasar con el inventario.
 *
 * Reglas que no se negocian:
 *   - El contrato del `FormData` no cambia (los mismos `name`). El servidor no
 *     sabe que hay pasos.
 *   - Los pasos NO visibles siguen montados con el atributo `hidden`: asi sus
 *     valores viajan en el submit y no se pierde nada al saltar de un paso a
 *     otro. El `noValidate` del formulario evita que un `required` de un paso
 *     oculto bloquee el submit.
 *   - Si el servidor devuelve un error de un campo, se salta al paso que lo
 *     contiene, para que el mensaje y el campo esten en pantalla a la vez.
 */

const TITULOS_PASOS = ['Producto', 'Cantidad y foto', 'Revisa y guarda'] as const;

/** Paso en el que vive cada campo, para saltar ahi cuando el servidor se queja. */
const PASO_DE_CAMPO: Record<string, number> = {
  [CAMPO_FORMULARIO]: 0,
  tipo: 0,
  idempotency_key: 0,
  producto_id: 0,
  cantidad: 1,
  peso_kg: 1,
  foto: 1,
  motivo: 2,
  notes: 2,
};

type ClavesSinControl = Exclude<
  keyof RegistrarMovimientoInput,
  'producto_id' | 'cantidad' | 'peso_kg' | 'motivo' | 'notes' | 'foto'
>;

const CAMPOS_CON_CONTROL: readonly string[] = [
  'producto_id',
  'cantidad',
  'peso_kg',
  'motivo',
  'notes',
  'foto',
];

const ETIQUETA_SIN_CONTROL: Record<ClavesSinControl, string> = {
  tipo: 'Tipo de movimiento',
  idempotency_key: 'Clave de idempotencia',
};

/**
 * Errores del esquema que no tienen control visible (`tipo`, `idempotency_key`,
 * `_form`): se listan uno a uno con su nombre legible. Un issue sin `path`
 * llega con la clave `CAMPO_FORMULARIO`, que no pertenece al esquema y por eso
 * se resuelve aparte.
 */
function ErroresSinCampo({ errores }: { errores: Record<string, string> }) {
  const pendientes = Object.entries(errores).filter(([clave]) => !CAMPOS_CON_CONTROL.includes(clave));
  if (pendientes.length === 0) return null;

  const nombre = (clave: string) =>
    clave === CAMPO_FORMULARIO
      ? 'Formulario'
      : ETIQUETA_SIN_CONTROL[clave as ClavesSinControl] ?? clave;

  return (
    <ul role="alert" className="space-y-1 rounded-xl bg-peligro-suave px-4 py-3 text-base text-peligro ring-1 ring-peligro/25">
      {pendientes.map(([clave, mensaje]) => (
        <li key={clave}>
          <span className="font-bold">{nombre(clave)}</span>: {mensaje}
        </li>
      ))}
    </ul>
  );
}

/** Linea del resumen: etiqueta a la izquierda, dato a la derecha. */
function FilaResumen({
  icono,
  etiqueta,
  valor,
  destacado = false,
}: {
  icono?: React.ReactNode;
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-borde py-3 last:border-0">
      <span className="flex items-center gap-2 text-base text-texto-suave">
        {icono}
        {etiqueta}
      </span>
      <span
        className={`text-right text-base ${destacado ? 'font-bold text-texto' : 'font-semibold text-texto'}`}
      >
        {valor}
      </span>
    </li>
  );
}

export function MovementForm({
  tipo,
  productos,
  exigeFoto,
  maxFotoBytes,
}: {
  tipo: TipoMovimiento;
  productos: ProductoParaFormulario[];
  exigeFoto: boolean;
  maxFotoBytes: number;
}) {
  const [estado, formAction] = useActionState(registrarMovimientoAction, null);
  const errores = estado?.ok === false ? (estado.error.fields ?? {}) : {};

  const [paso, setPaso] = useState(0);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [motivo, setMotivo] = useState<string>(MOTIVOS_POR_TIPO[tipo][0] ?? 'otro');
  const [stock, setStock] = useState<ProductoParaFormulario | null>(null);
  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => nuevoUuid());

  // Al cambiar de paso el foco se lleva a la zona de pasos: sin esto, quien
  // navega con teclado se queda en el boton "Continuar" del final y el lector de
  // pantalla no anuncia el paso nuevo. El primer render queda fuera a proposito
  // (arrancar con el foco ya movido roba el foco a la pagina nada mas abrirla).
  const zonaPasos = useRef<HTMLDivElement>(null);
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    zonaPasos.current?.focus();
  }, [paso]);

  const esAjuste = tipo === 'ajuste';
  const textoGuardar = esAjuste
    ? 'Guardar el ajuste'
    : tipo === 'entrada'
      ? 'Guardar la entrada'
      : 'Guardar la salida';

  // El stock se pide al servidor al elegir producto: la lista que viene en la
  // pagina puede tener horas en un movil abierto.
  useEffect(() => {
    let vigente = true;
    if (!productoId) {
      setStock(null);
      return;
    }
    void consultarStockAction(productoId).then((r) => {
      if (vigente) setStock(r.producto);
    });
    return () => {
      vigente = false;
    };
  }, [productoId]);

  // Regenera la clave ante cualquier cambio de dato (ADR-006): un doble toque
  // reintenta con la misma clave y la RPC devuelve el movimiento original.
  // `nuevoUuid()` y no `crypto.randomUUID()` porque esta pantalla se abre
  // tambien por IP en HTTP plano, donde la API nativa no existe (ADR-020).
  const firma = JSON.stringify([tipo, productoId, cantidad, pesoKg, motivo]);
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firmaVista !== firma) {
    setFirmaVista(firma);
    setIdempotencyKey(nuevoUuid());
  }

  // Si el servidor devuelve un error, se abre el paso que contiene el campo.
  useEffect(() => {
    if (!estado || estado.ok) return;
    const campos = Object.keys(estado.error.fields ?? {});
    const destino = campos
      .map((campo) => PASO_DE_CAMPO[campo])
      .filter((indice): indice is number => indice !== undefined);
    if (destino.length > 0) setPaso(Math.min(...destino));
  }, [estado]);

  // Los errores que no son de campo (Storage, bucket, red) se anuncian como
  // aviso emergente; los de campo los pinta cada control.
  useToastDeEstado(estado, { silenciarValidacion: true });

  const producto = productos.find((p) => p.id === productoId) ?? null;
  const actual = stock ?? producto;

  const modo = actual?.control_mode ?? 'cantidad';
  const muestraCantidad = modo === 'cantidad' || modo === 'ambos';
  const muestraPeso = modo === 'peso' || modo === 'ambos';

  const numeroCantidad = Number(cantidad);
  const numeroPeso = Number(pesoKg);

  // Chequeo en vivo: mismo criterio que aplica el servidor antes de la RPC.
  const sinStock = (() => {
    if (tipo !== 'salida' || !actual) return null;
    const faltaCantidad =
      muestraCantidad &&
      cantidad.trim() !== '' &&
      Number.isFinite(numeroCantidad) &&
      numeroCantidad > actual.stock_disponible;
    const faltaPeso =
      muestraPeso &&
      pesoKg.trim() !== '' &&
      Number.isFinite(numeroPeso) &&
      modo === 'peso' &&
      numeroPeso > actual.stock_peso_kg;
    if (!faltaCantidad && !faltaPeso) return null;
    const disponible = modo === 'peso' ? actual.stock_peso_kg : actual.stock_disponible;
    const unidad = modo === 'peso' ? 'kg' : actual.unidad;
    return `Inventario insuficiente. Disponible: ${formatearCantidad(disponible)} ${unidad}`;
  })();

  const decimalesPermitidos = Math.min(
    actual?.allow_fractional ? (actual?.decimals ?? 3) : 0,
    3,
  );

  /**
   * Que impide pasar al paso siguiente. `null` = se puede pasar. Es una comprobacion
   * de EXPERIENCIA: el servidor sigue validando igual (fail-closed), esto solo
   * evita el viaje de ida y vuelta con el error pintado al final.
   */
  function bloqueo(pasoActual: number): string | null {
    if (pasoActual === 0) {
      return productoId === '' ? 'Primero elige un producto.' : null;
    }
    if (pasoActual === 1) {
      if (!muestraCantidad && !muestraPeso) return null;
      if (muestraCantidad && !muestraPeso && cantidad.trim() === '') {
        return 'Escribe cuántas unidades entran o salen.';
      }
      if (muestraPeso && !muestraCantidad && pesoKg.trim() === '') {
        return 'Escribe el peso en kilogramos.';
      }
      // `validarValoresSegunModo` trabaja con numeros: el vacio se traduce a
      // `undefined` (que es lo que el RPC espera) y un texto no numerico se
      // avisa aqui, porque `Number('abc')` es NaN y NaN no es "falta".
      if (muestraCantidad && cantidad.trim() !== '' && !Number.isFinite(numeroCantidad)) {
        return 'En la cantidad escribe solo números.';
      }
      if (muestraPeso && pesoKg.trim() !== '' && !Number.isFinite(numeroPeso)) {
        return 'En el peso escribe solo números.';
      }
      const erroresModo = validarValoresSegunModo(
        {
          cantidad: cantidad.trim() === '' ? undefined : numeroCantidad,
          peso_kg: pesoKg.trim() === '' ? undefined : numeroPeso,
        },
        modo,
      );
      const primero = Object.values(erroresModo)[0];
      if (primero) return primero;
      if (exigeFoto && !fotoArchivo) return 'Falta la foto: tócala para elegirla.';
      if (sinStock) return sinStock;
      return null;
    }
    return null;
  }

  const bloqueando = bloqueo(paso);
  const puedeAvanzar = bloqueando === null;

  function avanzar() {
    if (!puedeAvanzar) return;
    setPaso((p) => Math.min(TITULOS_PASOS.length - 1, p + 1));
  }

  const lineaCantidad = (() => {
    if (muestraCantidad && cantidad.trim() !== '') {
      const unidad = actual?.unidad ?? 'unidades';
      const numero = Number(cantidad);
      const texto = Number.isFinite(numero)
        ? `${formatearCantidad(numero)} ${unidad}`
        : cantidad;
      return muestraPeso && pesoKg.trim() !== ''
        ? `${texto} · ${formatearCantidad(Number(pesoKg) || 0)} kg`
        : texto;
    }
    if (muestraPeso && pesoKg.trim() !== '') {
      return `${formatearCantidad(Number(pesoKg) || 0)} kg`;
    }
    return 'Sin cantidad';
  })();

  /** La frase que explica el efecto en el inventario, en voz cotidiana. */
  const efectoInventario = (() => {
    if (!producto) return '';
    const magnitud = esAjuste
      ? lineaCantidad
      : `${tipo === 'entrada' ? '+' : '−'}${lineaCantidad}`;
    if (esAjuste) return `El inventario de ${producto.nombre} cambiará en ${lineaCantidad}.`;
    return `El inventario de ${producto.nombre} ${tipo === 'entrada' ? 'subirá' : 'bajará'} ${magnitud}.`;
  })();

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <BarraPasos pasos={TITULOS_PASOS} actual={paso} />

      <ErroresSinCampo errores={errores} />

      <div ref={zonaPasos} tabIndex={-1} className="focus:outline-none">
        {/* ----------------------------------------------------------------
          Paso 1 · Producto
          ---------------------------------------------------------------- */}
      <div hidden={paso !== 0}>
        <div className="space-y-4">
          <p className="text-lg text-texto-suave">
            ¿Qué producto querés registrar?
          </p>

          <ProductPicker
            productos={productos}
            valor={productoId}
            onSelect={setProductoId}
            error={errores.producto_id}
          />

          {actual ? (
            <dl className="grid gap-3 rounded-xl bg-superficie-alterna p-4 ring-1 ring-borde sm:grid-cols-3">
              <div>
                <dt className="text-sm text-texto-suave">Disponible ahora</dt>
                <dd className="text-lg font-bold text-texto">
                  {formatearCantidad(actual.stock_disponible)} {actual.unidad}
                </dd>
              </div>
              {modo === 'peso' || modo === 'ambos' ? (
                <div>
                  <dt className="text-sm text-texto-suave">Peso disponible</dt>
                  <dd className="text-lg font-bold text-texto">
                    {formatearCantidad(actual.stock_peso_kg)} kg
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-sm text-texto-suave">Mínimo</dt>
                <dd className="text-lg font-bold text-texto">
                  {formatearCantidad(actual.stock_minimo)} {actual.unidad}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Paso 2 · Cantidad y foto
          ------------------------------------------------------------------ */}
      <div hidden={paso !== 1}>
        <div className="space-y-5">
          <p className="text-lg text-texto-suave">
            {tipo === 'entrada'
              ? '¿Cuánto entró?'
              : tipo === 'salida'
                ? '¿Cuánto salió?'
                : '¿Cuánto hay que corregir?'}
          </p>

          {muestraCantidad ? (
            <div className="space-y-2">
              <label htmlFor="cantidad" className="block text-base font-semibold text-texto">
                Cantidad {esAjuste ? '(puedes poner − para quitar)' : `(${actual?.unidad ?? 'unidades'})`}
              </label>
              <input
                id="cantidad"
                name="cantidad"
                type="number"
                inputMode="decimal"
                step={decimalesPermitidos > 0 ? '0.001' : '1'}
                min={esAjuste ? undefined : '0'}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required={!muestraPeso}
                autoFocus
                aria-invalid={errores.cantidad ? true : undefined}
                className={`${inputClass} text-center text-4xl font-bold tabular-nums`}
              />
              {errores.cantidad ? (
                <p role="alert" className={errorClass}>
                  <IconAviso size={22} className="mt-0.5 shrink-0" />
                  <span>{errores.cantidad}</span>
                </p>
              ) : (
                <p className="text-sm text-texto-suave">Piezas o unidades. Usa el «−» si restan.</p>
              )}
            </div>
          ) : null}

          {muestraPeso ? (
            <div className="space-y-2">
              <label htmlFor="peso_kg" className="block text-base font-semibold text-texto">
                Peso (kg)
              </label>
              <input
                id="peso_kg"
                name="peso_kg"
                type="number"
                inputMode="decimal"
                step="0.001"
                min={esAjuste ? undefined : '0'}
                value={pesoKg}
                onChange={(e) => setPesoKg(e.target.value)}
                required={!muestraCantidad}
                autoFocus={!muestraCantidad}
                aria-invalid={errores.peso_kg ? true : undefined}
                className={`${inputClass} text-center text-4xl font-bold tabular-nums`}
              />
              {errores.peso_kg ? (
                <p role="alert" className={errorClass}>
                  <IconAviso size={22} className="mt-0.5 shrink-0" />
                  <span>{errores.peso_kg}</span>
                </p>
              ) : (
                <p className="text-sm text-texto-suave">
                  Se guarda siempre en kilogramos, aunque uses otra unidad.
                </p>
              )}
            </div>
          ) : null}

          {/* Aviso de inventario insuficiente: es distinto del bloqueo del paso (que
              puede estar avisando de la foto), asi que se muestra aqui y no se
              esconde detras del mensaje unico. */}
          {sinStock ? (
            <p role="alert" className={`${errorClass} rounded-xl bg-peligro-suave px-4 py-3 ring-1 ring-peligro/25`}>
              <IconAviso size={22} className="mt-0.5 shrink-0" />
              <span>{sinStock}</span>
            </p>
          ) : null}

          <PhotoInput
            required={exigeFoto}
            maxBytes={maxFotoBytes}
            error={errores.foto}
            onCambia={setFotoArchivo}
            resultadoEnvio={estado}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Paso 3 · Motivo, observaciones y resumen
          ------------------------------------------------------------------ */}
      <div hidden={paso !== 2}>
        <div className="space-y-5">
          <p className="text-lg text-texto-suave">¿Por qué lo registrás?</p>

          <div className="space-y-2">
            <label htmlFor="motivo" className="block text-base font-semibold text-texto">
              Motivo
              {/* El motivo es obligatorio y la observación de abajo no. Se marca
                  aqui, y no solo en el "?" de la cabecera, porque en este paso
                  los dos campos se ven juntos y parecen igual de necesarios. */}
              <span className="ml-2 rounded-lg bg-peligro-suave px-2 py-0.5 text-sm font-bold text-peligro ring-1 ring-peligro/25">
                Obligatorio
              </span>
            </label>
            <select
              id="motivo"
              name="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              aria-invalid={errores.motivo ? true : undefined}
              className={inputClass}
            >
              {MOTIVOS_POR_TIPO[tipo].map((opcion) => (
                <option key={opcion} value={opcion}>
                  {MOVIMIENTO_MOTIVO_LABEL[opcion]}
                </option>
              ))}
            </select>
            {errores.motivo ? (
              <p role="alert" className={errorClass}>
                <IconAviso size={22} className="mt-0.5 shrink-0" />
                <span>{errores.motivo}</span>
              </p>
            ) : (
              <p className="text-sm text-texto-suave">Queda escrito en la bitácora.</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="block text-base font-semibold text-texto">
              Observaciones
              <span className="ml-2 text-sm font-normal text-texto-suave">(opcional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Algo que quieras recordar"
              aria-invalid={errores.notes ? true : undefined}
              className={inputClass}
            />
            {errores.notes ? (
              <p role="alert" className={errorClass}>
                <IconAviso size={22} className="mt-0.5 shrink-0" />
                <span>{errores.notes}</span>
              </p>
            ) : null}
          </div>

          {/* El resumen: la ultima pantalla antes de guardar dice exactamente lo
              que va a pasar, para que el guardado no sea un salto al vacío. */}
          <section className="rounded-2xl bg-marca-lima/25 p-4 ring-2 ring-marca/25">
            <h3 className="flex items-center gap-2 text-lg font-bold text-texto">
              <IconCheckCirculo size={24} />
              Revisa antes de guardar
            </h3>

            <ul className="mt-2">
              <FilaResumen
                icono={<IconEtiqueta size={22} />}
                etiqueta="Producto"
                valor={producto ? `${producto.nombre} (${producto.codigo})` : 'Sin elegir'}
              />
              <FilaResumen
                etiqueta={esAjuste ? 'Corrección' : 'Cantidad'}
                valor={lineaCantidad}
                destacado
              />
              <FilaResumen
                icono={<IconReloj size={22} />}
                etiqueta="Motivo"
                valor={MOVIMIENTO_MOTIVO_LABEL[motivo as keyof typeof MOVIMIENTO_MOTIVO_LABEL] ?? motivo}
              />
              <FilaResumen
                icono={<IconCamara size={22} />}
                etiqueta="Foto"
                valor={fotoArchivo ? 'Sí, adjunta' : 'No'}
              />
            </ul>

            {efectoInventario ? (
              <p className="mt-3 rounded-xl bg-superficie px-4 py-3 text-base font-semibold text-texto">
                {efectoInventario}
              </p>
            ) : null}
          </section>

          {estado?.ok === false ? (
            <p
              role="alert"
              className={`${errorClass} rounded-xl bg-peligro-suave px-4 py-3 ring-1 ring-peligro/25`}
            >
              <IconAviso size={22} className="mt-0.5 shrink-0" />
              <span>{estado.error.message}</span>
            </p>
          ) : null}

          <SubmitButton
            pendingText="Guardando…"
            className={botonClass('primario', 'xl', 'w-full')}
          >
            <span className="flex items-center justify-center gap-2">
              <IconCheck size={26} />
              {textoGuardar}
            </span>
          </SubmitButton>
        </div>
      </div>

      </div>

      {/* Navegacion entre pasos. Solo aparece si no estamos en el ultimo. */}
      {paso < TITULOS_PASOS.length - 1 ? (
        <div className="space-y-3 border-t border-borde pt-4">
          {bloqueando ? (
            <p role="status" className="rounded-xl bg-aviso-suave px-4 py-3 text-base font-semibold text-aviso ring-1 ring-aviso/25">
              {bloqueando}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            {paso > 0 ? (
              <button
                type="button"
                onClick={() => setPaso((p) => Math.max(0, p - 1))}
                className={botonClass('secundario', 'lg')}
              >
                <IconAtras size={24} />
                Atrás
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={avanzar}
              disabled={!puedeAvanzar}
              className={botonClass('primario', 'lg', 'sm:min-w-[220px]')}
            >
              Continuar
              <IconDerecha size={24} />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-borde pt-4">
          <button
            type="button"
            onClick={() => setPaso((p) => Math.max(0, p - 1))}
            className={botonClass('fantasma', 'md')}
          >
            <IconAtras size={22} />
            Volver a cambiar la cantidad
          </button>
        </div>
      )}
    </form>
  );
}