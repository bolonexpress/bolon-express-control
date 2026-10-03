import Link from 'next/link';

import { BrandLogo } from '@/components/ui/brand-logo';
import { botonClass } from '@/components/ui/button';

/**
 * Ruta inexistente. Fase 9: mismo tono que el resto (logo, boton del sistema) y
 * la salida mas probable — el inicio — en el lugar mas visible.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fondo px-4 text-center">
      <BrandLogo altura={40} />
      <p className="text-2xl font-bold text-texto">Esta pantalla no existe</p>
      <p className="text-lg text-texto-suave">
        El enlace que seguiste no lleva a ningún lado. Vuelve al inicio y sigue desde ahí.
      </p>
      <Link href="/" className={`${botonClass('primario', 'lg')} mt-2`}>
        Ir al inicio
      </Link>
    </main>
  );
}