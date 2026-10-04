import { PHOTO_BUCKET } from '@/types/domain';

/**
 * Las dos convenciones de ruta de una foto, en un solo sitio.
 *
 * Son deliberadamente DISTINTAS y el error del ADR-019 fue confundirlas:
 *
 * - **El objeto de Storage va SIN el bucket.** `supabase.storage.from(bucket)`
 *   ya apunta al bucket, asi que el `path` que se le pasa es relativo a el, y
 *   eso es lo que queda en `storage.objects.name`. La policy de INSERT lee el
 *   movimiento de `(storage.foldername(name))[1]`, es decir, del PRIMER
 *   segmento: con el bucket dentro, ese segmento era `"movement-photos"` y la
 *   busqueda del movimiento no encontraba nada (403).
 * - **La fila de `public.photos` va CON el bucket.** El CHECK
 *   `photos_path_movimiento` (migracion 01) exige
 *   `split_part(path,'/',1) = 'movement-photos'` y 36 caracteres en el
 *   segmento 2, y es lo que hace unico el path dentro del bucket privado.
 *
 * Equivalente en SQL: `public.photo_object_path(path)` quita el prefijo. La
 * funcion existe y esta permitida, pero se usa el equivalente de aqui porque
 * firmar una foto por RPC seria un viaje extra por cada imagen, y el listado
 * del detalle ya trae las filas.
 */

/** Prefijo que la base exige en `photos.path`. */
const PREFIJO = `${PHOTO_BUCKET}/`;

/**
 * `public.photos.path`: `movement-photos/<movement_id>/<archivo>`.
 *
 * Es el valor que se guarda en la base y el que devuelve `listFotosDelMovimiento`.
 */
export function pathDeFoto(movimientoId: string, archivo: string): string {
  return `${PREFIJO}${movimientoId}/${archivo}`;
}

/**
 * Ruta DENTRO del bucket: `<movement_id>/<archivo>`.
 *
 * Es lo que se pasa a `.upload()`, `.remove()` y `.createSignedUrl()`, y lo que
 * las policies de `storage.objects` toman como `name`.
 */
export function objectPathDeFoto(movimientoId: string, archivo: string): string {
  return `${movimientoId}/${archivo}`;
}

/**
 * Quita el prefijo del bucket a `public.photos.path`.
 *
 * Solo quita `movement-photos/` cuando es prefijo de verdad: si someday una
 * fila tuviera otra cosa delante, se devuelve tal cual en vez de mutilar el
 * nombre y producir un 404 silencioso al firmar.
 */
export function objectPathDesdePath(path: string): string {
  return path.startsWith(PREFIJO) ? path.slice(PREFIJO.length) : path;
}