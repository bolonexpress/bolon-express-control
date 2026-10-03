import { CatalogHeader } from '@/components/catalog/catalog-header';
import { CategoryForm } from '@/components/catalog/category-form';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { listCategories } from '@/server/repositories/catalog';
import { PERMISOS } from '@/types/domain';

export default async function NuevaCategoriaPage() {
  await requirePagePermission(PERMISOS.catalogWrite);

  const categorias = await listCategories();

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/categorias"
        titulo="Nueva categoría"
        descripcion="Un cajón para guardar productos. Puede quedar suelto o colgar de otro."
        ayuda={{
          titulo: 'Nueva categoría',
          resumen:
            'Crea un cajón nuevo para agrupar productos. Por ejemplo «Bebidas» o «Limpieza». Agrupar ayuda a encontrar las cosas rápido.',
          pasos: [
            'Escribe el nombre del cajón: «Bebidas».',
            'El código es opcional; sirve para listados e importaciones.',
            'Si el cajón va dentro de otro, elige cuál en «Categoría superior».',
            'El número de «Orden» decide si aparece antes o después.',
          ],
          nota: 'Si no sabes qué poner en «Categoría superior», déjalo vacío: será un cajón principal.',
        }}
        volverA="/categorias"
      />

      <div className={tarjetaClass}>
        <CategoryForm
          opcionesPadre={categorias
            .filter((c) => c.is_active)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    </div>
  );
}
