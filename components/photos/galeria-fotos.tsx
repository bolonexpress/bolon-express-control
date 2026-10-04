'use client';

import { useState } from 'react';

import { IconLupa } from '@/components/ui/icons';
import { PhotoViewer } from '@/components/photos/photo-viewer';

/**
 * Miniaturas del detalle del movimiento (Fase 12B).
 *
 * La imagen que llega desde el servidor ya viene firmada (2 minutos, ADR-014):
 * sirve para pintar la miniatura al entrar. Al **abrir** el visor se firma una
 * URL nueva de 5 minutos, asi que la miniatura caduca sin que se note.
 *
 * Por que el componente es de cliente y no una `<img>` suelta: abrir el visor es
 * estado, y el estado vive en el cliente. El resto de la pagina sigue siendo
 * Server Component.
 */
export function GaleriaFotos({
  movimientoId,
  codigo,
  fecha,
  fotos,
}: {
  movimientoId: string;
  codigo: string;
  /** `created_at` del movimiento: solo para el nombre del archivo. */
  fecha: string;
  fotos: { id: string; url: string | null; mime: string }[];
}) {
  const [indiceAbierto, setIndiceAbierto] = useState<number | null>(null);

  if (fotos.length === 0) return null;

  return (
    <>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
        {fotos.map((foto, indice) => (
          <li key={foto.id}>
            <button
              type="button"
              onClick={() => setIndiceAbierto(indice)}
              className="group relative block w-full cursor-pointer overflow-hidden rounded-lg bg-superficie-alterna ring-1 ring-borde transition-shadow hover:shadow-flotante"
            >
              {foto.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foto.url}
                  alt={`Foto del movimiento ${codigo}`}
                  className="h-32 w-full object-cover sm:h-40"
                />
              ) : (
                <span className="flex h-32 items-center justify-center px-3 text-center text-xs text-texto-suave sm:h-40">
                  La foto existe pero no se pudo firmar su URL. Recarga en un momento.
                </span>
              )}

              {/* Lupa: solo aparece al tocar, pero el tamano del boton es siempre
                  el de la miniatura, para que acertar sea facil. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-1.5 bottom-1.5 inline-flex size-8 items-center justify-center rounded-full bg-marca-fuerte/80 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:opacity-100"
              >
                <IconLupa size={18} />
              </span>
              <span className="sr-only">
                Abrir la foto {indice + 1} de {fotos.length} en grande
              </span>
            </button>
          </li>
        ))}
      </ul>

      {indiceAbierto !== null ? (
        <PhotoViewer
          abierto
          onCerrar={() => setIndiceAbierto(null)}
          movimientoId={movimientoId}
          codigo={codigo}
          fecha={fecha}
          indiceInicial={indiceAbierto}
        />
      ) : null}
    </>
  );
}