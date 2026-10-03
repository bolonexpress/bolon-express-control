import { CatalogHeader } from '@/components/catalog/catalog-header';
import { UnitForm } from '@/components/catalog/unit-form';
import { tarjetaClass } from '@/components/ui/field';
import { requirePagePermission } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

export default async function NuevaUnidadPage() {
  await requirePagePermission(PERMISOS.catalogWrite);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/unidades"
        titulo="Nueva unidad"
        descripcion="Ej.: libra → factor 0.45359237 hacia kg; caja de 12 → factor 12 hacia u."
        ayuda={{
          titulo: 'Nueva unidad',
          resumen:
            'Agrega una forma de medir que todavía no existe: una media libra, una caja de 12, un litro… El sistema la necesita para poder sumar sin equivocarse.',
          pasos: [
            'Escribe el código corto: solo minúsculas, números y guion bajo (ej. media_lb).',
            'Elige el tipo: unidad (piezas), peso o volumen.',
            'Escribe el factor: cuántas unidades base trae una de la nueva.',
            'Marca «Es la unidad base» solo si es el kilogramo, la pieza o el litro.',
          ],
          nota: 'Ejemplos: media libra → 0.226796185 hacia kg; caja de 12 → 12 hacia u.',
        }}
        volverA="/unidades"
      />

      <div className={tarjetaClass}>
        <UnitForm />
      </div>
    </div>
  );
}
