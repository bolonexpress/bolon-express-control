import { CatalogHeader } from '@/components/catalog/catalog-header';
import { ProductForm } from '@/components/catalog/product-form';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { listCategories, listUnits } from '@/server/repositories/catalog';
import { opcionesCategorias, opcionesUnidades } from '@/server/services/catalog';
import { PERMISOS } from '@/types/domain';

/**
 * Alta de producto. Exige `catalog:write`: quien solo puede leer el catalogo no
 * tiene por que ver el formulario.
 */
export default async function NuevoProductoPage() {
  await requirePagePermission(PERMISOS.catalogWrite);

  const [categorias, unidades] = await Promise.all([listCategories(), listUnits()]);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/productos"
        titulo="Nuevo producto"
        descripcion="El SKU identifica el producto dentro del sistema; el código se genera solo."
        ayuda={{
          titulo: 'Nuevo producto',
          resumen:
            'Esta pantalla sirve para agregar una cosa que todavía no está en la lista. Toca «Guardar» cuando termines y el producto queda disponible para contar.',
          pasos: [
            'Escribe el SKU: es el código corto y único del producto (ej. BEB-001).',
            'Pon el nombre que leerá la gente: «Agua mineral 600 ml».',
            'Elige la categoría y la unidad en la que se cuenta.',
            'Elige el modo de control: piezas, kilos o las dos cosas.',
            'Escribe el stock mínimo: la cantidad a partir de la cual conviene reponer.',
          ],
          nota: 'La categoría es opcional. Si el producto se pesa, la unidad tiene que ser de tipo Peso.',
        }}
        volverA="/productos"
      />

      <div className={tarjetaClass}>
        <ProductForm
          categorias={opcionesCategorias(categorias, null)}
          unidades={opcionesUnidades(unidades, null)}
        />
      </div>
    </div>
  );
}
