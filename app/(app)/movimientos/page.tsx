import Link from 'next/link';

import { MovementsTable } from '@/components/movements/movements-table';
import { BotonEnlace } from '@/components/ui/button';
import { IconLapiz, IconRecibir, IconSacar } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import { ToastDeConsulta } from '@/components/ui/toast-consulta';
import { contextHasPermission, requirePagePermission } from '@/server/auth/guards';
import { listMovimientos } from '@/server/repositories/movements';
import { PERMISOS } from '@/types/domain';

const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'entrada', label: 'Entradas' },
  { valor: 'salida', label: 'Salidas' },
  { valor: 'ajuste', label: 'Ajustes' },
] as const;

const TIPOS = { entrada: 'entrada', salida: 'salida', ajuste: 'ajuste' } as const;

/**
 * Libro de movimientos. Ruta protegida con `movements:read`; los botones de
 * escritura solo aparecen con `movements:write`.
 *
 * Fase 9: los tres botones de la cabecera llevan icono y el nombre de la
 * accion ("Recibir mercancía"), no la palabra tecnica de la pestana.
 */
export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ mensaje?: string; aviso?: string; tipo?: string }>;
}) {
  const context = await requirePagePermission(PERMISOS.movementsRead);
  const puedeEscribir = contextHasPermission(context, PERMISOS.movementsWrite);

  const { mensaje, aviso, tipo } = await searchParams;
  const filtro = TIPOS[tipo as keyof typeof TIPOS] ?? undefined;
  const movimientos = await listMovimientos(filtro ? { tipo: filtro } : {});

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <PageHeader
          titulo="Entradas, salidas y ajustes"
          descripcion="Todo lo que ha entrado y salido del almacén, en el orden en que se anotó. Nada se edita: si algo está mal, se anula y queda escrito por quién y por qué."
          acciones={
            puedeEscribir ? (
              <div className="flex flex-wrap gap-3">
                <BotonEnlace href="/movimientos/entrada" icono={<IconRecibir size={22} />}>
                  Recibir mercancía
                </BotonEnlace>
                <BotonEnlace
                  href="/movimientos/salida"
                  variante="secundario"
                  icono={<IconSacar size={22} />}
                >
                  Sacar mercancía
                </BotonEnlace>
                <BotonEnlace
                  href="/movimientos/ajuste"
                  variante="secundario"
                  icono={<IconLapiz size={22} />}
                >
                  Corregir inventario
                </BotonEnlace>
              </div>
            ) : undefined
          }
          ayuda={{
            titulo: 'Entradas, salidas y ajustes',
            resumen:
              'Esta pantalla es el libro de todo lo que entra y sale. Aquí solo se lee; para anotar algo se usan los botones de arriba.',
            pasos: [
              'Toca «Recibir mercancía» si llegó mercadería nueva.',
              'Toca «Sacar mercancía» si vendiste o usaste algo.',
              'Usa «Corregir inventario» si algo se rompió o se perdió.',
              'Filtra con «Entradas», «Salidas» o «Ajustes» para ver solo una cosa.',
            ],
            nota: 'Un movimiento no se borra: se anula desde su detalle y queda tachado en la lista.',
          }}
        />

        <nav aria-label="Filtrar movimientos">
          <ul className="flex gap-2 overflow-x-auto">
            {FILTROS.map((f) => {
              const activa = (tipo ?? '') === f.valor;
              return (
                <li key={f.valor || 'todos'}>
                  <Link
                    href={f.valor ? `/movimientos?tipo=${f.valor}` : '/movimientos'}
                    aria-current={activa ? 'page' : undefined}
                    className={
                      activa
                        ? 'inline-flex min-h-6 items-center rounded-xl bg-marca-fuerte px-4 text-base font-semibold text-white'
                        : 'inline-flex min-h-6 items-center rounded-xl border-2 border-borde bg-superficie px-4 text-base font-semibold text-texto-suave hover:border-marca hover:bg-marca-lima/20'
                    }
                  >
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <ToastDeConsulta mensaje={mensaje} aviso={aviso} />

      <MovementsTable movimientos={movimientos} />
    </div>
  );
}