import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=(), payment=()' },
  {
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow, noimageindex',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // La foto viaja dentro del FormData de la Server Action, asi que el
      // limite aplica al POST entero. El default de Next es 1 MB: con el, una
      // foto de mas de 1 MB trunca el cuerpo multipart, el FormData llega
      // incompleto y el `safeParse` falla sin que ningun campo tenga sentido.
      // El bucket `movement-photos` admite 15 MB (file_size_limit), asi que el
      // limite se deja con 1 MB de holgura para el resto del formulario.
      bodySizeLimit: '16mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  // La CSP con nonce se aplica en middleware.ts (necesita un nonce por peticion).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
