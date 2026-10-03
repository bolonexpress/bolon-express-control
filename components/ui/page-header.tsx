import type { ReactNode } from 'react';

import { HelpButton } from '@/components/ui/help-button';

/**
 * Cabecera comun de las pantallas.
 *
 * Tres reglas de la Fase 9:
 *   - El titulo dice QUE SE HACE, en voz corta y en presente ("Recibir
 *     mercancía"), no el nombre tecnico de la tabla.
 *   - La ayuda "?" va siempre a la derecha: una persona sin capacitación debe
 *     poder abrirla sin saber donde esta.
 *   - Las acciones principales van en `acciones`, con icono y texto.
 */

export type AyudaPantalla = {
  titulo: string;
  resumen: string;
  pasos?: string[];
  nota?: string;
};

export function PageHeader({
  titulo,
  descripcion,
  acciones,
  ayuda,
  children,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  /** Si se pasa, se muestra el boton "?" con esta explicacion corta. */
  ayuda?: AyudaPantalla;
  /** Migas de pan o contenido auxiliar bajo la cabecera. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-borde pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-texto">{titulo}</h1>
        {descripcion ? (
          <p className="max-w-prose text-lg leading-relaxed text-texto-suave">{descripcion}</p>
        ) : null}
        {children}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {acciones}
        {ayuda ? <HelpButton {...ayuda} /> : null}
      </div>
    </header>
  );
}