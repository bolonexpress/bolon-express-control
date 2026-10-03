import { notFound } from 'next/navigation';

import { CatalogHeader } from '@/components/catalog/catalog-header';
import { CategoryForm } from '@/components/catalog/category-form';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { listCategories } from '@/server/repositories/catalog';
import { idsNoSeleccionablesComoPadre } from '@/server/services/catalog';
import { PERMISOS } from '@/types/domain';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission(PERMISOS.catalogWrite);

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const categorias = await listCategories();
  const categoria = categorias.find((c) => c.id === id);
  if (!categoria) notFound();

  // Una categoria no puede ser su propia superior, ni quedar bajo una de sus
  // hijas: el filtro evita ofrecer una opcion que el servidor rechazaria.
  const bloqueados = idsNoSeleccionablesComoPadre(categorias, categoria.id);
  const opcionesPadre = categorias
    .filter((c) => (c.is_active || c.id === categoria.parent_id) && !bloqueados.has(c.id))
    .map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (desactivada)` }));

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/categorias"
        titulo={`Editar ${categoria.name}`}
        descripcion={`${categoria.productos_activos} producto${categoria.productos_activos === 1 ? '' : 's'} activo${categoria.productos_activos === 1 ? '' : 's'}.`}
        ayuda={{
          titulo: 'Editar categoría',
          resumen:
            'Estás cambiando el nombre o el lugar de un cajón que ya existe. Los productos que están dentro no se borran: se mudan con la categoría.',
          pasos: [
            'Cambia el nombre si el cajón ya no se llama así.',
            'Cambia «Categoría superior» para mover el cajón dentro de otro.',
            'Toca «Guardar cambios» para que el cambio cuente.',
            'Si el cajón ya no se usa, desactívalo en el listado en vez de borrarlo.',
          ],
          nota: 'La lista no ofrece la propia categoría ni sus hijas: así no se pueden crear círculos.',
        }}
        volverA="/categorias"
      />

      <div className={tarjetaClass}>
        <CategoryForm categoria={categoria} opcionesPadre={opcionesPadre} />
      </div>
    </div>
  );
}
