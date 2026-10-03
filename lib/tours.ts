import type { IconProps } from '@/components/ui/icons';
import {
  IconCarrito,
  IconInterrogacion,
  IconRecibir,
  IconSacar,
  IconVer,
} from '@/components/ui/icons';

/**
 * Contenido del onboarding (Fase 9).
 *
 * Vive fuera del componente para que lo usen las DOS entradas: el modal que se
 * abre solo en el primer ingreso y la pagina `/bienvenida`, que es la misma
 * historia en formato lectura (para abrirla en una tablet al lado del mostrador
 * o imprimirla).
 *
 * `as const` mantiene la tupla, asi que `PASOS[indice]` no es
 * `Paso | undefined` con `noUncheckedIndexedAccess`.
 *
 * Redaccion: frases cortas, presente, sin jerga de inventario. "No guardes",
 * "anota", "mira": es como lo diria alguien de mostrador.
 */

export type PasoTour = {
  titulo: string;
  texto: string;
  icono: (props: IconProps) => React.JSX.Element;
  pista: string;
};

export const PASOS = [
  {
    titulo: 'Primero, lo que entra',
    texto:
      'Cuando llega mercancía nueva, toca «Recibir mercancía». Eliges el producto, escribes cuántas unidades llegaron y le tomas una foto. Con eso el inventario ya sabe qué hay.',
    icono: IconRecibir,
    pista: 'Úsalo también cuando te devuelvan mercadería.',
  },
  {
    titulo: 'También se anota lo que sale',
    texto:
      'Cuando vendes algo o lo usas en la tienda, toca «Sacar mercancía» y anota cuánto salió. Si no queda suficiente, el sistema te avisa antes de guardar, así no te equivocas.',
    icono: IconSacar,
    pista: 'Si algo se rompió o se echó a perder, usa «Ajustar».',
  },
  {
    titulo: 'Mira cuánto queda',
    texto:
      '«Ver qué queda» te muestra el inventario de hoy. Lo que se está acabando lo verás resaltado para que sepas qué pedir.',
    icono: IconVer,
    pista: 'Aquí nadie puede cambiar las cantidades a mano.',
  },
  {
    titulo: 'Anota lo que hay que comprar',
    texto:
      'Cuando veas que algo se acaba, agrégalo a la lista de compras. Así la persona que hace las compras sabe qué falta sin preguntar.',
    icono: IconCarrito,
    pista: 'La lista se actualiza sola: todos la ven al instante.',
  },
  {
    titulo: 'Si te pierdes, pregunta',
    texto:
      'Cada pantalla tiene un botón «?». Te explica en dos frases qué ves y qué puedes hacer. Y aquí mismo, en el menú, puedes volver a ver este recorrido.',
    icono: IconInterrogacion,
    pista: 'Puedes saltar este recorrido y verlo cuando quieras.',
  },
] as const satisfies readonly PasoTour[];

/** Clave de `localStorage`: el tour se recuerda en el navegador, no en la BD. */
export const CLAVE_TOUR = 'bolon-express.tour.v1';

export function tourVisto(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(CLAVE_TOUR) === 'visto';
  } catch {
    // Sin `localStorage` (modo privado estricto) el tour se abre cada vez:
    // es molesto, pero mejor que esconder la ayuda.
    return false;
  }
}

export function marcarTourVisto() {
  try {
    window.localStorage.setItem(CLAVE_TOUR, 'visto');
  } catch {
    /* sin almacenamiento no hay nada que recordar */
  }
}