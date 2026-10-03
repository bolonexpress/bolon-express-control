/**
 * Logo de marca. `public/assets/logo.png` es la fuente de verdad visual: lockup
 * horizontal de 2172x926 con fondo transparente y tinta verde/amarillo/naranja.
 *
 * Solo hay UNA variante (no hay knockout monocromo), asi que la decision de
 * contexto es de fondo, no de archivo:
 *
 *   - `sobre-claro`  login, onboarding, estados vacios, pie de pagina.
 *   - `sobre-oscuro`  barra de navegacion: la tinta del logo es oscura y sobre
 *                     verde casi negro se perderia, asi que se monta sobre un
 *                     panel blanco redondeado (el "chip").
 *
 * La tinta ocupa todo el ancho del lockup: no hay un simbolo recortable, y el
 * favicon se genera aparte en `app/icon.png`.
 *
 * Se usa `<img>` y no `next/image` a proposito: el proyecto no depende de
 * `sharp`, y el optimizador de imagen en produccion lo requiere. Es un PNG
 * estatico con dimensiones conocidas, servido tal cual desde /public.
 */

const ANCHO_ORIGEN = 2172;
const ALTO_ORIGEN = 926;

/** Proporcion del lockup: el alto determina el ancho. */
const PROPORCION = ANCHO_ORIGEN / ALTO_ORIGEN;

const RUTA = '/assets/logo.png';

type Variante = 'sobre-claro' | 'sobre-oscuro';

export function BrandLogo({
  altura = 40,
  variante = 'sobre-claro',
  className = '',
  prioridad = false,
  descripcion = 'BOLÓN EXPRESS',
}: {
  /** Alto en px. 32px en la barra, 56px+ en login y onboarding. */
  altura?: number;
  variante?: Variante;
  className?: string;
  /** `priority` en el navbar y el login: son el LCP de su pagina. */
  prioridad?: boolean;
  descripcion?: string;
}) {
  const ancho = Math.round(altura * PROPORCION);

  // El chip blanco existe solo en la variante oscura; el padding vive en el
  // contenedor para que el `img` conserve su proporcion exacta.
  const contenedor =
    variante === 'sobre-oscuro'
      ? 'inline-flex items-center rounded-xl bg-superficie px-2.5 py-1.5 shadow-tarjeta ring-1 ring-black/5'
      : 'inline-flex items-center';

  return (
    <span className={`${contenedor} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sin `sharp` en el proyecto: `next/image` no puede optimizar en produccion */}
      <img
        src={RUTA}
        alt={descripcion}
        width={ancho}
        height={altura}
        loading={prioridad ? 'eager' : 'lazy'}
        decoding={prioridad ? 'sync' : 'async'}
        className="block"
        style={{ width: `${ancho}px`, height: `${altura}px` }}
      />
    </span>
  );
}