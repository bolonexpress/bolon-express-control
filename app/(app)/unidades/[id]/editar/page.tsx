import { notFound } from 'next/navigation';

import { CatalogHeader } from '@/components/catalog/catalog-header';
import { UnitForm } from '@/components/catalog/unit-form';
import { tarjetaClass } from '@/components/ui/field';
import { UNIDAD_BASE, formatearFactor } from '@/lib/format/units';
import { requirePagePermission } from '@/server/auth/guards';
import { listUnits } from '@/server/repositories/catalog';
import { PERMISOS, UNIDAD_TIPO_LABEL } from '@/types/domain';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarUnidadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission(PERMISOS.catalogWrite);

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const unidades = await listUnits();
  const unidad = unidades.find((u) => u.id === id);
  if (!unidad) notFound();

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/unidades"
        titulo={`Editar ${unidad.name}`}
        descripcion={`${UNIDAD_TIPO_LABEL[unidad.unit_type]} · 1 ${unidad.code} = ${formatearFactor(unidad.factor_to_base)} ${UNIDAD_BASE[unidad.unit_type]} · ${unidad.productos_activos} producto${unidad.productos_activos === 1 ? '' : 's'} activo${unidad.productos_activos === 1 ? '' : 's'}.`}
        ayuda={{
          titulo: 'Editar unidad',
          resumen:
            'Estás cambiando cómo se mide una unidad. El factor dice cuántas unidades base trae una de esta: eso es lo que permite que el sistema sume sin equivocarse.',
          pasos: [
            'Cambia el nombre o el código si quieres que se entienda mejor.',
            'Corrige el factor solo si el de ahora no era el correcto.',
            'Marca «Es la unidad base» para cambiar cuál manda en su tipo.',
            'Toca «Guardar cambios» para que el cambio cuente.',
          ],
          nota: 'Cambiar el factor no cambia lo ya contado antes: lo que se registró queda como se registró.',
        }}
        volverA="/unidades"
      />

      <div className={tarjetaClass}>
        <UnitForm unidad={unidad} />
      </div>
    </div>
  );
}
