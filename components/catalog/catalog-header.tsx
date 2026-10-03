import Link from 'next/link';
import type { ReactNode } from 'react';

import { CatalogNav } from '@/components/catalog/catalog-nav';
import { BrandLogo } from '@/components/ui/brand-logo';
import { botonClass } from '@/components/ui/button';
import { HelpButton } from '@/components/ui/help-button';
import { IconCheckCirculo, IconIzquierda } from '@/components/ui/icons';
import type { AyudaPantalla } from '@/components/ui/page-header';

/**
 * Cabecera comun de las pantallas del catalogo: navegacion entre modulos,
 * titulo y la accion principal (solo si el usuario puede escribir).
 *
 * Fase 9: el logo de marca va junto al titulo (sobre fondo claro), el titulo
 * usa la escala de pantalla (32px) y el "volver" es un boton fantasma con
 * flecha, no un enlace de texto suelto que cuesta acertar.
 *
 * El boton "?" va a la derecha de la accion principal, igual que en
 * `PageHeader`: quien no sabe usar la app deberia encontrarlo sin buscar.
 */
export function CatalogHeader({
  ruta,
  titulo,
  descripcion,
  accion,
  ayuda,
  volverA,
  volverLabel = 'Volver al listado',
}: {
  ruta: '/productos' | '/categorias' | '/unidades';
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  /** Si se pasa, se muestra el boton "?" con esta explicacion corta. */
  ayuda?: AyudaPantalla;
  volverA?: string;
  volverLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <CatalogNav actual={ruta} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {/* En movil el logo de la cabecera estorba: el titulo manda. */}
          <span className="hidden shrink-0 sm:inline-flex">
            <BrandLogo variante="sobre-claro" altura={40} />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-texto">{titulo}</h1>
            {descripcion ? <p className="mt-2 text-lg text-texto-suave">{descripcion}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {accion}
          {ayuda ? <HelpButton {...ayuda} /> : null}
        </div>
      </div>

      {volverA ? (
        <Link
          href={volverA}
          className={botonClass('fantasma', 'md', 'px-0 hover:bg-transparent')}
        >
          <IconIzquierda size={22} />
          <span className="underline decoration-2 underline-offset-4">{volverLabel}</span>
        </Link>
      ) : null}
    </div>
  );
}

/** Confirmacion tras un `redirect` con mensaje (alta exitosa). */
export function MensajeBanner({ texto }: { texto?: string | undefined }) {
  if (!texto) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl bg-exito-suave px-4 py-3 text-base font-medium text-exito ring-1 ring-exito/25"
    >
      <IconCheckCirculo size={22} className="mt-0.5 shrink-0" />
      <span>{texto}</span>
    </p>
  );
}