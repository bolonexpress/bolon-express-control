import Link from 'next/link';

import { BrandLogo } from '@/components/ui/brand-logo';
import { botonClass } from '@/components/ui/button';
import { IconEscudo } from '@/components/ui/icons';

/**
 * Destino de los guards de pagina cuando la sesion existe pero el usuario no
 * tiene el permiso que la ruta exige.
 *
 * Fase 9: sin codigo "403" como protagonista. Para quien no vive en el jargon,
 * lo importante es que no es un error suyo y que hay salida.
 */
export default function NoAutorizadoPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <BrandLogo altura={40} />
      <span
        aria-hidden="true"
        className="inline-flex size-[72px] items-center justify-center rounded-2xl bg-aviso-suave text-aviso ring-1 ring-aviso/25"
      >
        <IconEscudo size={40} />
      </span>

      <h1 className="text-2xl font-bold text-texto">Esta pantalla no es para tu rol</h1>
      <p className="text-lg leading-relaxed text-texto-suave">
        Tu usuario está bien, pero este permiso no lo tiene. Si necesitas verlo,
        pídele a quien administra el sistema que lo agregue.
      </p>

      <Link href="/" className={`${botonClass('primario', 'lg')} mt-2`}>
        Volver al inicio
      </Link>
    </div>
  );
}