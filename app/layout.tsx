import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BOLÓN EXPRESS — Inventario',
    template: '%s · BOLÓN EXPRESS',
  },
  description: 'Control interno de inventario para BOLÓN EXPRESS.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Verde de la barra de navegacion: el movil lo pinta como color de sistema.
  themeColor: '#004b29',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
