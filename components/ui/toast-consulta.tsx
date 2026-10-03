'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useToast } from '@/components/ui/toast';

/**
 * Avisos que cruzan una redireccion.
 *
 * Hay tres formas de confirmar un guardado, y cada una usa el camino menos
 * invasivo. La regla general: **no se tocan las Server Actions**, asi que el
 * aviso tiene que viajar por lo que ya existe.
 *
 *  1. **El estado de la accion, en el sitio** (`useToastDeEstado` con `exito`).
 *     Es lo que se usa cuando la accion NO redirige: devuelve un `{ ok: true }` y
 *     el formulario se entera en el momento. Catalogos al editar, estados de
 *     compras, activar/desactivar y anular un movimiento. Cero cambios.
 *
 *  2. **Parametro de consulta** (`ToastDeConsulta`). Cuando la accion YA redirige
 *     con `?mensaje=...` (altas de catalogo y el registro de un movimiento), la
 *     pagina destino lee ese parametro y lanza el aviso. No hay que tocar la
 *     accion y el aviso no sobrevive a un F5 porque se limpia la URL.
 *
 *  3. **sessionStorage** (`guardarAviso` + `useToastDeAvisoPendiente`). Solo para
 *     el cambio de contrasena: la accion redirige a `/` sin dejar mensaje y sin
 *     poder cambiarse. Se opta por `sessionStorage` y no por query param porque
 *     anadir un parametro exigiria tocar la accion; como el shell (y por tanto el
 *     `ToastProvider`) sobrevive a la navegacion, leerlo al cambiar de ruta
 *     funciona. Se limpia en cuanto se muestra, asi que no sale dos veces.
 */

const CLAVE = 'bolon-express.aviso';

/** Deja un aviso para la siguiente pantalla. Lo consume `ToastDeAvisoPendiente`. */
export function guardarAviso(mensaje: string, detalle?: string) {
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify({ mensaje, detalle }));
  } catch {
    /* sin sessionStorage se pierde el aviso; no es motivo para romper el guardado */
  }
}

/** Descarta un aviso pendiente (por ejemplo, si el guardado acaba fallando). */
export function descartarAviso() {
  try {
    window.sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que limpiar */
  }
}

/**
 * Lanza el aviso pendiente en cuanto cambia la pantalla (montaje incluido).
 *
 * Va dentro del `ToastProvider`, asi que toda la app lo tiene sin que cada
 * pagina tenga que montar nada.
 */
export function ToastDeAvisoPendiente() {
  const { avisar } = useToast();
  const ruta = usePathname();

  useEffect(() => {
    let pendiente: { mensaje: string; detalle?: string } | null = null;
    try {
      const bruto = window.sessionStorage.getItem(CLAVE);
      if (bruto) {
        pendiente = JSON.parse(bruto) as { mensaje: string; detalle?: string };
        window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      pendiente = null;
    }

    if (pendiente?.mensaje) {
      avisar({ mensaje: pendiente.mensaje, detalle: pendiente.detalle, tono: 'exito' });
    }
  }, [ruta, avisar]);

  return null;
}

/**
 * Lanza el aviso que viaja en la URL y limpia el parametro para que recargar no
 * lo repita. Se monta en la pagina destino:
 *
 * ```tsx
 * <ToastDeConsulta mensaje={mensaje} />
 * ```
 *
 * Los errores de la misma URL (`aviso=`) tambien pasan por aqui, en tono de
 * aviso: asi el mensaje real de un fallo de Storage se ve aunque se llegue con
 * un F5.
 */
export function ToastDeConsulta({
  mensaje,
  aviso,
}: {
  mensaje?: string | undefined;
  aviso?: string | undefined;
}) {
  const { avisar } = useToast();
  const router = useRouter();
  const yaMostrado = useRef(false);

  useEffect(() => {
    if (yaMostrado.current) return;
    if (!mensaje && !aviso) return;
    yaMostrado.current = true;

    if (aviso) avisar({ mensaje: aviso, tono: 'aviso' });
    else avisar({ mensaje: mensaje ?? '', tono: 'exito' });

    // Sin `useSearchParams` a proposito: leer `window.location` y.replace no
    // obliga a las paginas a envolver esto en un <Suspense>.
    const url = new URL(window.location.href);
    url.searchParams.delete('mensaje');
    url.searchParams.delete('aviso');
    router.replace(`${url.pathname}${url.search}`);
  }, [mensaje, aviso, avisar, router]);

  return null;
}