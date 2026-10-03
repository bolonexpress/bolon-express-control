#!/usr/bin/env node
/**
 * BOLON EXPRESS · Seed del primer administrador
 *
 * Crea (o verifica) el primer admin a partir de las variables de entorno:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME (opcional)
 *
 * - Usa SOLO la clave service_role (SUPABASE_SERVICE_ROLE_KEY), nunca la anon.
 * - Idempotente: si el usuario ya existe, verifica estado sin tocar su clave.
 * - El admin queda con force_password_change = true: en el primer ingreso la
 *   app lo obliga a pasar por /cambiar-password y definir su propia clave.
 *
 * Uso:  npm run seed:admin
 * Lee .env.local y luego .env (las variables ya definidas en el entorno
 * siempre ganan).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(camin) {
  if (!existsSync(camin)) return;
  const lineas = readFileSync(camin, 'utf8').split(/\r?\n/);
  for (const linea of lineas) {
    const texto = linea.trim();
    if (texto === '' || texto.startsWith('#')) continue;
    const eq = texto.indexOf('=');
    if (eq <= 0) continue;
    const clave = texto.slice(0, eq).trim();
    let valor = texto.slice(eq + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

loadEnvFile(resolve(rootDir, '.env.local'));
loadEnvFile(resolve(rootDir, '.env'));

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor || valor.trim() === '') {
    console.error(
      `Falta la variable de entorno ${nombre}. Copiar .env.example a .env.local y completarla.`,
    );
    process.exit(1);
  }
  return valor.trim();
}

const supabaseUrl = requerida('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = requerida('SUPABASE_SERVICE_ROLE_KEY');
const email = requerida('ADMIN_EMAIL').toLowerCase();
const password = requerida('ADMIN_PASSWORD');
const fullName =
  (process.env.ADMIN_FULL_NAME ?? '').trim() || email.split('@')[0] || 'Administrador';

if (password.length < 12) {
  console.warn(
    'AVISO: ADMIN_PASSWORD tiene menos de 12 caracteres. El admin la debera cambiar en el primer ingreso (force_password_change), pero conviene usar una larga desde el inicio.',
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(correo) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const coincidentes = data.users.filter(
      (user) => user.email?.toLowerCase() === correo,
    );
    if (coincidentes.length > 0) return coincidentes[0];
    if (!data.users || data.users.length < 500) break;
    page += 1;
  }
  return null;
}

async function roleByKey(key) {
  const { data, error } = await supabase.from('roles').select('id').eq('key', key).maybeSingle();
  if (error) throw new Error(`No se pudo leer el rol "${key}": ${error.message}`);
  return data;
}

async function main() {
  const existente = await findUserByEmail(email);

  if (existente) {
    const { data: perfil, error: perfilError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', existente.id)
      .maybeSingle();

    if (perfilError) throw new Error(`No se pudo leer el perfil: ${perfilError.message}`);

    if (!perfil) {
      // No deberia pasar (el trigger lo crea), pero se garantiza de todos modos.
      const { error } = await supabase.from('profiles').insert({
        id: existente.id,
        full_name: fullName,
        is_active: true,
        force_password_change: true,
      });
      if (error) throw new Error(`No se pudo crear el perfil: ${error.message}`);
      console.log(`Perfil creado para ${email} (forzando cambio de contrasena).`);
    } else if (!perfil.is_active) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('id', existente.id);
      if (error) throw new Error(`No se pudo activar el perfil: ${error.message}`);
      console.log(`Usuario ${email} estaba desactivado: se activó.`);
    }

    const admin = await roleByKey('admin');
    if (!admin) throw new Error('No existe el rol "admin". Aplica las migraciones primero.');
    const { error: upsertError } = await supabase
      .from('user_roles')
      .upsert({ user_id: existente.id, role_id: admin.id });
    if (upsertError)
      throw new Error(`No se pudo asegurar el rol admin: ${upsertError.message}`);

    const operador = await roleByKey('operador');
    if (operador) {
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', existente.id)
        .eq('role_id', operador.id);
    }

    console.log('');
    console.log(`El administrador ${email} ya existia.`);
    console.log('  Estado verificado: is_active=true, rol admin asignado.');
    console.log('  Contraseña: no se modificó.');
    if (perfil && perfil.force_password_change) {
      console.log('  force_password_change sigue activo: cambiara la clave en su próximo ingreso.');
    }
    return;
  }

  // Usuario nuevo.
  const { data: creado, error: errorCreacion } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (errorCreacion || !creado?.user?.id) {
    throw new Error(`No se pudo crear el usuario: ${errorCreacion?.message ?? 'respuesta vacía'}`);
  }

  // El trigger on_auth_user_created ya creo el perfil (con force_password_change=false)
  // y el rol operador por defecto. Se corrigen ambos:
  const { error: perfilError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, is_active: true, force_password_change: true })
    .eq('id', creado.user.id);
  if (perfilError)
    throw new Error(`No se pudo fijar force_password_change: ${perfilError.message}`);

  const admin = await roleByKey('admin');
  if (!admin) throw new Error('No existe el rol "admin". Aplica las migraciones primero.');

  const { error: rolError } = await supabase
    .from('user_roles')
    .upsert({ user_id: creado.user.id, role_id: admin.id });
  if (rolError) throw new Error(`No se pudo asignar el rol admin: ${rolError.message}`);

  const operador = await roleByKey('operador');
  if (operador) {
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', creado.user.id)
      .eq('role_id', operador.id);
  }

  console.log('');
  console.log(`Administrador creado: ${email}`);
  console.log(`  Nombre: ${fullName}`);
  console.log('  force_password_change = true (obligatoria en el primer ingreso).');
  console.log('  Rol admin asignado; el rol operador por defecto se quito.');
  console.log('');
  console.log('Cuando el admin ingrese y defina su contrasena, elimina ADMIN_EMAIL y ADMIN_PASSWORD de .env.local.');
}

main().catch((error) => {
  console.error('');
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
