import { notFound } from 'next/navigation';

import { CatalogHeader } from '@/components/catalog/catalog-header';
import { ProductForm } from '@/components/catalog/product-form';
import { formatearCantidad } from '@/lib/format/units';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { getProduct, listCategories, listUnits } from '@/server/repositories/catalog';
import { opcionesCategorias, opcionesUnidades } from '@/server/services/catalog';
import { MODO_CONTROL_LABEL } from '@/types/domain';
import { PERMISOS } from '@/types/domain';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission(PERMISOS.catalogWrite);

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const producto = await getProduct(id);
  if (!producto) notFound();

  const [categorias, unidades] = await Promise.all([listCategories(), listUnits()]);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/productos"
        titulo={producto.name}
        descripcion={`${producto.codigo} · ${MODO_CONTROL_LABEL[producto.control_mode]} · stock ${formatearCantidad(producto.stock_actual)} ${producto.unidad}`}
        ayuda={{
          titulo: 'Editar producto',
          resumen:
            'Estás cambiando los datos de un producto que ya existe. Lo que ya se contó antes no se borra: queda escrito en el historial.',
          pasos: [
            'Cambia solo lo que necesites; lo demás se queda como está.',
            'Si cambias la unidad o el stock mínimo, revisa el texto gris: te dice cómo se va a guardar.',
            'Toca «Guardar cambios» para que el cambio cuente.',
            'Si quieres dejar de usar el producto, mejor desactívalo en el listado.',
          ],
          nota: 'El stock de aquí no se edita a mano: se cambia registrando entradas o salidas.',
        }}
        volverA="/productos"
      />

      <div className={tarjetaClass}>
        <ProductForm
          producto={producto}
          categorias={opcionesCategorias(categorias, producto.category_id)}
          unidades={opcionesUnidades(unidades, producto.unit_id)}
        />
      </div>
    </div>
  );
}
