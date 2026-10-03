import { AddPendienteForm } from '@/components/shopping/add-pendiente-form';
import { ShoppingBoard } from '@/components/shopping/shopping-board';
import { ShoppingRealtime } from '@/components/shopping/shopping-realtime';
import { MensajeBanner } from '@/components/catalog/catalog-header';
import { tarjetaClass } from '@/components/ui/field';
import { EstadoVacio } from '@/components/ui/empty-state';
import { IconCarrito, IconEscudo } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listCompras, listProductosParaCompra } from '@/server/repositories/shopping';
import { PERMISOS } from '@/types/domain';

/**
 * Lista de compras en tiempo real (Fase 6). Ruta protegida con `shopping:read`;
 * agregar/cambiar estado exige `shopping:write` (verificado de nuevo en cada
 * Server Action). La suscripcion Realtime refresca la vista cuando otro
 * usuario toca la lista.
 *
 * Fase 9: el titulo dice para que sirve la pantalla ("Lo que hay que comprar")
 * y el recuadro de "solo puedes ver" es un estado vacio, no un simple aviso:
 * vacio sin salida parece un error.
 */
export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.shoppingRead);
  const puedeEscribir = contextHasPermission(context, PERMISOS.shoppingWrite);

  const { mensaje } = await searchParams;
  const [items, productos] = await Promise.all([listCompras(), listProductosParaCompra()]);

  const activos = items.filter((i) => i.estado === 'pendiente' || i.estado === 'en_proceso');

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Lo que hay que comprar"
        descripcion={
          activos.length === 0
            ? 'Aquí se anota lo que falta en la tienda. Todavía no hay nada pendiente.'
            : `${activos.length} ${activos.length === 1 ? 'cosa' : 'cosas'} por comprar. La lista nunca se borra: se marca como comprado o se descarta.`
        }
        acciones={<ShoppingRealtime />}
        ayuda={{
          titulo: 'Lo que hay que comprar',
          resumen:
            'Es la lista compartida de la tienda: lo que falta y hay que traer. Todos la ven y todos ven al instante lo que anotan los demás.',
          pasos: [
            'Escribe el producto en el cuadro de arriba y toca «Agregar a la lista».',
            'Cuando lo traigas, márcalo como comprado.',
            'Si ya no hace falta, descártalo para que no se repita.',
          ],
          nota: 'La lista es de todos: si alguien más compra algo, aquí se ve al momento.',
        }}
      />

      <MensajeBanner texto={mensaje} />

      {puedeEscribir ? (
        <section aria-labelledby="compras-agregar" className={tarjetaClass}>
          <h2 id="compras-agregar" className="mb-4 flex items-center gap-2 text-lg font-bold text-texto">
            <IconCarrito size={24} className="text-marca" />
            Agregar lo que falta
          </h2>
          <AddPendienteForm productos={productos} prioridadPorDefecto={2} />
        </section>
      ) : (
        <EstadoVacio
          compacta
          icono={<IconEscudo size={32} />}
          titulo="Puedes ver la lista, pero no cambiarla"
          descripcion="Tu rol deja ver lo que hay que comprar, no agregar ni marcar nada. Si necesitas anotar algo, pídele a quien administra la tienda que te dé permiso."
        />
      )}

      <ShoppingBoard items={items} puedeEscribir={puedeEscribir} />
    </div>
  );
}