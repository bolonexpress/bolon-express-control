import { z } from 'zod';

import { ANULACION_MOTIVO, MOVIMIENTO_MOTIVO, MOVIMIENTO_TIPO } from '@/types/domain';
import type { EnumValue } from '@/types/database';

/**
 * Esquemas Zod de movimientos. Se importan TAL CUAL desde el formulario y
 * desde la Server Action: es la doble validacion que pide ARCHITECTURE.md §5.1,
 * hecha de una sola implementacion para que cliente y servidor no puedan
 * divergir. La base de datos vuelve a validar (constraints + RPC).
 *
 * Convenciones (mismas que lib/validation/catalog.ts):
 *  - `.strict()`: no se aceptan campos extra.
 *  - Los campos numericos llegan como string desde FormData y se coercen.
 *  - Un campo vacio es `undefined`, nunca `NaN` ni 0.
 */

/** `numeric(14,3)`: 11 enteros + 3 decimales. */
const MAX_CANTIDAD = 99_999_999_999.999;

const vacioAUndefined = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

/**
 * Numero opcional: "" o ausente -> undefined, "3.5" -> 3.5.
 *
 * Solo punto decimal: los campos son `<input type="number">`, que ya normaliza
 * a punto lo que el teclado del telefono mande. Una coma se rechazaria, y con
 * razon: aceptarla exigiria distinguirla del separador de miles.
 *
 * El `.optional()` NO es cosmetico y va DESPUES del `.refine`: `vacioAUndefined`
 * convierte el "" en `undefined`, pero si el esquema no lo acepta, `z.coerce.number()`
 * sigue coerceando `undefined` a `NaN` y el `refine` lo rechaza con
 * "Ingresa un numero valido". Ese fue el bug que impidio registrar movimientos
 * de productos en modo `cantidad`: el formulario no dibuja el campo de peso, el
 * FormData llega sin el, y `texto()` devuelve "" -> NaN -> rechazo con
 * `invalid_type` sobre un campo que el usuario jamas ve (ver ADR-017).
 */
const numeroOpcional = z.preprocess(
  vacioAUndefined,
  z.coerce
    .number({ invalid_type_error: 'Ingresa un número válido' })
    .refine((n) => Number.isFinite(n), 'Ingresa un número válido')
    .refine((n) => Math.abs(n) <= MAX_CANTIDAD, 'Valor demasiado grande')
    .optional(),
);

/**
 * Numero positivo opcional: "" o ausente -> undefined.
 *
 * Mismo `.optional()` y mismo motivo que en `numeroOpcional` (ADR-017).
 */
const numeroPositivo = z.preprocess(
  vacioAUndefined,
  z.coerce
    .number({ invalid_type_error: 'Ingresa un número válido' })
    .refine((n) => Number.isFinite(n), 'Ingresa un número válido')
    .refine((n) => n > 0, 'Debe ser mayor que 0')
    .refine((n) => n <= MAX_CANTIDAD, 'Valor demasiado grande')
    .optional(),
);

const textoOpcional = (max: number, mensaje: string) =>
  z.preprocess(
    vacioAUndefined,
    z.string().trim().max(max, mensaje).optional(),
  );

/**
 * Archivo opcional. Solo comprueba que lo que llega es un `File` con contenido:
 * el mime y el tamano los valida la Server Action, que es quien conoce los
 * limites de configuracion (`photos_max_size_bytes`) y el `file_size_limit` del
 * bucket. Aqui basta con que un campo de archivo vacio no se confunda con uno
 * corrupto.
 */
const archivoOpcional = z.preprocess(
  vacioAUndefined,
  z.custom<File>((valor) => typeof File !== 'undefined' && valor instanceof File && valor.size > 0, {
    message: 'No se recibió el archivo de la foto. Vuelve a adjuntarlo.',
  }).optional(),
);

// ---------------------------------------------------------------------------
// Registrar movimiento (entrada / salida / ajuste)
// ---------------------------------------------------------------------------

/**
 * Clave reservada para los issues de Zod sin `path` (por ejemplo, la clave
 * `unrecognized_keys` de `.strict()`, cuyo path es `[]`). Antes esos issues se
 * descartaban y devolvian un `fields` vacio: el formulario pintaba "Revisa los
 * datos marcados" sin marcar nada, que es exactamente el fallo que se reporto.
 * La UI la lista junto a las claves del esquema que no tienen control visible.
 */
export const CAMPO_FORMULARIO = '_form';

/**
 * `cantidad` va en la unidad del producto (la que eligio el usuario) y el
 * servidor la convierte a la unidad base antes de llamar a la RPC: el stock se
 * acumula en unidades base (ADR-011). `peso_kg` SIEMPRE va en kg, porque es la
 * unidad interna (ADR-001).
 *
 * El signo lo pone el `tipo`: la RPC lo aplica sobre `delta_cantidad`. En un
 * ajuste el usuario escribe el valor ya con signo (+aumenta, -reduce).
 */
/**
 * Reglas del esquema, independientes del producto.
 *
 * La regla "este producto se controla por peso, entonces pide `peso_kg`" NO puede
 * vivir aqui: el esquema no sabe que producto se eligio. Se aplica en
 * `validarValoresSegunModo`, que corre en el formulario (con la fila que ya tiene
 * en memoria) y en el servidor (con la fila real). Aqui solo se puede comprobar
 * lo que el propio FormData dice, y por eso el campo ausente se acepta: que falte
 * el peso solo es un error si el producto no se controla por peso, y eso se decide
 * despues (ADR-017).
 */
export const registrarMovimientoSchema = z
  .object({
    tipo: z.enum(MOVIMIENTO_TIPO, { message: 'Tipo de movimiento no válido' }),
    producto_id: z.string().uuid({ message: 'Selecciona un producto' }),
    cantidad: numeroOpcional,
    peso_kg: numeroPositivo,
    motivo: z.enum(MOVIMIENTO_MOTIVO, { message: 'Selecciona un motivo' }),
    notes: textoOpcional(2000, 'Máximo 2000 caracteres'),
    // ADR-006: la genera el cliente (UUID) y viaja en cada reintento. Cambiar
    // cualquier dato del formulario obliga a regenerarla (ver MovementForm).
    idempotency_key: z.string().uuid({ message: 'Clave de idempotencia inválida' }),
    // El archivo viaja en el FormData. El mime y el tamano los decide la accion
    // (con la configuracion y el bucket); aqui solo se reconoce el `File`.
    foto: archivoOpcional,
  })
  .strict()
  .superRefine((datos, ctx) => {
    const esAjuste = datos.tipo === 'ajuste';

    if (datos.cantidad === undefined && datos.peso_kg === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cantidad'],
        message: 'Ingresa la cantidad o el peso del movimiento',
      });
      return;
    }

    // En un ajuste se admiten negativos (restar stock). En los demas tipos no:
    // el signo lo pone `delta_cantidad`, y un "-3" en una entrada seria una
    // salida disfrazada. El peso no admite negativos en ningun caso.
    if (datos.cantidad !== undefined) {
      if (!esAjuste && datos.cantidad <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cantidad'],
          message: 'La cantidad debe ser mayor que 0',
        });
      }
      if (esAjuste && datos.cantidad === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cantidad'],
          message: 'En un ajuste la cantidad no puede ser 0',
        });
      }
    }

    if (datos.peso_kg !== undefined && datos.peso_kg <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['peso_kg'],
        message: 'El peso debe ser mayor que 0',
      });
    }
  });

/**
 * Reglas que dependen del producto y por eso no pueden vivir en el esquema:
 * las aplica el servidor con la fila real y el formulario con la que ya tiene
 * en memoria. Mismo codigo, misma respuesta.
 *
 * Traduce exactamente lo que exige `registrar_movimiento()`:
 *   - modo `cantidad` -> `p_cantidad` obligatorio;
 *   - modo `peso`     -> `p_peso_kg` obligatorio;
 *   - modo `ambos`    -> al menos uno de los dos.
 */
export function validarValoresSegunModo(
  datos: { cantidad?: number | undefined; peso_kg?: number | undefined },
  controlMode: EnumValue<'modo_control'>,
): Record<string, string> {
  const errores: Record<string, string> = {};

  if (controlMode === 'cantidad' && datos.cantidad === undefined) {
    errores.cantidad = 'Este producto se controla por cantidad: indica cuántas piezas.';
  }

  if (controlMode === 'peso' && datos.peso_kg === undefined) {
    errores.peso_kg = 'Este producto se controla por peso: indica los kilogramos.';
  }

  if (controlMode === 'ambos' && datos.cantidad === undefined && datos.peso_kg === undefined) {
    errores.cantidad = 'Indica al menos la cantidad o el peso.';
  }

  return errores;
}

// ---------------------------------------------------------------------------
// Anular movimiento
// ---------------------------------------------------------------------------

export const anularMovimientoSchema = z
  .object({
    movementId: z.string().uuid({ message: 'Movimiento no válido' }),
    motivo: z.enum(ANULACION_MOTIVO, { message: 'Selecciona un motivo de anulación' }),
    detalle: z.preprocess(
      vacioAUndefined,
      z.string().trim().min(5, 'Explica brevemente el motivo (mínimo 5 caracteres)').max(1000, 'Máximo 1000 caracteres').optional(),
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

export const FOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const FOTO_MAX_BYTES = 15 * 1024 * 1024;

export const FOTO_ACEPTADOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Extension del bucket a partir del mime type. El path lo arma el servidor. */
export const EXTENSION_POR_MIME: Record<(typeof FOTO_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function esMimeDeFoto(mime: string): mime is (typeof FOTO_MIME_TYPES)[number] {
  return (FOTO_MIME_TYPES as readonly string[]).includes(mime);
}

export type RegistrarMovimientoInput = z.infer<typeof registrarMovimientoSchema>;
export type AnularMovimientoInput = z.infer<typeof anularMovimientoSchema>;
