#!/usr/bin/env node
/**
 * Revisa de seguridad estatica (Fase 8). Lee unicamente archivos del proyecto
 * (codigo + `.next` tras un build) y emite un checklist PASS/FAIL. No toca la
 * base de datos ni escribe nada.
 *
 * Uso: `node scripts/security-audit.mjs` (o `npm run audit:security`).
 *
 * Codigo de salida 0 = todo en verde; 1 = alguno fallo. Cada paso documenta
 * QUE revisa exactamente y POR QUE, para que el script sobreviva al codigo
 * cuando cambie.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const fallas = [];
const pasan = [];
const avisos = [];

function pass(nombre, detalle) {
  pasan.push(`PASS  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function fail(nombre, detalle) {
  fallas.push(`FAIL  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function warn(nombre, detalle) {
  avisos.push(`WARN  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function leer(ruta) {
  try {
    return readFileSync(join(RAIZ, ruta), 'utf8');
  } catch {
    return null;
  }
}

/** Recorre un directorio devolviendo archivos (salta node_modules/.git). */
function* recorrer(dir) {
  if (!existsSync(dir)) return;
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.git') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) yield* recorrer(ruta);
    else yield ruta;
  }
}

// ---------------------------------------------------------------------------
// 1. RLS habilitado en TODAS las tablas publicas
// ---------------------------------------------------------------------------
{
  const migracionesDir = join(RAIZ, 'supabase', 'migrations');
  const sql = existsSync(migracionesDir)
    ? readdirSync(migracionesDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(migracionesDir, f), 'utf8'))
        .join('\n')
    : '';

  const tablas = [...sql.matchAll(/create table if not exists public\.(\w+)|create table public\.(\w+)/gi)]
    .map((m) => (m[1] ?? m[2]).toLowerCase())
    .filter((t, i, arr) => arr.indexOf(t) === i);

  const rlsEnabled = new Set();
  // `alter table public.X enable row level security` sueltas...
  for (const m of sql.matchAll(/alter table public\.(\w+) enable row level security/gi)) {
    rlsEnabled.add(m[1].toLowerCase());
  }
  // ...y el foreach de la migracion 04. Itero los loops COMPLETOS (array +
  // cuerpo hasta `end loop;`) y solo cuento el array cuando el CUERPO habla de
  // RLS: si no, el foreach de updated_at o fn_audit de la migracion 02 (que van
  // primero en el archivo unido) tragarian la lista equivocada.
  for (const loop of sql.matchAll(
    /foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s*\n?\s*loop([\s\S]*?)end\s*loop\s*;/gi,
  )) {
    if (!/enable\s+row\s+level\s+security/i.test(loop[2])) continue;
    for (const nombre of loop[1].matchAll(/'(\w+)'/g)) {
      rlsEnabled.add(nombre[1].toLowerCase());
    }
  }

  const sinRls = tablas.filter((t) => !rlsEnabled.has(t));
  if (tablas.length === 0) warn('RLS', 'no se encontraron migraciones');
  else if (sinRls.length === 0)
    pass('RLS habilitado en todas las tablas', `${tablas.length} tablas revisadas`);
  else fail('RLS', `sin RLS: ${sinRls.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 2. Ninguna clave secreta en el bundle del cliente
// ---------------------------------------------------------------------------
{
  // El valor REAL del service key solo se lee de .env.local (si existe): nunca
  // se imprime, solo se BUSCA en los archivos estaticos.
  const envLocal = leer('.env.local') ?? '';
  const secreto =
    envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() ??
    envLocal.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim() ??
    envLocal.match(/NEXT_PRIVATE_[A-Z_]*KEY=(.+)/)?.[1]?.trim();

  const estaticos = join(RAIZ, '.next', 'static');
  let chocado = null;

  for (const ruta of recorrer(estaticos)) {
    const contenido = readFileSync(ruta, 'utf8');
    if (secreto && contenido.includes(secreto)) {
      chocado = relative(RAIZ, ruta);
      break;
    }
    // Patrones genericos de claves de Supabase/Stripe por si no hay .env.local.
    const generico = contenido.match(/(supabase_service_role_key|sbp_[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{16,})/i);
    if (generico) {
      chocado = relative(RAIZ, ruta) + ` (patron: ${generico[1].slice(0, 24)}…)`;
      break;
    }
  }

  if (!existsSync(estaticos)) {
    warn('Secretos en el bundle', 'no hay `.next/static` (el comando se debe ejecutar tras `next build`)');
  } else if (chocado) {
    fail('Secretos en el bundle', `posible clave en ${chocado}`);
  } else {
    pass('Secretos en el bundle', secreto ? 'valor del archivo de entorno ausente de `.next/static`' : '`.next/static` libre de patrones de claves');
  }
}

// ---------------------------------------------------------------------------
// 3. Cabeceras de seguridad configuradas
// ---------------------------------------------------------------------------
{
  const cfg = leer('next.config.ts') ?? '';
  const headers = leer('lib/security/headers.ts') ?? '';
  // El middleware de la raiz delega en lib/supabase/middleware.ts.
  const middleware = (leer('middleware.ts') ?? '') + (leer('lib/supabase/middleware.ts') ?? '');

  const pruebas = [
    ['X-Frame-Options: DENY', cfg.includes("X-Frame-Options")],
    ['X-Content-Type-Options: nosniff', cfg.includes('X-Content-Type-Options')],
    ['Strict-Transport-Security', cfg.includes('Strict-Transport-Security')],
    ['CSP con nonce', headers.includes('Content-Security-Policy') && headers.includes('nonce-')],
    ['CSP en middleware (no en next.config, la doble cabecera es incompatible)', middleware.includes('buildContentSecurityPolicy')],
    ['Referrer-Policy', cfg.includes('Referrer-Policy')],
    ['Permissions-Policy con camara/microfono off', cfg.includes('Permissions-Policy')],
  ];

  const rotas = pruebas.filter(([, ok]) => !ok).map(([nombre]) => nombre);
  if (rotas.length === 0) pass('Cabeceras de seguridad', `${pruebas.length} cabeceras/config comprobados`);
  else fail('Cabeceras de seguridad', rotas.join(' · '));
}

// ---------------------------------------------------------------------------
// 4. Zod estricto en los endpoints de escritura (Server Actions)
// ---------------------------------------------------------------------------
{
  const accionesDir = join(RAIZ, 'server', 'actions');
  const archivos = existsSync(accionesDir) ? readdirSync(accionesDir).filter((f) => f.endsWith('.ts')) : [];

  const sinZod = [];
  let escrituras = 0;
  for (const archivo of archivos) {
    const contenido = readFileSync(join(accionesDir, archivo), 'utf8');
    // Una accion que recibe FormData o un payload JSON ENTRADA debe pasar por `safeParse`.
    const esEscritura = /formData|safeParse|Schema/.test(contenido);
    if (!esEscritura) continue;
    escrituras += 1;
    if (!contenido.includes('safeParse(')) sinZod.push(archivo);
    // Las mutaciones deben tener guard de permiso (una que solo consulta pubica, no cuenta).
  }

  if (escrituras === 0) warn('Zod en acciones', 'no se encontraron acciones con entrada');
  else if (sinZod.length === 0) pass('Zod presente en las acciones de escritura', `${escrituras} archivos revisados (${archivos.join(', ')})`);
  else fail('Zod en acciones', `sin safeParse: ${sinZod.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 5. Rate limiting activo en login y acciones sensibles
// ---------------------------------------------------------------------------
{
  const auth = leer('server/actions/auth.ts') ?? '';
  const rateLimit = leer('lib/rate-limit/login.ts') ?? '';

  const pruebas = [
    ['checkLoginRateLimit importado y usado', auth.includes('checkLoginRateLimit(')],
    ['recordLoginAttempt tras el intento', auth.includes('recordLoginAttempt(')],
    ['limite con reintento de tiempo', rateLimit.includes('retryAfterSeconds')],
    ['misma contrasena verificada antes de cambiarla', auth.includes('signInWithPassword')],
  ];

  const rotas = pruebas.filter(([, ok]) => !ok).map(([nombre]) => nombre);
  if (rotas.length === 0) pass('Rate limiting e auth endurecida', pruebas.length + ' comprobaciones');
  else fail('Rate limiting e auth', rotas.join(' · '));
}

// ---------------------------------------------------------------------------
// 6. Los errores de la app no exponen mensajes crudos de la capa de datos
// ---------------------------------------------------------------------------
{
  // Las acciones deben devolver textos fijos/amables; el detalle crudo solo va
  // a `console.error`. Esta regla es de patron: un `message: error.message` en
  // una respuesta al cliente revela nombres de constraint, SQL o enum values.
  const direcciones = ['server/actions', 'server/lib', 'server/repositories'];
  let fugas = [];

  for (const dir of direcciones) {
    const rutaDir = join(RAIZ, dir);
    if (!existsSync(rutaDir)) continue;
    for (const archivo of readdirSync(rutaDir)) {
      if (!archivo.endsWith('.ts')) continue;
      const contenido = readFileSync(join(rutaDir, archivo), 'utf8');
      for (const [linea, texto] of contenido.split('\n').entries()) {
        const limpio = texto.trim();
        if (limpio.startsWith('//')) continue;
        // Una respuesta ({ ok:false,...}) que PRENDE del mensaje crudo.
        if (
          /return\s*\{.*error.*message:\s*(error|e)\.(message|details)\b/.test(limpio) ||
          /error:\s*\{\s*code:.*message:\s*(error|e)\.(message|details)\b/.test(limpio)
        ) {
          fugas.push(`${relative(RAIZ, join(rutaDir, archivo))}:${linea + 1}`);
        }
      }
    }
  }

  if (fugas.length === 0) pass('Errores sin detalles internos', 'respuestas con mensajes fijos');
  else fail('Errores exponen detalles', fugas.join(', '));
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

console.log('\n== Revision estatica de seguridad (Fase 8) ==\n');
for (const linea of pasan) console.log(`  ${linea}`);
if (avisos.length) {
  console.log('');
  for (const linea of avisos) console.log(`  ${linea}`);
}
if (fallas.length) {
  console.log('');
  for (const linea of fallas) console.error(`  ${linea}`);
  console.error(`\nResultado: ${fallas.length} problema(s).\n`);
  process.exit(1);
}
console.log(`\nResultado: todo en verde (${pasan.length} controles).\n`);
