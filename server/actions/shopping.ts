'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { agregarPendienteSchema, cambiarEstadoSchema } from '@/lib/validation/shopping';
import { AuthError } from '@/server/auth/errors';
import { requirePermission } from '@/server/auth/guards';
import type { AuthContext } from '@/server/auth/guards';
import {
  getEstadoCompra,
  insertCompra,
  listProductosParaCompra,
  updateEstadoCompra,
} from '@/server/repositories/shopping';
import { COMPRAS_ESTADO_LABEL, COMPRAS_TRANSICIONES, PERMISOS } from '@/types/domain';
import type { ShoppingActionState } from '@/types/domain';

/**
 * Server Actions de la lista de compras. Mismo contrato que el catalogo:
 *   1. Guard RBAC (`shopping:write`) ANTES de tocar FormData.
 *   2. Zod estricto.
 *   3. Reglas (transiciones, producto existe activo).
 *   4. Repositorio: tabla -> RLS -> trigger de historial (Fase 1).
 *
 * El enunciado de la Fase 6 habla de `shopping:create` y `shopping:update`;
 * el permiso real sembrado es `shopping:write` (Fase 1). Se reutiliza, igual
 * que `catalog:write` en ADR-010: duplicar el permiso obligaria a una
 * migracion sin efecto sobre la RLS. El historial y la transicion se registran
 * por trigger, no en la accion: no hay forma de cambiar el estado sin dejar
 * rastro aunque se actualice la tabla directamente.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor : '';
}

function erroresDeZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !(campo in fields)) fields[campo] = issue.message;
  }
  return fields;
}

function falloValidacion(fields: Record<string, string>): ShoppingActionState {
  return { ok: false, error: { code: 'validacion', message: 'Revisa los datos marcados.', fields } };
}

function falloRegla(message: string, fields: Record<string, string> = {}): ShoppingActionState {
  return { ok: false, error: { code: 'regla_negocio', message, fields } };
}

function falloGuard(): ShoppingActionState {
  return {
    ok: false,
    error: {
      code: 'sin_permiso',
      message: `Necesitas el permiso ${PERMISOS.shoppingWrite} para hacer este cambio.`,
    },
  };
}

async function exigirShoppingWrite(): Promise<{ contexto: AuthContext } | { denegado: ShoppingActionState }> {
  try {
    const contexto = await requirePermission(PERMISOS.shoppingWrite);
    return { contexto };
  } catch (error) {
    if (error instanceof AuthError) return { denegado: falloGuard() };
    throw error;
  }
}

function exito(id: string, mensaje: string): ShoppingActionState {
  return { ok: true, data: { id, mensaje } };
}

// ---------------------------------------------------------------------------
// Agregar pendiente (producto del catalogo o texto libre)
// ---------------------------------------------------------------------------

export async function agregarPendienteAction(
  _estadoAnterior: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const autorizacion = await exigirShoppingWrite();
  if ('denegado' in autorizacion) return autorizacion.denegado;
  const { contexto } = autorizacion;

  const parsed = agregarPendienteSchema.safeParse({
    producto_id: texto(formData, 'producto_id'),
    descripcion: texto(formData, 'descripcion'),
    cantidad: texto(formData, 'cantidad'),
    prioridad: texto(formData, 'prioridad'),
    proveedor: texto(formData, 'proveedor'),
    notas: texto(formData, 'notas'),
  });

  if (!parsed.success) return falloValidacion(erroresDeZod(parsed.error));

  const datos = parsed.data;
  let unitId: string | null = null;

  if (datos.producto_id) {
    // Solo productos activos del catalogo; la unidad sale del propio producto.
    const productos = await listProductosParaCompra();
    const producto = productos.find((p) => p.id === datos.producto_id);
    if (!producto) {
      return falloRegla('Ese producto ya no existe o está inactivo.', {
        producto_id: 'Selecciona un producto activo.',
      });
    }
    unitId = producto.unit_id;
  }

  const resultado = await insertCompra(
    {
      product_id: datos.producto_id,
      descripcion: datos.producto_id ? '' : (datos.descripcion ?? ''),
      unit_id: unitId,
      cantidad_sugerida: datos.cantidad,
      prioridad: datos.prioridad,
      proveedor: datos.proveedor,
      notas: datos.notas,
      estado: 'pendiente',
      auto_generated: false,
    },
    contexto.user.id,
  );

  if (!resultado.ok) return falloRegla(resultado.message);

  revalidatePath('/compras');
  revalidatePath('/');
  return exito(resultado.id, `Pendiente ${resultado.codigo ?? ''} agregado.`);
}

// ---------------------------------------------------------------------------
// Cambiar estado (con validacion de transicion en accion Y trigger)
// ---------------------------------------------------------------------------

export async function cambiarEstadoPendienteAction(
  _estadoAnterior: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const autorizacion = await exigirShoppingWrite();
  if ('denegado' in autorizacion) return autorizacion.denegado;
  const { contexto } = autorizacion;

  const parsed = cambiarEstadoSchema.safeParse({
    id: texto(formData, 'id'),
    estado: texto(formData, 'estado'),
    cantidad_comprada: texto(formData, 'cantidad_comprada'),
    precio_unitario: texto(formData, 'precio_unitario'),
  });

  if (!parsed.success) return falloValidacion(erroresDeZod(parsed.error));

  const { id, estado: destino } = parsed.data;

  // Validacion amable en la app; el trigger `trg_shopping_transicion` (migracion
  // 11) repite el examen en la base por si alguien actualiza por otra via.
  const actual = await getEstadoCompra(id);
  if (!actual) return falloRegla('Ese pendiente ya no existe.');

  if (!COMPRAS_TRANSICIONES[actual].includes(destino)) {
    const esperado = COMPRAS_TRANSICIONES[actual].map((e) => COMPRAS_ESTADO_LABEL[e]).join(', ');
    return falloRegla(
      `Un pendiente "${COMPRAS_ESTADO_LABEL[actual]}" solo puede pasar a: ${esperado || 'nada (ya está cerrado)'}.`,
      { estado: 'Transición no permitida.' },
    );
  }

  const resultado = await updateEstadoCompra(
    id,
    destino,
    {
      cantidad_comprada: destino === 'comprado' ? parsed.data.cantidad_comprada : null,
      precio_unitario: destino === 'comprado' ? parsed.data.precio_unitario : null,
    },
    contexto.user.id,
  );

  if (!resultado.ok) return falloRegla(resultado.message);

  revalidatePath('/compras');
  revalidatePath(`/compras/${id}`);
  return exito(id, `Pasó a "${COMPRAS_ESTADO_LABEL[destino]}".`);
}
