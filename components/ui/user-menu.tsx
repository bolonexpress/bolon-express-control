'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { BotonVerTour } from '@/components/onboarding/tour';
import { LogoutButton } from '@/components/ui/logout-button';
import { IconAbajo, IconMano } from '@/components/ui/icons';

/**
 * Menu de la persona conectada.
 *
 * Antes estaba todo en la barra: nombre, rol y "Salir" en linea. Con la Fase 9
 * se agrupa en un menu para no robar altura a la barra, que en movil es de
 * 64px y se necesita entera para la marca y el menu.
 *
 * El menu cierra solo: click fuera, `Escape` o al navegar. Es un `<div>` con
 * `role="menu"` y no `<details>` porque necesita disparar el tour (estado de
 * React) desde dentro del menu.
 */
export function UserMenu({ nombre, roles }: { nombre: string; roles: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!abierto) return;

    const alPulsarFuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alPulsarEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };

    document.addEventListener('mousedown', alPulsarFuera);
    document.addEventListener('keydown', alPulsarEscape);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
      document.removeEventListener('keydown', alPulsarEscape);
    };
  }, [abierto]);

  const nombreCorto = nombre.split(' ')[0] ?? nombre;

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={menuId}
        className="inline-flex min-h-6 items-center gap-2 rounded-xl bg-superficie/10 px-3 py-2 text-left text-base font-semibold text-white transition-colors hover:bg-superficie/20"
      >
        <span className="inline-flex size-[32px] items-center justify-center rounded-full bg-marca-lima font-bold text-marca-fuerte">
          {nombreCorto.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{nombre}</span>
        <IconAbajo size={20} className="shrink-0" />
      </button>

      {abierto ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu de la cuenta"
          className="absolute right-0 z-40 mt-2 w-72 space-y-3 rounded-2xl bg-superficie p-3 text-texto shadow-flotante ring-1 ring-borde"
        >
          <div className="rounded-xl bg-superficie-alterna px-3 py-3">
            <p className="truncate text-lg font-bold text-texto">{nombre}</p>
            <p className="truncate text-sm text-texto-suave">{roles}</p>
          </div>

          <div role="none">
            <BotonVerTour />
          </div>

          <div role="none">
            <Link
              href="/bienvenida"
              onClick={() => setAbierto(false)}
              role="menuitem"
              className="inline-flex min-h-6 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-base font-semibold text-marca transition-colors hover:bg-marca-lima/25"
            >
              <IconMano size={22} />
              <span>Ver el recorrido paso a paso</span>
            </Link>
          </div>

          <div role="none" className="border-t border-borde pt-3">
            <LogoutButton onClick={() => setAbierto(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}