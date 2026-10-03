import Link from 'next/link';

import { BrandLogo } from '@/components/ui/brand-logo';
import { botonClass } from '@/components/ui/button';
import { IconAtras, IconCamara, IconCheckCirculo, IconDerecha } from '@/components/ui/icons';
import { PASOS } from '@/lib/tours';

/**
 * `/bienvenida`: el recorrido en formato lectura.
 *
 * Es la misma historia que el modal del primer ingreso (los pasos salen de
 * `lib/tours.ts`, no se duplican), pero como pagina: se puede abrir cuando
 * quieras desde el menu o el pie, dejar abierta en una tablet al lado del
 * mostrador, o imprimir para quien no quiere tocar la pantalla.
 *
 * Requiere sesion (vive dentro de `(app)`), asi que el enlace del menu es el
 * unico que lleva aqui.
 */
export default function BienvenidaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <BrandLogo altura={56} prioridad />
        <h1 className="text-3xl font-bold text-texto">
          Así de fácil se lleva el inventario
        </h1>
        <p className="max-w-prose text-lg text-texto-suave">
          Son cinco pasos. Léelos una vez y ya puedes usar la app sin ayuda.
        </p>
      </div>

      <ol className="space-y-4">
        {PASOS.map((paso, indice) => {
          const Icono = paso.icono;
          return (
            <li key={paso.titulo}>
              <article className="rounded-2xl bg-superficie p-5 shadow-tarjeta ring-1 ring-borde">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-[72px] shrink-0 items-center justify-center self-start rounded-2xl bg-marca-lima/30 text-marca ring-2 ring-marca/20"
                  >
                    <Icono size={40} />
                  </span>

                  <div className="space-y-2">
                    <p className="text-sm font-bold text-marca">
                      Paso {indice + 1} de {PASOS.length}
                    </p>
                    <h2 className="text-2xl font-bold text-texto">{paso.titulo}</h2>
                    <p className="text-lg leading-relaxed text-texto-suave">{paso.texto}</p>
                    <p className="inline-flex items-center gap-2 rounded-xl bg-aviso-suave px-3 py-2 text-base text-aviso ring-1 ring-aviso/25">
                      <IconCamara size={20} className="shrink-0" />
                      {paso.pista}
                    </p>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl bg-marca p-5 text-white">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <IconCheckCirculo size={24} />
          Listo. Empieza por aquí
        </h2>
        <p className="mt-1 text-base text-white/90">
          Con tres botones se hace el día a día. Toca el que necesites y el resto
          queda guardado.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Link href="/" className={botonClass('secundario', 'lg')}>
          <IconAtras size={24} />
          Volver al inicio
        </Link>
        <Link href="/inventario" className={botonClass('primario', 'lg')}>
          Ir a ver qué queda
          <IconDerecha size={24} />
        </Link>
      </div>
    </div>
  );
}