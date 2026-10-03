'use client';

import { useEffect, useState } from 'react';

import { BrandLogo } from '@/components/ui/brand-logo';
import { botonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconCamara, IconInterrogacion, IconMano } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { PASOS, marcarTourVisto, tourVisto } from '@/lib/tours';

/**
 * Onboarding: el recorrido del circuito completo de la app.
 *
 * Se abre solo en el PRIMER ingreso y se puede volver a abrir desde el menu con
 * "Ver tour de nuevo". El texto vive en `lib/tours.ts`, que lo comparte con la
 * pagina `/bienvenida`.
 *
 * El "visto" se guarda en `localStorage` y no en la base de datos: la Fase 9 no
 * toca el esquema, y la marca tampoco necesita ir a ningun lado.
 */
export function DialogTour({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [indice, setIndice] = useState(0);
  const { avisar } = useToast();
  // `noUncheckedIndexedAccess` no reconoce que el indice se recorta en los
  // botones, asi que se recorta aqui y el fallback cubre el caso limite.
  const paso = PASOS[Math.min(Math.max(indice, 0), PASOS.length - 1)] ?? PASOS[0];
  const ultimo = indice >= PASOS.length - 1;
  const Icono = paso.icono;

  const terminar = () => {
    marcarTourVisto();
    onCerrar();
    avisar({
      mensaje: 'Listo. Ya sabes usar la app.',
      tono: 'exito',
      detalle: 'Si te pierdes, mira el botón «?» de cada pantalla.',
    });
  };

  return (
    <Dialog
      abierto={abierto}
      onCerrar={() => {
        marcarTourVisto();
        onCerrar();
      }}
      titulo="Así de fácil se lleva el inventario"
      descripcion="Un recorrido corto por todo lo que vas a hacer."
      ancho="lg"
      pie={
        <>
          <button
            type="button"
            onClick={() => {
              marcarTourVisto();
              onCerrar();
            }}
            className={botonClass('fantasma', 'md', 'px-2')}
          >
            Saltar
          </button>

          <div className="flex items-center gap-2">
            <p className="mr-1 text-sm text-texto-suave">
              Paso {indice + 1} de {PASOS.length}
            </p>
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              aria-label="Paso anterior"
              className={botonClass('secundario', 'md', 'px-4')}
            >
              Atrás
            </button>
            {ultimo ? (
              <button type="button" onClick={terminar} className={botonClass('primario', 'md')}>
                Entendido
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndice((i) => Math.min(PASOS.length - 1, i + 1))}
                className={botonClass('primario', 'md')}
              >
                Siguiente
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo altura={40} />
          <span
            aria-hidden="true"
            className="inline-flex size-[72px] items-center justify-center rounded-2xl bg-marca-lima/30 text-marca ring-2 ring-marca/20"
          >
            <Icono size={40} />
          </span>
        </div>

        {/* El paso vive en un `key` distinto para que el lector de pantalla lo
            anuncie al cambiar: sin esto, el texto se considera estatico. */}
        <div key={indice} className="space-y-2 text-center">
          <h3 className="text-2xl font-bold text-texto">{paso.titulo}</h3>
          <p className="text-lg leading-relaxed text-texto-suave">{paso.texto}</p>
          <p className="inline-flex items-center gap-2 rounded-xl bg-aviso-suave px-3 py-2 text-base text-aviso ring-1 ring-aviso/25">
            <IconCamara size={20} className="shrink-0" />
            {paso.pista}
          </p>
        </div>

        {/* Puntos de progreso: el estado se lee en el texto, no en el color. */}
        <ol className="flex items-center justify-center gap-2" aria-hidden="true">
          {PASOS.map((p, i) => (
            <li
              key={p.titulo}
              className={`h-2 rounded-full transition-[width] ${
                i === indice ? 'w-8 bg-marca' : 'w-2 bg-borde-fuerte'
              }`}
            />
          ))}
        </ol>

        <p className="flex items-center justify-center gap-2 text-sm text-texto-tenue">
          <IconMano size={20} />
          Todo se hace tocando un botón grande. No hay que escribir comandos.
        </p>
      </div>
    </Dialog>
  );
}

/**
 * Tour automatico del primer ingreso. No renderiza nada hasta saber si ya se
 * vio, y entonces devuelve `null`: si no, el tour se abriria en cada recarga.
 */
export function TourPrimerIngreso() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!tourVisto()) setAbierto(true);
  }, []);

  if (!abierto) return null;

  return <DialogTour abierto onCerrar={() => setAbierto(false)} />;
}

/** Entrada del menu: "Ver tour de nuevo". */
export function BotonVerTour({ className = '' }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`${botonClass('secundario', 'md', 'w-full justify-start')} ${className}`}
      >
        <IconInterrogacion size={22} />
        <span>Ver tour de nuevo</span>
      </button>

      <DialogTour abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}