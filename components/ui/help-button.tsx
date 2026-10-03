'use client';

import { useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { IconInterrogacion } from '@/components/ui/icons';

/**
 * Boton de ayuda "?".
 *
 * Una pantalla tiene un unico boton de ayuda, en su cabecera, y explica SOLO esa
 * pantalla en dos o tres frases: que se ve, que se puede hacer y a donde ir si
 * algo falta. Es la ayuda contextual de la Fase 8, montada sobre el modal de la
 * Fase 9.
 *
 * Sin estado global ni tooltip: un tooltip no se lee con pantalla tactil ni con
 * lector de pantalla, y es la razon principal por la que se cae en usar la app
 * sin capacitación.
 */
export function HelpButton({
  titulo,
  resumen,
  pasos = [],
  nota,
}: {
  /** Nombre de la pantalla: "Inventario", "Registrar entrada"... */
  titulo: string;
  /** Una frase: de que va esta pantalla. */
  resumen: string;
  /** 2-4 pasos cortos, en imperativo y en voz corta. */
  pasos?: string[];
  /** "Si te falta algo, escribe a..." u otra salida. */
  nota?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ayuda: ${titulo}`}
        className="inline-flex size-6 items-center justify-center rounded-xl bg-superficie text-marca ring-2 ring-marca/30 transition-colors hover:bg-marca-lima/25"
      >
        <IconInterrogacion size={26} />
      </button>

      <Dialog
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo={titulo}
        descripcion={resumen}
      >
        <div className="space-y-6">
          {pasos.length > 0 ? (
            <ol className="space-y-4">
              {pasos.map((paso, indice) => (
                <li key={paso} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-full bg-marca text-lg font-bold text-white"
                  >
                    {indice + 1}
                  </span>
                  <span className="pt-2 text-lg leading-relaxed text-texto">{paso}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {nota ? (
            <p className="rounded-xl bg-aviso-suave px-4 py-3 text-base leading-relaxed text-aviso ring-1 ring-aviso/25">
              {nota}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}