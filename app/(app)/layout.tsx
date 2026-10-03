import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { TourPrimerIngreso } from '@/components/onboarding/tour';
import { BrandLogo } from '@/components/ui/brand-logo';
import { ToastProvider } from '@/components/ui/toast';
import { UserMenu } from '@/components/ui/user-menu';
import { getAuthContext, contextHasPermission } from '@/server/auth/guards';
import { PERMISOS } from '@/types/domain';

/**
 * Shell autenticado: exige sesion, usuario activo y perfil legible.
 * El middleware ya hace la primera verificacion; aqui se repite de forma
 * independiente (falla cerrado) y se resuelve una sola vez por request
 * (cache de React).
 *
 * Fase 9: la barra pasa de gris a verde de marca y monta el logo. El contenido
 * no cambia de sitio ni de orden, solo cambia el marco.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect('/login');

  const roles = context.roleKeys.length > 0 ? context.roleKeys.join(' · ') : 'sin rol';
  const veCatalogo = contextHasPermission(context, PERMISOS.catalogRead);
  const veMovimientos = contextHasPermission(context, PERMISOS.movementsRead);
  const veInventario = contextHasPermission(context, PERMISOS.inventoryRead);
  const veCompras = contextHasPermission(context, PERMISOS.shoppingRead);
  const veHistorial = contextHasPermission(context, PERMISOS.historyRead);
  const veAuditoria = contextHasPermission(context, PERMISOS.auditRead);

  // El RBAC no cambia: solo se ofrece lo que el rol puede leer, igual que antes.
  const secciones = [
    ...(veInventario ? [{ href: '/inventario', label: 'Inventario' }] : []),
    ...(veCatalogo
      ? [
          { href: '/productos', label: 'Productos' },
          { href: '/categorias', label: 'Categorías' },
          { href: '/unidades', label: 'Unidades' },
        ]
      : []),
    ...(veMovimientos ? [{ href: '/movimientos', label: 'Movimientos' }] : []),
    ...(veCompras ? [{ href: '/compras', label: 'Compras' }] : []),
    ...(veHistorial ? [{ href: '/historial', label: 'Historial' }] : []),
    ...(veAuditoria ? [{ href: '/admin/auditoria', label: 'Auditoría' }] : []),
  ];

  return (
    <ToastProvider>
      {/* Enlace de salto: la primera tabulacion de cada pagina. Sin el, quien
          navega con teclado tiene que recorrer la barra entera cada vez. */}
      <a
        href="#contenido"
        className="sr-only left-3 top-3 z-50 rounded-xl bg-marca px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed"
      >
        Saltar al contenido
      </a>

      <div className="flex min-h-dvh flex-col">
        <header data-superficie="oscura" className="sticky top-0 z-30 bg-marca-fuerte text-white shadow-elevada">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-4">
            <Link href="/" className="rounded-xl" aria-label="Ir al inicio">
              <BrandLogo altura={26} variante="sobre-oscuro" prioridad />
            </Link>
            <UserMenu nombre={context.profile.full_name} roles={roles} />
          </div>

          {secciones.length > 0 ? (
            <nav aria-label="Secciones" className="mx-auto w-full max-w-6xl px-2 sm:px-3">
              <ul className="flex gap-1 overflow-x-auto pb-2">
                {secciones.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-block min-h-6 whitespace-nowrap rounded-xl px-3 py-2 text-base font-semibold text-white/80 transition-colors hover:bg-superficie/10 hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </header>

        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>

        <footer className="border-t border-borde bg-superficie-alterna">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 text-sm text-texto-suave sm:flex-row sm:items-center sm:justify-between">
            <p>Ayuda: el botón «?» de cada pantalla explica qué se puede hacer ahí.</p>
            <Link href="/bienvenida" className="font-semibold text-marca underline underline-offset-4">
              Ver el recorrido otra vez
            </Link>
          </div>
        </footer>

        <TourPrimerIngreso />
      </div>
    </ToastProvider>
  );
}