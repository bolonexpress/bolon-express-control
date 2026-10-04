#!/usr/bin/env node
/**
 * Verificacion runtime de las policies del bucket `movement-photos` (ADR-019).
 *
 * Consigue un token REAL de usuario por la API de Auth y repite la subida con
 * el cliente de SESION (anon key + `Authorization: Bearer`), nunca con
 * `service_role`: con la service_role la RLS se salta entera y la prueba no
 * probaria nada.
 *
 * Compara las dos formas de construir la ruta del objeto, que es exactamente la
 * desalineacion entre la migracion 05 y `adjuntarFotoMovimiento()` (ADR-019):
 *
 *   A) `movement-photos/<movement_id>/<archivo>`  -> lo que generaba el codigo
 *   B) `<movement_id>/<archivo>`                  -> lo que exige la policy
 *
 * Uso: `node scripts/storage-check.mjs` (o `npm run check:storage`).
 *
 * Escribe en el bucket SOLO durante la prueba y lo borra al final con el mismo
 * cliente de sesion (policy de DELETE). Si la subida de la variante buena deja
 * un objeto huerfano, seLimpia en la parte 4 aunque el borrado falle.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'movement-photos';
const CODIGO_MOVIMIENTO = '#000001';

/** `.env.local` sin dependencias: mismo parseo que `_rls.ts` de diagnostico. */
function leerEnv(ruta = '.env.local') {
  const salida = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let valor = m[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    salida[m[1]] = valor;
  }
  return salida;
}

/** PNG 1x1 transparente valido (~70 bytes). */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const falla = [];
const pasan = [];
const avisos = [];

function pass(nombre, detalle) {
  pasan.push(`PASS  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(pasan[pasan.length - 1]);
}
function fail(nombre, detalle) {
  falla.push(`FAIL  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(falla[falla.length - 1]);
}
function warn(nombre, detalle) {
  avisos.push(`WARN  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(avisos[avisos.length - 1]);
}
function titulo(texto) {
  console.log(`\n--- ${texto} ---`);
}

/**
 * Cuando la subida canonica falla con 403, el 403 no dice *que* policy fallo ni
 * *por que*: dice lo mismo tanto si la ruta esta mal como si el helper que
 * resuelve el movimiento esta roto. Esta funcion hace esa distincion, porque
 * no se prueba nada: se llama a `movement_id_de_foto` (la funcion que las tres
 * policies usan para obtener el movimiento, desde la migracion 14) y se imprime
 * que devuelve para la MISMA ruta que acaba de ser rechazada.
 *
 * Se llama con `service_role` a proposito: es una funcion `stable` de solo
 * lectura, sin efectos, y lo que interesa es su *resultado*, no si la RLS la deja
 * pasar. Asi el diagnostico no depende de los permisos de la sesion de prueba.
 */
async function diagnosticarHelper(env, nombre, movimientoId) {
  console.log(`  -- diagnostico: que resuelve movement_id_de_foto("${nombre}") --`);

  const { data, error } = await createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).rpc('movement_id_de_foto', { p_nombre: nombre });

  if (error) {
    console.log(
      `  resultado -> ERROR ${error.statusCode ?? ''} ${error.message}` +
        '\n  lectura: la funcion no existe o no se puede llamar. La migracion 14 esta aplicada a medias.',
    );
    return;
  }

  if (data === movimientoId) {
    console.log(
      '  resultado -> el UUID correcto' +
        '\n  lectura: el helper esta bien, asi que el 403 viene de otra parte de la policy' +
        ' (permisos, bucket o el objeto ya existe).',
    );
  } else {
    console.log(
      `  resultado -> ${data === null ? 'null' : data}` +
        `\n  lectura: el helper NO resuelve la forma canonica, asi que la policy no encuentra` +
        `\n         el movimiento y rechaza con 403. Es el fallo de la migracion 14:` +
        `\n         storage.foldername() excluye el nombre del archivo, asi que` +
        `\n         <movement_id>/<archivo> tiene UNA carpeta, no dos. Se corrige con la` +
        `\n         migracion 15.`,
    );
  }
}

async function main() {
  const env = leerEnv();

  for (const clave of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    if (!env[clave]) {
      console.error(`Falta ${clave} en .env.local`);
      process.exit(1);
    }
  }

  // -- 1) Token real de usuario por la API de Auth ----------------------------
  titulo('1) Token real de usuario (API de Auth)');
  const respuesta = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
    },
  );
  const json = await respuesta.json();
  if (!json.access_token) {
    fail('token de usuario', `${respuesta.status} ${JSON.stringify(json).slice(0, 200)}`);
    return;
  }
  const uid = json.user.id;
  pass('token de usuario', `uid=${uid}, rol del JWT=${json.user.role}`);

  // Cliente de SESION. Es el mismo camino que usa la app: si la RLS pasa aqui,
  // pasa en la app, porque la RLS depende del `auth.uid()` del JWT, no de como
  // se haya conseguido la sesion.
  const sesion = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${json.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -- 2) Un movimiento real, para que la policy tenga sobre que decidir -----
  titulo(`2) Movimiento ${CODIGO_MOVIMIENTO} (la policy exige que exista y no este anulado)`);
  // `anulacion_id` no existe en `movements`: es la vista `v_movimientos` la que
  // lo compone con `movement_anulations`.
  const { data: movimiento, error: errorMovimiento } = await sesion
    .from('movements')
    .select('id, codigo')
    .eq('codigo', CODIGO_MOVIMIENTO)
    .maybeSingle();

  if (errorMovimiento || !movimiento) {
    fail(
      'leer el movimiento',
      errorMovimiento
        ? `${errorMovimiento.code} ${errorMovimiento.message}`
        : `no existe ${CODIGO_MOVIMIENTO}`,
    );
    return;
  }

  const { data: anulacion } = await sesion
    .from('movement_anulations')
    .select('id')
    .eq('movement_id', movimiento.id)
    .maybeSingle();

  if (anulacion) {
    warn('movimiento', `${CODIGO_MOVIMIENTO} esta anulado: la policy de INSERT lo rechazaria`);
  } else {
    pass('movimiento', `${movimiento.codigo} id=${movimiento.id} vigente`);
  }

  const archivo = `verificacion-${Date.now()}.png`;
  const conBucket = `${BUCKET}/${movimiento.id}/${archivo}`;
  const sinBucket = `${movimiento.id}/${archivo}`;

  // -- 3) Las dos rutas ------------------------------------------------------
  titulo('3) Subida: ruta CON el bucket dentro (la que generaba el codigo)');
  console.log(`  path a .upload(): ${conBucket}`);
  console.log(`  nombre real     : ${conBucket}   <- foldername(name)[1] = "${BUCKET}"`);
  const mala = await sesion.storage.from(BUCKET).upload(conBucket, PNG_1x1, {
    contentType: 'image/png',
  });
  console.log(
    `  resultado -> ${mala.error ? `ERROR ${mala.error.statusCode ?? ''}: ${mala.error.message}` : 'subio (inesperado)'}`,
  );
  if (mala.error) {
    const rls = /row-level security|row level security/i.test(mala.error.message);
    if (rls) {
      pass('ruta con bucket rechazada por RLS', 'confirma el diagnostico del ADR-019');
    } else {
      fail('ruta con bucket', `error inesperado: ${mala.error.message}`);
    }
  } else {
    fail('ruta con bucket', 'subio: la policy NO esta aplicando el foldername que se cree');
    await sesion.storage.from(BUCKET).remove([conBucket]);
  }

  titulo('4) Subida: ruta canonica que exige la policy (sin el bucket)');
  console.log(`  path a .upload(): ${sinBucket}`);
  console.log(`  nombre real     : ${sinBucket}   <- foldername(name)[1] = movement_id`);
  const buena = await sesion.storage.from(BUCKET).upload(sinBucket, PNG_1x1, {
    contentType: 'image/png',
  });
  if (buena.error) {
    fail('subida canonica', `${buena.error.statusCode ?? ''} ${buena.error.message}`);
    await diagnosticarHelper(env, sinBucket, movimiento.id);
  } else {
    pass('subida canonica', `201, objeto creado en ${sinBucket}`);
  }

  // -- 4) Firma de la URL: el segundo bug con la misma raiz ------------------
  // `photos.path` lleva el prefijo del bucket y Storage no lo quiere. Firmar
  // con el path tal cual (lo que hacia `listFotosDelMovimiento`) apunta a un
  // objeto inexistente. Se comprueban las dos formas: solo lectura y sin
  // escribir nada en `public.photos`.
  titulo('5) Firma de la URL (mismo cliente de sesion)');
  if (!buena.error) {
    const firmaOk = await sesion.storage.from(BUCKET).createSignedUrl(sinBucket, 120);
    if (firmaOk.error || !firmaOk.data?.signedUrl) {
      fail(
        'firmar la ruta canonica',
        firmaOk.error ? firmaOk.error.message : 'no devolvio signedUrl',
      );
    } else {
      const descarga = await fetch(firmaOk.data.signedUrl);
      const bytes = Buffer.from(await descarga.arrayBuffer());
      if (descarga.ok && bytes.equals(PNG_1x1)) {
        pass('firmar y descargar', `200 y ${bytes.length} bytes identicos al subido`);
      } else {
        fail(
          'descargar la URL firmada',
          `HTTP ${descarga.status}, ${bytes.length} bytes (esperados ${PNG_1x1.length})`,
        );
      }
    }

    const firmaMala = await sesion.storage
      .from(BUCKET)
      .createSignedUrl(`${BUCKET}/${sinBucket}`, 120);
    console.log(
      `  firmar con el prefijo de mas (como hacia el codigo antes): ${
        firmaMala.error
          ? `ERROR ${firmaMala.error.statusCode ?? ''}: ${firmaMala.error.message}`
          : 'firmo, pero apunta a un objeto que no existe'
      }`,
    );
  } else {
    warn('firma', 'no habia objeto que firmar');
  }

  // -- 5) Registro en public.photos, igual que lo hace la app --------------
  // La fila va CON el prefijo del bucket (lo exige el CHECK
  // `photos_path_movimiento` y la policy `photos_insert`). Se inserta, se lee y
  // se borra en el mismo script: al final no queda ninguna fila.
  titulo('6) Fila en public.photos con la ruta que usa la app');
  if (!buena.error) {
    const filaPath = `${BUCKET}/${sinBucket}`;
    const insercion = await sesion.from('photos').insert({
      movement_id: movimiento.id,
      path: filaPath,
      mime_type: 'image/png',
      size_bytes: PNG_1x1.length,
      created_by: uid,
    });

    if (insercion.error) {
      fail('insertar la fila de la foto', `${insercion.error.code} ${insercion.error.message}`);
    } else {
      pass('insertar la fila de la foto', `path=${filaPath}`);

      const lectura = await sesion
        .from('photos')
        .select('id, path, created_by')
        .eq('movement_id', movimiento.id)
        .maybeSingle();
      if (lectura.error || !lectura.data) {
        fail('leer la fila de la foto', lectura.error?.message ?? 'no volvio');
      } else {
        pass(
          'leer la fila de la foto',
          `created_by=${lectura.data.created_by === uid ? 'el mismo usuario' : 'OTRO'}`,
        );
      }

      const borrado = await sesion.from('photos').delete().eq('movement_id', movimiento.id);
      if (borrado.error) {
        fail('borrar la fila de la foto', borrado.error.message);
        warn('limpieza', `quedo una fila de prueba en public.photos para ${movimiento.codigo}`);
      } else {
        pass('borrar la fila de la foto', 'la prueba no deja rastro');
      }
    }
  } else {
    warn('fila de la foto', 'no habia objeto, no hay nada que registrar');
  }

  // -- 6) Borrado con el MISMO cliente de sesion ----------------------------
  titulo('7) Borrado del objeto con el mismo cliente de sesion (policy de DELETE)');
  if (!buena.error) {
    const borrado = await sesion.storage.from(BUCKET).remove([sinBucket]);
    if (borrado.error) {
      fail('borrado', `${borrado.error.statusCode ?? ''} ${borrado.error.message}`);
      warn('limpieza', `quedo el objeto ${sinBucket}; borralo a mano`);
    } else {
      pass('borrado', `eliminado ${sinBucket}`);
    }
  } else {
    warn('borrado', 'no habia nada que borrar');
  }

  // -- 7) Estado final del bucket -------------------------------------------
  titulo('8) Estado final (solo lectura, service_role)');
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const raiz = await admin.storage.from(BUCKET).list('', { limit: 100 });
    const enRaiz = (raiz.data ?? []).map((o) => o.name);
    console.log(`  raiz del bucket: ${enRaiz.length === 0 ? '(vacia)' : enRaiz.join(', ')}`);

    // La forma que generaba el codigo metia el bucket DENTRO de la ruta, asi que
    // sus objetos cuelgan de una carpeta llamada igual que el bucket. Se mira
    // tambien ese nivel: es donde quedaria la basura de la version previa.
    const basura = await admin.storage.from(BUCKET).list(BUCKET, { limit: 100 });
    const enDoble = (basura.data ?? []).map((o) => o.name);
    console.log(`  carpeta "${BUCKET}/": ${enDoble.length === 0 ? '(no existe)' : enDoble.join(', ')}`);

    const carpeta = await admin.storage.from(BUCKET).list(movimiento.id, { limit: 100 });
    const nombres = (carpeta.data ?? []).map((o) => o.name);
    console.log(`  objetos del movimiento: ${nombres.length === 0 ? '(ninguno)' : nombres.join(', ')}`);

    const filas = await admin.from('photos').select('id').eq('movement_id', movimiento.id);
    console.log(`  filas en photos de ${movimiento.codigo}: ${filas.data?.length ?? 0}`);

    if (enDoble.length > 0) {
      warn(
        'objetos con el bucket en el nombre',
        `${enDoble.length} en "${BUCKET}/${BUCKET}/". La policy no los deja leer: se pueden borrar a mano.`,
      );
    }
  } else {
    warn('estado final', 'sin SUPABASE_SERVICE_ROLE_KEY no se puede listar');
  }

  // -- 6) Resumen -----------------------------------------------------------
  if (avisos.length > 0) console.log('');
  console.log(`\n${pasan.length} PASS · ${falla.length} FAIL · ${avisos.length} WARN`);
  process.exitCode = falla.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('La verificacion fallo a medio camino:', error);
  process.exit(1);
});