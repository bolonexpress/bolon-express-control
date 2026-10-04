import { NextResponse } from 'next/server';

import { objectPathDesdePath } from '@/lib/storage/foto-paths';
import { createClient } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/types/domain';

/**
 * Firma las fotos de un movimiento. Solo lectura.
 *
 * **Por que una ruta y no el cliente del navegador.** Las cookies de sesion son
 * `httpOnly` (ver `lib/supabase/session-cookies.ts`), asi que el cliente de
 * Supabase del navegador **no puede leerlas**: `document.cookie` no las ve. La
 * peticion salia sin token y tanto la lectura de `photos` como la firma
 * respondian 401, que es lo que hacia que el visor mostrara "no se pudo cargar"
 * en el celular y en el PC.
 *
 * El servidor si lee esas cookies, asi que firma con la sesion real del usuario.
 * No es un rodeo para saltarse la seguridad: `createClient()` de
 * `lib/supabase/server` usa la **anon key** y las cookies del usuario, asi que la
 * policy de SELECT de Storage sigue decidiendo foto por foto. Un rol sin
 * `photos:read` recibe un array vacio, igual que antes.
 *
 * No es una Server Action: no muta nada, no tiene permisos de escritura y se
 * puede cachear. Es un GET.
 *
 * Caducidad: 5 minutos. Es lo que aguanta el visor abierto; al vencer, el
 * navegador pide de nuevo y la foto vuelve.
 */

const VALIDEZ_SEGUNDOS = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const { movementId: id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Movimiento no válido.' }, { status: 400 });
  }

  const supabase = await createClient();

  // Sin sesion, `photos` no devuelve filas (RLS) y la firma daria 401. Se
  // comprueba antes para poder responder 401 y no un "no hay fotos" que
  // confundiria con un movimiento sin fotografia.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  }

  const { data: filas, error } = await supabase
    .from('photos')
    .select('id, path, mime_type')
    .eq('movement_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[api/fotos] no se pudieron leer las fotos', {
      movimiento: id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: 'No se pudieron leer las fotos.' }, { status: 500 });
  }

  const fotos = await Promise.all(
    (filas ?? []).map(async (fila) => {
      // El objeto va SIN el prefijo del bucket: es lo que espera Storage y lo
      // que lee la policy (ADR-019 / ADR-021).
      const objectPath = objectPathDesdePath(fila.path);
      // Diagnostico: que ruta llego de la base y cual se firma. El formato
      // esperado es `<UUID>/<archivo>`, sin el prefijo `movement-photos/`.
      console.log('[api/fotos] ruta recibida:', fila.path, '-> firmada como:', objectPath);
      const { data: firmada, error: errorFirma } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(objectPath, VALIDEZ_SEGUNDOS);

      if (errorFirma || !firmada?.signedUrl) {
        console.error('[api/fotos] no se pudo firmar una foto', {
          movimiento: id,
          rutaRecibida: fila.path,
          objectPath,
          statusCode: errorFirma?.statusCode,
          message: errorFirma?.message,
        });
        return { id: fila.id, url: null, mime: fila.mime_type };
      }

      return { id: fila.id, url: firmada.signedUrl, mime: fila.mime_type };
    }),
  );

  // `Cache-Control: no-store`: son credenciales de acceso, no un recurso
  // cacheable. Si un CDN las guardara, la foto de un movimiento se veria desde
  // otro dispositivo sin permiso.
  return NextResponse.json({ fotos }, { headers: { 'Cache-Control': 'no-store' } });
}