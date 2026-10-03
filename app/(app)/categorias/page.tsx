import { CatalogHeader } from '@/components/catalog/catalog-header';
import { CategoriesTable } from '@/components/catalog/categories-table';
import { BotonEnlace } from '@/components/ui/button';
import { IconMas } from '@/components/ui/icons';
import { ToastDeConsulta } from '@/components/ui/toast-consulta';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listCategories } from '@/server/repositories/catalog';
import { PERMISOS } from '@/types/domain';

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.catalogRead);
  const puedeEditar = contextHasPermission(context, PERMISOS.catalogWrite);

  const [{ mensaje }, categorias] = await Promise.all([searchParams, listCategories()]);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/categorias"
        titulo="Categorías"
        descripcion="Agrupan el catálogo. Una categoría puede colgar de otra, sin ciclos."
        accion={
          puedeEditar ? (
            <BotonEnlace href="/categorias/nuevo" icono={<IconMas size={22} />}>
              Nueva categoría
            </BotonEnlace>
          ) : undefined
        }
        ayuda={{
          titulo: 'Categorías',
          resumen:
            'Las categorías son los cajones donde se guardan los productos: bebidas, despensa, limpieza. Ayudan a encontrar rápido lo que se busca.',
          pasos: [
            'Toca «Nueva categoría» para crear un cajón nuevo.',
            'Al crearla, elige si es principal o si cuelga de otra.',
            'Toca el nombre de una categoría para cambiarle el nombre.',
            'El número de «Orden» decide cuál aparece primero.',
          ],
          nota: 'Una categoría no puede colgarse de sí misma ni de una de sus propias hijas: el sistema lo avisa.',
        }}
      />

      <ToastDeConsulta mensaje={mensaje} />

      <CategoriesTable categorias={categorias} puedeEditar={puedeEditar} />
    </div>
  );
}
