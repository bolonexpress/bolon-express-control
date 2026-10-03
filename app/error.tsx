'use client';

import { useEffect } from 'react';

import { botonClass } from '@/components/ui/button';
import { IconAviso, IconAtras } from '@/components/ui/icons';
import Link from 'next/link';

/**
 * Bordered error fallback. El mensaje nunca expone detalles internos;
 * el digest (si hay) se registra en servidor por el propio Next.
 *
 * Fase 9: sin "Oops". Dice que pasó, que no es culpa de quien lo ve y qué hacer:
 * reintentar o volver al inicio.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] error en pagina', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-[72px] items-center justify-center rounded-2xl bg-peligro-suave text-peligro ring-1 ring-peligro/25"
      >
        <IconAviso size={40} />
      </span>

      <h1 className="text-2xl font-bold text-texto">Esta pantalla no se pudo abrir</h1>
      <p className="text-lg leading-relaxed text-texto-suave">
        No se perdió nada de lo que registraste. Vuelve a intentarlo; si sigue igual,
        avisa a quien administra el sistema.
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={botonClass('secundario', 'lg')}>
          <IconAtras size={22} />
          Ir al inicio
        </Link>
        <button type="button" onClick={() => reset()} className={botonClass('primario', 'lg')}>
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}