'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { IconCerrar } from '@/components/ui/icons';

/**
 * Modal sobre `<dialog>` nativo: el top layer del navegador aporta el bloqueo
 * del fondo, el `Escape` y el atrapado de foco sin codificarlo a mano. Aqui solo
 * se controla la visibilidad desde React.
 *
 * Se usa para el onboarding y para la ayuda. Con <dialog> nativo no hay
 * conflicto con el `::backdrop` de Tailwind (`backdrop:`).
 */
export function Dialog({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 'md',
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
  /** `md` 42rem · `lg` 56rem. Por debajo siempre cabe el viewport. */
  ancho?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    if (abierto && !nodo.open) nodo.showModal();
    if (!abierto && nodo.open) nodo.close();
  }, [abierto]);

  // `Escape` llega a `onCancel`; se anula el cierre nativo para que el estado de
  // React sea la unica fuente de verdad y el padre pueda pedirlo de nuevo.
  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault();
        onCerrar();
      }}
      className={`m-auto max-h-[92dvh] w-[min(100vw-1.5rem,42rem)] rounded-2xl bg-superficie p-0 text-texto shadow-flotante ring-1 ring-borde backdrop:bg-marca-fuerte/60 ${
        ancho === 'lg' ? 'sm:w-[min(100vw-3rem,56rem)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-borde px-5 py-4">
        <div className="space-y-1">
          <h2 id={tituloId} className="text-xl font-bold text-texto">
            {titulo}
          </h2>
          {descripcion ? <p className="text-base text-texto-suave">{descripcion}</p> : null}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="-mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-xl text-texto-suave transition-colors hover:bg-fondo"
        >
          <IconCerrar size={24} />
        </button>
      </div>

      <div className="overflow-y-auto px-5 py-5">{children}</div>

      {pie ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde bg-superficie-alterna px-5 py-3">
          {pie}
        </div>
      ) : null}
    </dialog>
  );
}