'use client';

import { useActionState } from 'react';

import { useToastDeEstado } from '@/components/ui/toast';
import { cambiarEstadoPendienteAction } from '@/server/actions/shopping';
import type { EnumValue } from '@/types/database';
import type { ShoppingActionState } from '@/types/domain';

/**
 * Colores de los botones de estado.
 *
 * Los rellenos solidos usan el token fuerte con texto blanco: `aviso` da
 * 7.1:1 y `exito` 5.4:1, los dos por encima de AA. El hover baja un 10% de
 * opacidad en vez de ir a un color literal, para no inventar tonos que no
 * estan en la paleta.
 */
const ESTILO_BOTON: Record<EnumValue<'compras_estado'>, string> = {
  en_proceso:
    'flex-1 min-h-6 rounded-lg bg-aviso px-4 py-3 text-sm font-semibold text-white hover:bg-aviso/90 disabled:opacity-60',
  comprado:
    'flex-1 min-h-6 rounded-lg bg-exito px-4 py-3 text-sm font-semibold text-white hover:bg-exito/90 disabled:opacity-60',
  descartado:
    'flex-1 min-h-6 rounded-lg border-2 border-borde bg-superficie px-4 py-3 text-sm font-semibold text-texto hover:bg-fondo disabled:opacity-60',
  pendiente:
    'flex-1 min-h-6 rounded-lg border-2 border-borde bg-superficie px-4 py-3 text-sm font-semibold text-texto hover:bg-fondo disabled:opacity-60',
};

const ETIQUETA_ACCION: Record<EnumValue<'compras_estado'>, string> = {
  en_proceso: 'Tomar',
  comprado: 'Comprado',
  descartado: 'Descartar',
  pendiente: 'A pendiente',
};

function BotonTransicion({ id, destino }: { id: string; destino: EnumValue<'compras_estado'> }) {
  const [estado, accion, pendiente] = useActionState<ShoppingActionState, FormData>(
    cambiarEstadoPendienteAction,
    null,
  );

  // La accion responde en el sitio (no redirige), asi que el aviso sale del
  // estado. El error se sigue pintando bajo el boton, que es donde esta el dedo.
  useToastDeEstado(estado, { exito: `Estado actualizado: ${ETIQUETA_ACCION[destino].toLowerCase()}.` });

  return (
    <form action={accion} className="flex-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={destino} />
      <button type="submit" disabled={pendiente} className={ESTILO_BOTON[destino]}>
        {pendiente ? 'Cambiando…' : ETIQUETA_ACCION[destino]}
      </button>
      {estado && !estado.ok ? (
        <p role="alert" className="mt-1 rounded-xl bg-peligro-suave px-2 py-1 text-xs text-peligro">
          {estado.error.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Botones GRANDES de cambio de estado rapido: en movil un solo toque manda
 * el pendiente al siguiente paso permitido (la Server Action valida la
 * transicion; si no es posible el error aparece bajo el boton).
 */
export function EstadoButtons({
  id,
  transiciones,
}: {
  id: string;
  transiciones: readonly EnumValue<'compras_estado'>[];
}) {
  if (transiciones.length === 0) {
    return <p className="text-xs text-texto-suave">Este pendiente ya está cerrado.</p>;
  }

  return (
    <div className="flex gap-2">
      {transiciones.map((destino) => (
        <BotonTransicion key={destino} id={id} destino={destino} />
      ))}
    </div>
  );
}
