import { redirect } from 'next/navigation';

import { MovementForm } from '@/components/movements/movement-form';
import { PageHeader } from '@/components/ui/page-header';
import { contextHasPermission, getAuthContext } from '@/server/auth/guards';
import { getConfigMovimientos, listProductosOperables } from '@/server/repositories/movements';
import { PERMISOS } from '@/types/domain';
import type { EnumValue } from '@/types/database';
import type { ProductoParaFormulario } from '@/server/actions/movements';

type TipoMovimiento = EnumValue<'movimiento_tipo'>;

type Ayuda = { resumen: string; pasos: string[]; nota?: string };

/**
 * Copia de las tres pantallas de movimiento, en lenguaje de mostrador.
 *
 * Fase 9: los titulos dicen QUE SE HACE ("Recibir mercancía", no "Registrar
 * entrada"), la descripcion dice por que sirve en una frase, y el botón "?" de
 * la cabecera explica los tres pasos del asistente sin obligar a escribir.
 *
 * **El paso 3 nombra las dos reglas del negocio** (ADR-019): el motivo es
 * obligatorio y la observación es opcional. Es la duda mas frecuente al abrir
 * estas pantallas, porque el formulario las muestra juntas y las dos parecen
 * igual de necesarias. Se dice en el "?" y no se deduce del asterisco: nadie
 * deberia tener que guardar para averiguarlo.
 *
 * Vive en un objeto por tipo para que la pantalla sea una sola: el flujo, los
 * permisos y el formulario son identicos, solo cambian las palabras.
 */
const COPIA: Record<TipoMovimiento, { titulo: string; descripcion: string; ayuda: Ayuda }> = {
  entrada: {
    titulo: 'Recibir mercancía',
    descripcion: 'Entró mercadería nueva. Anótalo para que el inventario sepa qué hay.',
    ayuda: {
      resumen: 'Registras lo que entra en la tienda: una compra, una devolución o lo que producen.',
      pasos: [
        'Paso 1: busca el producto por nombre, código o SKU y tócalo.',
        'Paso 2: escribe cuántas unidades entraron y toma la foto.',
        'Paso 3: elige el motivo (obligatorio), escribe observaciones si quieres y toca «Guardar la entrada».',
      ],
      nota: 'El motivo es obligatorio y la observación es opcional. Si el producto no aparece, primero hay que crearlo en «Productos».',
    },
  },
  salida: {
    titulo: 'Sacar mercancía',
    descripcion: 'Vendiste algo o lo usaste en la tienda. Anótalo para que el inventario baje.',
    ayuda: {
      resumen: 'Registras lo que sale: ventas, consumo propio o mermas.',
      pasos: [
        'Paso 1: busca el producto y tócalo.',
        'Paso 2: escribe cuánto salió y toma la foto.',
        'Paso 3: elige el motivo (obligatorio), escribe observaciones si quieres y toca «Guardar la salida».',
      ],
      nota: 'El motivo es obligatorio y la observación es opcional. Si no hay suficiente inventario, el sistema te avisa antes de guardar.',
    },
  },
  ajuste: {
    titulo: 'Corregir el inventario',
    descripcion: '¿Algo se rompió, se perdió o se anotó mal? Corrige el número aquí.',
    ayuda: {
      resumen:
        'Un ajuste corrige el inventario sin decir que entró ni que salió: sirve para una merma o un conteo físico.',
      pasos: [
        'Paso 1: busca el producto.',
        'Paso 2: escribe la cantidad real que hay. Si sobra, pon un número negativo.',
        'Paso 3: elige el motivo (obligatorio), escribe observaciones si quieres y toca «Guardar el ajuste».',
      ],
      nota: 'En un ajuste el motivo es obligatorio y la observación es opcional. Queda todo en la bitácora con tu nombre: úsalo con calma.',
    },
  },
};

/** Componente compartido por `/movimientos/entrada`, `/salida` y `/ajuste`. */
export async function MovementPage({ tipo }: { tipo: TipoMovimiento }) {
  const context = await getAuthContext();
  if (!context) redirect('/login');

  if (!contextHasPermission(context, PERMISOS.movementsWrite)) {
    redirect('/movimientos');
  }

  const config = await getConfigMovimientos();
  const productos: ProductoParaFormulario[] = (await listProductosOperables()).map((p) => ({
    id: p.id,
    nombre: p.name,
    codigo: p.codigo,
    sku: p.sku,
    unidad: p.unidad,
    unidad_tipo: p.unidad_tipo,
    control_mode: p.control_mode,
    stock_disponible: p.stock_disponible,
    stock_peso_kg: p.stock_peso_kg,
    factor_to_base: p.factor_to_base,
    stock_minimo: p.stock_minimo,
    decimals: p.decimals,
    allow_fractional: p.allow_fractional,
  }));

  const { titulo, descripcion, ayuda } = COPIA[tipo];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader titulo={titulo} descripcion={descripcion} ayuda={{ titulo, ...ayuda }} />

      <MovementForm
        tipo={tipo}
        productos={productos}
        exigeFoto={config.exigeFoto}
        maxFotoBytes={config.fotosMaxBytes}
      />
    </div>
  );
}