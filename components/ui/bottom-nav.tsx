'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  IconCaja,
  IconCarrito,
  IconCerrar,
  IconLista,
  IconMas,
  IconMenu,
  IconReloj,
  type IconProps,
} from '@/components/ui/icons';

/**
 * Barra de navegacion de abajo, solo en movil (Fase 12B).
 *
 * Por que una barra y no mas enlaces arriba: en el celular la barra superior se
 * come 64px de una pantalla de 700 utiles, y los enlaces que de verdad se usan
 * (recibir, inventario, compras) quedan fuera del primer golpe de pulgar. La
 * barra de abajo se alcanza con el pulgar, sin estirar el brazo ni hacer scroll
 * para volver arriba.
 *
 * Reglas que se respetan aqui:
 *
 * - **El RBAC no se toca.** La lista llega ya filtrada desde el servidor: si el
 *   modulo no esta en `principales`, no existe para ese rol. Aqui no se decide
 *   nada, solo se pinta lo que llega.
 * - **48px de alto minimo** en cada destino (el mismo minimo del resto de
 *   botones de la app), con etiqueta de texto: un icono solo no dice que hace.
 * - **`Esc` y foco atrapado** en el panel de "Mas", que es un dialogo: se usa
 *   `<dialog>` nativo, igual que `components/ui/dialog.tsx`.
 * - En escritorio (`sm` y arriba) no se renderiza nada: la barra de secciones
 *   de arriba sigue siendo la navegacion.
 */

/** Los cuatro destinos que caben en la barra, en orden de uso diario. */
const ICONOS: Record<string, (p: IconProps) => React.JSX.Element> = {
  '/inventario': IconCaja,
  '/movimientos': IconLista,
  '/compras': IconCarrito,
  '/historial': IconReloj,
};

/**
 * Se marca activo el destino exacto o el que lo contiene: en `/movimientos/entrada`
 * tiene que seguir resaltando "Movimientos", no quedarse todo gris.
 */
function esActivo(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function BottomNav({ destinos }: { destinos: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [masAbierto, setMasAbierto] = useState(false);
  const refDialog = useRef<HTMLDialogElement>(null);

  const principales = destinos.slice(0, 4);
  const resto = destinos.slice(4);

  useEffect(() => {
    const nodo = refDialog.current;
    if (!nodo) return;
    if (masAbierto && !nodo.open) nodo.showModal();
    if (!masAbierto && nodo.open) nodo.close();
  }, [masAbierto]);

  // El panel "Mas" lista lo que no cabe en la barra. Si no queda nada, no se
  // pinta el boton: es preferible una barra de cuatro a una de cuatro y un
  // boton que abre un panel vacio.
  const hayMas = resto.length > 0;

  if (destinos.length === 0) return null;

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="flex items-stretch">
          {principales.map(({ href, label }) => (
            <li key={href} className="min-w-0 flex-1">
              <DestinoEnBarra
                href={href}
                label={label}
                activo={esActivo(pathname, href)}
                Icono={ICONOS[href] ?? IconLista}
              />
            </li>
          ))}

          {hayMas ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMasAbierto(true)}
                aria-haspopup="dialog"
                className="flex min-h-6 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-texto-suave"
              >
                <IconMas size={22} />
                <span className="text-[11px] font-semibold leading-none">Más</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {hayMas ? (
        <dialog
          ref={refDialog}
          aria-label="Más pantallas"
          onCancel={(evento) => {
            evento.preventDefault();
            setMasAbierto(false);
          }}
          onClick={(evento) => {
            if (evento.target === refDialog.current) setMasAbierto(false);
          }}
          className="mt-auto max-h-[80dvh] w-full rounded-t-2xl border-0 bg-superficie p-0 text-texto backdrop:bg-marca-fuerte/60 sm:mx-auto sm:mt-auto sm:max-w-md sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <h2 className="text-lg font-bold">Otras pantallas</h2>
            <button
              type="button"
              onClick={() => setMasAbierto(false)}
              aria-label="Cerrar"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-xl text-texto-suave transition-colors hover:bg-fondo"
            >
              <IconCerrar size={24} />
            </button>
          </div>

          <ul className="max-h-[calc(80dvh-4rem)] overflow-y-auto p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
            {resto.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMasAbierto(false)}
                  className="flex min-h-7 items-center gap-3 rounded-xl px-3 py-2 text-base font-semibold text-texto transition-colors hover:bg-marca-lima/25"
                >
                  <IconMenu size={22} className="shrink-0 text-marca" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </dialog>
      ) : null}
    </>
  );
}

function DestinoEnBarra({
  href,
  label,
  activo,
  Icono,
}: {
  href: string;
  label: string;
  activo: boolean;
  Icono: (p: IconProps) => React.JSX.Element;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={`flex min-h-6 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors ${
        activo ? 'text-marca' : 'text-texto-suave'
      }`}
    >
      <Icono size={22} />
      <span className={`text-[11px] leading-none ${activo ? 'font-bold' : 'font-semibold'}`}>
        {label}
      </span>
    </Link>
  );
}