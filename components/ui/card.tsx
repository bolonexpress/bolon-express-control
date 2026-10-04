import type { ReactNode } from 'react';

/**
 * Superficies del sistema. Tarjetas de alto contraste: fondo blanco puro sobre
 * `--color-fondo`, borde `--color-borde` (no solo sombra) y radios amplios.
 *
 * El borde importa mas que la sombra en pantallas con brillo de tienda: una
 * tarjeta que solo se distingue por su sombra desaparece con luz de lado.
 */

/** Clase base. Compatible con `tarjetaClass` de `components/ui/field.tsx`. */
export const tarjetaClase =
  'rounded-2xl bg-superficie shadow-tarjeta ring-1 ring-borde';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${tarjetaClase} ${className}`}>{children}</section>;
}

export function CardCabecera({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-5">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-texto">{titulo}</h2>
        {descripcion ? <p className="text-base text-texto-suave">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-3">{acciones}</div> : null}
    </div>
  );
}

export function CardCuerpo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-4 sm:px-6 sm:py-6 ${className}`}>{children}</div>;
}

/** Separador de secciones del cuerpo, sin caja. */
export function Seccion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`space-y-4 sm:space-y-6 ${className}`}>{children}</section>;
}