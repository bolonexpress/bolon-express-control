import type { SVGProps } from 'react';

/**
 * Iconos en SVG, sin dependencias.
 *
 * Todos son de 24x24 con trazo (`stroke: currentColor`, 1.75) para que pesen
 * igual en la barra de navegacion y dentro de un boton. El color lo hereda el
 * texto del contenedor, nunca se fija aqui.
 *
 * Las medidas se escriben con valores absolutos (`size-[20px]`) y no con la
 * escala de espaciado a proposito: la rejilla es de 8px, asi que `size-5`
 * valdria 40px. Un icono de 40px dentro de un boton de 48px no cabe.
 */

export type IconProps = SVGProps<SVGSVGElement> & {
  /** Lado del icono en px. 20px es el tamano de lectura comoda a 17px de texto. */
  size?: number;
};

function Base({ size = 20, children, ...resto }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

/** Caja de producto: el motivo por el que se toca la app. */
export const IconCaja = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
    <path d="M3 8.5 12 13l9-4.5M12 13v7" />
  </Base>
);

/** Entrada: flecha que baja a una bandeja. */
export const IconRecibir = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v10" />
    <path d="m8 9 4 4 4-4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Base>
);

/** Salida: flecha que sale de una bandeja. */
export const IconSacar = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 13V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Base>
);

/** Consulta: ojo. */
export const IconVer = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.75" />
  </Base>
);

export const IconCamara = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
    <circle cx="12" cy="12.5" r="3.25" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconMas = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconLapiz = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 7 2.5 2.5" />
  </Base>
);

export const IconPapelera = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
  </Base>
);

export const IconInterrogacion = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2-2.4 3.4" />
    <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

export const IconCerrar = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconDerecha = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);

export const IconIzquierda = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 5-7 7 7 7" />
  </Base>
);

export const IconAbajo = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 9 7 7 7-7" />
  </Base>
);

export const IconArriba = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 15 7-7 7 7" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const IconSalir = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
    <path d="M17 12H10m0 0 3-3m-3 3 3 3" />
  </Base>
);

export const IconBuscar = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m15.5 15.5 4 4" />
  </Base>
);

export const IconLista = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </Base>
);

export const IconCarrito = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 5h2l2.2 9.5A2 2 0 0 0 9.2 16h7.4a2 2 0 0 0 2-1.6L20 8H6" />
    <circle cx="10" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </Base>
);

export const IconReloj = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.5l3.5 2" />
  </Base>
);

export const IconEscudo = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6l7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Base>
);

export const IconEtiqueta = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 11.5V5a1.5 1.5 0 0 1 1.5-1.5h6.5l9 9-8 8-9-9Z" />
    <circle cx="7.75" cy="7.75" r="1.25" />
  </Base>
);

export const IconRegla = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 14.5 14.5 4l5.5 5.5L9.5 20 4 14.5Z" />
    <path d="M8 11l2 2M11 8l2 2M14 5l2 2" />
  </Base>
);

export const IconCapas = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
    <path d="m4 12 8 4.2 8-4.2M4 16.5l8 4.2 8-4.2" />
  </Base>
);

export const IconAviso = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4.5 21 19.5H3L12 4.5Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

export const IconCheckCirculo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.2 2.7 2.8L16 9.5" />
  </Base>
);

export const IconXCirculo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9.5 9.5 5 5m0-5-5 5" />
  </Base>
);

export const IconAtras = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12H5m0 0 5-5m-5 5 5 5" />
  </Base>
);

/** Mano abierta: el gesto de "toca aqui" en el onboarding. */
export const IconMano = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 11V5.8a1.4 1.4 0 0 1 2.8 0V11" />
    <path d="M11.8 11V4.8a1.4 1.4 0 0 1 2.8 0V11" />
    <path d="M14.6 11.2V6.8a1.4 1.4 0 0 1 2.8 0v7.4c0 3.4-2.4 6.3-5.8 6.3-2.6 0-4-1.2-5.2-3l-2.3-3.6a1.5 1.5 0 0 1 2.4-1.8L9 14.6V11" />
  </Base>
);

/** Ojo: "ver" un dato escondido (la contrasena temporal). */
export const IconOjo = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);

/** Llave: generar una contrasena nueva. */
export const IconLlave = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9m-3 0v3m-2.5-3v2" />
  </Base>
);

/** Persona: una ficha de usuario en la administracion. */
export const IconPersona = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Base>
);