'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

/**
 * Suscripcion Realtime de la lista de compras (Fase 6).
 *
 * Escucha `postgres_changes` sobre `shopping_list` y `shopping_list_history`
 * (publicadas en la migracion 11) y refresca los Server Components con un
 * pequeno debounce: un producto comprado otro usuario aparece sin recargar.
 *
 * La seguridad no vive aqui: el servidor vuelve a leer con la RLS del usuario
 * en cada refresh. Lo unico que viaja es la notificacion "algo cambio".
 */
export function ShoppingRealtime() {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const refrescar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => router.refresh(), 250);
    };

    const canal = supabase
      .channel('shopping-list-tiempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list' }, refrescar)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_history' },
        refrescar,
      )
      .subscribe((estado) => setConectado(estado === 'SUBSCRIBED'));

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      void supabase.removeChannel(canal);
    };
  }, [router]);

  return (
    <p className="flex items-center gap-2 text-xs text-texto-suave" aria-live="polite">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${conectado ? 'bg-exito' : 'bg-borde-fuerte'}`}
      />
      {conectado ? 'En vivo: los cambios se ven al instante' : 'Conectando…'}
    </p>
  );
}
