import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card, CardCuerpo } from '@/components/ui/card';
import { Aviso, EstadoVacio } from '@/components/ui/empty-state';
import { HelpButton } from '@/components/ui/help-button';
import {
  IconCapas,
  IconCarrito,
  IconEtiqueta,
  IconEscudo,
  IconLista,
  IconRegla,
  IconReloj,
  IconVer,
} from '@/components/ui/icons';
import { createClient } from '@/lib/supabase/server';
import { contextHasPermission, getAuthContext } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

/**
 * Inicio (Fase 9).
 *
 * Antes esta pantalla era un resumen tecnico —rol, ultimo ingreso, lista de
 * modulos— que no decia que hacer. Ahora lo primero que se ve son TRES
 * acciones gigantes en lenguaje cotidiano, y los modulos quedan debajo, para
 * quien ya conoce la app.
 *
 * Las tres acciones se ofrecen segun permiso (RBAC intacto): quien no puede
 * registrar movimientos no ve "Recibir mercancía", y sin permisos de lectura no
 * ve ningun modulo.
 */
export default async function HomePage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');

  const supabase = await createClient();
  const { data: roleRows } = await supabase
    .from('roles')
    .select('key, name')
    .in('key', context.roleKeys);

  const roleName = (key: string): string =>
    roleRows?.find((row) => row.key === key)?.name ?? key;

  const veEscritura = contextHasPermission(context, PERMISOS.movementsWrite);
  const veCatalogo = contextHasPermission(context, PERMISOS.catalogRead);
  const veMovimientos = contextHasPermission(context, PERMISOS.movementsRead);
  const veInventario = contextHasPermission(context, PERMISOS.inventoryRead);
  const veCompras = contextHasPermission(context, PERMISOS.shoppingRead);
  const veHistorial = contextHasPermission(context, PERMISOS.historyRead);
  const veAuditoria = contextHasPermission(context, PERMISOS.auditRead);

  const ultimoIngreso = context.profile.last_seen_at
    ? new Date(context.profile.last_seen_at).toLocaleString('es', {
        timeZone: 'America/Guayaquil',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  const accionesPrincipales = [
    ...(veEscritura
      ? [
          {
            href: '/movimientos/entrada',
            titulo: 'Recibir mercancía',
            ayuda: 'Entró mercadería nueva: compra, devolución o producción.',
            icono: <IconEtiqueta size={36} />,
            clase:
              'bg-marca text-white ring-marca hover:bg-marca-fuerte shadow-flotante',
          },
          {
            href: '/movimientos/salida',
            titulo: 'Sacar mercancía',
            ayuda: 'Vendiste algo o lo usaste en la tienda.',
            icono: <IconCarrito size={36} />,
            // Texto casi negro sobre naranja: 6.8:1. Con verde de barra se
            // quedaba en 4.4:1 y la descripcion (17px) no pasaba AA.
            clase:
              'bg-marca-naranja text-texto ring-marca-naranja/60 hover:bg-marca-naranja/90 shadow-flotante',
          },
        ]
      : []),
    ...(veInventario
      ? [
          {
            href: '/inventario',
            titulo: 'Ver qué queda',
            ayuda: 'Cuánto hay de cada cosa y qué se está acabando.',
            icono: <IconVer size={36} />,
            clase:
              'bg-superficie text-marca ring-borde hover:bg-marca-lima/25 shadow-flotante',
          },
        ]
      : []),
  ];

  const modulos = [
    ...(veInventario
      ? [{ href: '/inventario', label: 'Inventario', ayuda: 'Stock actual y mínimos', icono: <IconCapas size={24} /> }]
      : []),
    ...(veCatalogo
      ? [
          { href: '/productos', label: 'Productos', ayuda: 'Alta, edición y stock mínimo', icono: <IconEtiqueta size={24} /> },
          { href: '/categorias', label: 'Categorías', ayuda: 'Jerarquía del catálogo', icono: <IconLista size={24} /> },
          { href: '/unidades', label: 'Unidades', ayuda: 'Factores de conversión', icono: <IconRegla size={24} /> },
        ]
      : []),
    ...(veMovimientos
      ? [{ href: '/movimientos', label: 'Movimientos', ayuda: 'Entradas, salidas y ajustes', icono: <IconLista size={24} /> }]
      : []),
    ...(veCompras
      ? [{ href: '/compras', label: 'Compras', ayuda: 'Lista de compras en tiempo real', icono: <IconCarrito size={24} /> }]
      : []),
    ...(veHistorial
      ? [{ href: '/historial', label: 'Historial', ayuda: 'Movimientos con filtros y fotos', icono: <IconReloj size={24} /> }]
      : []),
    ...(veAuditoria
      ? [{ href: '/admin/auditoria', label: 'Auditoría', ayuda: 'Bitácora con antes ↔ después', icono: <IconEscudo size={24} /> }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-texto">
            Hola, {context.profile.full_name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-lg text-texto-suave">
            ¿Qué necesitas hacer hoy?
          </p>
        </div>

        <HelpButton
          titulo="Esta pantalla"
          resumen="Aquí eliges qué hacer. Es el punto de partida de todos los días."
          pasos={[
            'Toca uno de los tres botones grandes: lo que más se usa.',
            'Si necesitas algo menos frecuente, búscalo en «Otras pantallas».',
            '¿Dudas de una pantalla? Abre su botón «?».',
          ]}
        />
      </div>

      {accionesPrincipales.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-3">
          {accionesPrincipales.map((accion) => (
            <li key={accion.href}>
              <Link
                href={accion.href}
                className={`flex min-h-[180px] flex-col justify-between gap-4 rounded-2xl p-6 ring-1 transition-colors ${accion.clase}`}
              >
                <span aria-hidden="true" className="opacity-90">
                  {accion.icono}
                </span>
                <span>
                  <span className="block text-2xl font-bold leading-tight">{accion.titulo}</span>
                  <span className="mt-1 block text-base leading-snug opacity-90">
                    {accion.ayuda}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {veMovimientos ? (
        <Aviso tono="info" icono={<IconEtiqueta size={24} />}>
          ¿Hay algo que se rompió o se echó a perder? Anótalo con{' '}
          <Link
            href="/movimientos/ajuste"
            className="font-bold text-info underline decoration-2 underline-offset-4"
          >
            Ajustar
          </Link>{' '}
          para que el inventario no se descuadre.
        </Aviso>
      ) : null}

      {modulos.length > 0 ? (
        <Card>
          <CardCuerpo>
            <h2 className="text-lg font-bold text-texto">Otras pantallas</h2>
            <p className="text-base text-texto-suave">
              Para lo que no haces todos los días.
            </p>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modulos.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-[112px] flex-col justify-center gap-1 rounded-xl border-2 border-borde bg-superficie p-4 transition-colors hover:border-marca hover:bg-marca-lima/15"
                  >
                    <span className="flex items-center gap-2 text-marca">
                      {item.icono}
                      <span className="text-lg font-bold text-texto">{item.label}</span>
                    </span>
                    <span className="text-base text-texto-suave">{item.ayuda}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardCuerpo>
        </Card>
      ) : (
        <EstadoVacio
          compacta
          titulo="Todavía no hay nada que ver aquí"
          descripcion="Tu rol puede entrar a la app, pero no tiene pantallas asignadas todavía. Pídele a quien la administra que revise tus permisos."
        />
      )}

      {ultimoIngreso ? (
        <p className="text-sm text-texto-tenue">
          Tu último ingreso: {ultimoIngreso}. Tus permisos:{' '}
          {context.roleKeys.length > 0 ? context.roleKeys.map(roleName).join(', ') : 'sin rol'}.
        </p>
      ) : null}
    </div>
  );
}