import { CatalogHeader } from '@/components/catalog/catalog-header';
import { ProductsTable } from '@/components/catalog/products-table';
import { BotonEnlace } from '@/components/ui/button';
import { IconMas } from '@/components/ui/icons';
import { ToastDeConsulta } from '@/components/ui/toast-consulta';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listProducts } from '@/server/repositories/catalog';
import { PERMISOS } from '@/types/domain';

/**
 * Listado del catalogo de productos. Ruta protegida: exige `catalog:read`
 * (el guard redirige a /login o /no-autorizado segun corresponda). Ver tambien
 * el `includeInactivos`: el administrador necesita ver y reactivar lo que
 * desactivo, no solo lo activo.
 */
export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.catalogRead);
  const puedeEditar = contextHasPermission(context, PERMISOS.catalogWrite);

  const [{ mensaje }, productos] = await Promise.all([
    searchParams,
    listProducts({ incluirInactivos: true }),
  ]);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/productos"
        titulo="Productos"
        descripcion={`${productos.length} producto${productos.length === 1 ? '' : 's'} en el catálogo.`}
        accion={
          puedeEditar ? (
            <BotonEnlace href="/productos/nuevo" icono={<IconMas size={22} />}>
              Nuevo producto
            </BotonEnlace>
          ) : undefined
        }
        ayuda={{
          titulo: 'Productos',
          resumen:
            'Aquí están todas las cosas que se pueden vender o contar en la tienda. Cada producto tiene un nombre, un código y una unidad de conteo.',
          pasos: [
            'Toca «Nuevo producto» para agregar uno que todavía no está en la lista.',
            'Toca el nombre de un producto para cambiar sus datos.',
            'Para dejar de usar uno sin borrarlo del historial, toca «Desactivar».',
            'En «Ver inventario» ves cuánto queda de cada cosa.',
          ],
          nota: 'Un producto desactivado no aparece al registrar entradas ni salidas, pero sigue en el historial.',
        }}
      />

      <ToastDeConsulta mensaje={mensaje} />

      <ProductsTable productos={productos} puedeEditar={puedeEditar} />
    </div>
  );
}
