import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/ui/brand-logo';

/**
 * Estado vacio. Es la pantalla que mas se ve cuando alguien esta aprendiendo,
 * asi que lleva el logo (para que la marca este donde el usuario se queda
 * mirando) y SIEMPRE una accion siguiente: un vacio sin salida parece un error.
 *
 * El texto va en linguagem cotidiano y en el mismo tiempo verbal que el resto de
 * la app ("todavia no hay", "cuando registres...").
 */
export function EstadoVacio({
  titulo,
  descripcion,
  icono,
  accion,
  compacta = false,
}: {
  titulo: string;
  descripcion: string;
  /** Icono de linea junto al logo. Opcional. */
  icono?: ReactNode;
  /** `<BotonEnlace>` o `<Button>` ya compuesto por quien llama. */
  accion?: ReactNode;
  /** En tablas y dentro de tarjetas: sin logo, solo texto y accion. */
  compacta?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center ${
        compacta ? 'rounded-xl border-2 border-dashed border-borde px-4 py-6' : 'px-4 py-8'
      }`}
    >
      {compacta ? null : <BrandLogo altura={44} className="opacity-95" />}

      {icono ? (
        <span className="text-4xl text-marca" aria-hidden="true">
          {icono}
        </span>
      ) : null}

      <div className="space-y-2">
        <p className="text-lg font-bold text-texto">{titulo}</p>
        <p className="mx-auto max-w-prose text-base text-texto-suave">{descripcion}</p>
      </div>

      {accion ? <div className="pt-1">{accion}</div> : null}
    </div>
  );
}

/**
 * Aviso en linea (no bloque de error): informa de un estado que no impide
 * seguir. `tono` elige el par semantico; el borde lo hace visible tambien con
 * luz de lado.
 */
export function Aviso({
  tono = 'info',
  titulo,
  children,
  icono,
}: {
  tono?: 'info' | 'exito' | 'aviso' | 'peligro';
  titulo?: ReactNode;
  children?: ReactNode;
  icono?: ReactNode;
}) {
  const tonos = {
    info: 'bg-info-suave text-info ring-info/30',
    exito: 'bg-exito-suave text-exito ring-exito/30',
    aviso: 'bg-aviso-suave text-aviso ring-aviso/30',
    peligro: 'bg-peligro-suave text-peligro ring-peligro/30',
  } as const;

  return (
    <div
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ${tonos[tono]}`}
    >
      {icono ? <span className="mt-0.5 shrink-0">{icono}</span> : null}
      <div className="space-y-1 text-base">
        {titulo ? <p className="font-bold">{titulo}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}