import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/ui/brand-logo';

/**
 * Layout de las paginas publicas de autenticacion (login, cambio de
 * contrasena). El middleware protege el resto de la app.
 *
 * Fase 9: fondo de marca con el logo real encima. Aqui el logo va sobre
 * superficie CLARA (el bloque blanco de la tarjeta), que es la variante
 * `sobre-claro`: sobre el fondo verde su tinta oscura se perderia, por eso el
 * logotipo va dentro de la tarjeta y no sobre el fondo.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-marca-fuerte px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-superficie p-6 shadow-flotante ring-1 ring-borde sm:p-8">
          <div className="flex flex-col items-center gap-2 border-b border-borde pb-6 text-center">
            <BrandLogo altura={48} prioridad />
            <p className="text-base font-semibold text-texto-suave">
              Inventario de BOLÓN EXPRESS
            </p>
          </div>

          <div className="pt-6">{children}</div>
        </div>

        <p className="mt-4 text-center text-sm text-white/80">
          ¿Problemas para entrar? Pídele ayuda a quien administra el sistema.
        </p>
      </div>
    </div>
  );
}