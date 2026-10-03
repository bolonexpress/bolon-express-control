import Link from 'next/link';

import { BrandLogo } from '@/components/ui/brand-logo';

const SECCIONES = [
  { href: '/productos', label: 'Productos' },
  { href: '/categorias', label: 'Categorías' },
  { href: '/unidades', label: 'Unidades' },
] as const;

/**
 * Navegacion del catalogo. Es un Server Component: el highlight depende de la
 * ruta activa, no de estado en el cliente.
 *
 * Fase 9: la barra pasa a verde de marca con el logo a la izquierda y el foco
 * invertido a blanco (`data-superficie="oscura"`), igual que la barra de la app.
 * Los enlaces son altos (48px) y el separador bajo la barra es un borde negro
 * al 10%: sobre fondo oscuro una sombra solo ensucia.
 */
export function CatalogNav({ actual }: { actual: string }) {
  return (
    <nav
      aria-label="Catálogo"
      data-superficie="oscura"
      className="-mx-4 overflow-x-auto border-b border-black/10 bg-marca-fuerte text-white shadow-elevada"
    >
      <div className="flex min-w-max items-center gap-3 px-4 py-2 sm:gap-4">
        {/* El logo se oculta en movil para no empujar las pestanas fuera de
            pantalla: la barra de la app ya lo muestra ahi. */}
        <span className="hidden shrink-0 sm:inline-flex">
          <BrandLogo altura={26} variante="sobre-oscuro" />
        </span>

        <ul className="flex min-w-max gap-1">
          {SECCIONES.map((seccion) => {
            const activa = actual === seccion.href;
            return (
              <li key={seccion.href}>
                <Link
                  href={seccion.href}
                  aria-current={activa ? 'page' : undefined}
                  className={
                    activa
                      ? 'inline-flex min-h-6 items-center border-b-[3px] border-marca-lima px-4 text-base font-bold text-white'
                      : 'inline-flex min-h-6 items-center border-b-[3px] border-transparent px-4 text-base font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white'
                  }
                >
                  {seccion.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}