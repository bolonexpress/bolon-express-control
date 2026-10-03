import { CatalogHeader } from '@/components/catalog/catalog-header';
import { UnitsTable } from '@/components/catalog/units-table';
import { BotonEnlace } from '@/components/ui/button';
import { IconMas } from '@/components/ui/icons';
import { ToastDeConsulta } from '@/components/ui/toast-consulta';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listUnits } from '@/server/repositories/catalog';
import { PERMISOS } from '@/types/domain';

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ mensaje?: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.catalogRead);
  const puedeEditar = contextHasPermission(context, PERMISOS.catalogWrite);

  const [{ mensaje }, unidades] = await Promise.all([searchParams, listUnits()]);

  return (
    <div className="space-y-6">
      <CatalogHeader
        ruta="/unidades"
        titulo="Unidades"
        descripcion="Cada unidad lleva su factor de conversión a la base de su tipo: kg, u o l."
        accion={
          puedeEditar ? (
            <BotonEnlace href="/unidades/nuevo" icono={<IconMas size={22} />}>
              Nueva unidad
            </BotonEnlace>
          ) : undefined
        }
        ayuda={{
          titulo: 'Unidades',
          resumen:
            'Cada producto se cuenta o se pesa en alguna unidad: piezas, kilos, gramos, litros. Aquí se dicen cuáles existen y cuántas entran en una.',
          pasos: [
            'Toca «Nueva unidad» para agregar una que aún no está (por ejemplo, media Libra).',
            'Elige si es de tipo unidad, peso o volumen.',
            'Escribe el factor: cuántas unidades base trae una de la nueva.',
            'Marca «Es la unidad base» solo si es el kilogramo, la pieza o el litro.',
          ],
          nota: 'Una libra vale 0.45359237 kilos. El sistema usa esa conversión para no equivocarse al sumar.',
        }}
      />

      <ToastDeConsulta mensaje={mensaje} />

      <UnitsTable unidades={unidades} puedeEditar={puedeEditar} />
    </div>
  );
}
