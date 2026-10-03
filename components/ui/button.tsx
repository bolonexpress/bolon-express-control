import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Botones del sistema.
 *
 * Reglas fijas (Fase 9, elderly-first):
 *   - Altura minima 48px en TODOS los tamanos. Es el minimo que garantiza que
 *     un dedo la acierte sin tener que apuntar con precision; por eso `md` ya es
 *     `min-h-6` y no hay un tamano "pequeno" para acciones.
 *   - Icono + texto siempre. Un boton solo con icono no dice que hace; el icono
 *     acompana, no sustituye.
 *   - Texto en el boton, nunca solo `placeholder`: un placeholder desaparece
 *     en cuanto se escribe y deja el campo sin nombre.
 *
 * OJO con la escala: el espaciado es una rejilla de 8px (`--spacing: 0.5rem`),
 * asi que `min-h-6` son 48px, `min-h-7` 56px y `min-h-8` 64px. Los numeros NO
 * son pixeles: multiplicar mentalmente por 8 es la trampa clasica al heredar
 * clases de la rejilla anterior (4px).
 *
 * `botonClass()` se exporta aparte para poder aplicar las mismas clases a un
 * `<Link>` (navegar) o a un `<button type="submit">` sin duplicar el diseno.
 * Los dos componentes de abajo no llevan manejadores de evento a proposito: asi
 * pueden usarse desde Server Components.
 */

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'exito';
export type TamanoBoton = 'md' | 'lg' | 'xl';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-60';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-marca text-white shadow-tarjeta hover:bg-marca-fuerte',
  secundario: 'bg-superficie text-marca ring-2 ring-marca/35 hover:bg-marca-lima/25',
  fantasma: 'bg-transparent text-marca hover:bg-marca-lima/30',
  peligro: 'bg-peligro text-white shadow-tarjeta hover:bg-peligro/90',
  exito: 'bg-exito text-white shadow-tarjeta hover:bg-exito/90',
};

/** `md` 48px · `lg` 56px · `xl` 64px (rejilla de 8px: numero x 8). */
const TAMANOS: Record<TamanoBoton, string> = {
  md: 'min-h-6 px-5 text-base',
  lg: 'min-h-7 px-6 text-lg',
  xl: 'min-h-8 px-8 text-xl',
};

export function botonClass(
  variante: VarianteBoton = 'primario',
  tamano: TamanoBoton = 'md',
  extra = '',
): string {
  return [BASE, VARIANTES[variante], TAMANOS[tamano], extra].filter(Boolean).join(' ');
}

type BotonProps = {
  children: ReactNode;
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Icono a la izquierda. Se centra con `gap-2` en el boton. */
  icono?: ReactNode;
  className?: string;
} & Omit<ComponentProps<'button'>, 'className' | 'children'>;

/** `<button>` con el diseno del sistema. */
export function Button({
  children,
  variante = 'primario',
  tamano = 'md',
  icono,
  className = '',
  ...resto
}: BotonProps) {
  return (
    <button className={botonClass(variante, tamano, className)} {...resto}>
      {icono}
      <span>{children}</span>
    </button>
  );
}

/**
 * `<Link>` con el mismo aspecto. El texto va dentro de un `<span>` para que el
 * `gap` del boton separe bien el icono aunque el navegador envuelva el texto.
 */
export function BotonEnlace({
  children,
  href,
  variante = 'primario',
  tamano = 'md',
  icono,
  className = '',
  prefetch,
}: {
  children: ReactNode;
  href: string;
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  icono?: ReactNode;
  className?: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={botonClass(variante, tamano, className)}
    >
      {icono}
      <span>{children}</span>
    </Link>
  );
}