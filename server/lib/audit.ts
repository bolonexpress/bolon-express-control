import { createClient } from '@/lib/supabase/server';
import type { EnumValue } from '@/types/database';

// ---------------------------------------------------------------------------
// Auditoria a nivel aplicacion (Fase 8)
//
// Cobertura existente SIN tocar codigo de acciones:
//  - Trigger `fn_audit` (migracion 02): products, categories, units, profiles,
//    roles, role_permissions, user_roles, app_config, shopping_list.
//  - RPCs `registrar_movimiento` / `anular_movimiento` (migracion 03):
//    escriben su fila DENTRO de la misma transaccion.
//
// Por eso `logAudit` solo se integra en los eventos que la base no ve
// (login, logout, cambio de contrasena). Duplicar la escritura en la capa
// app daria DOS filas por operacion y destruiria la propiedad "una fila por
// operacion" de la bitacora. Ver ADR-015.
// ---------------------------------------------------------------------------

export type AuditoriaAccion = EnumValue<'auditoria_accion'>;

export type AuditoriaEntrada = {
  accion: AuditoriaAccion;
  /** Tabla o dominio del evento: 'products', 'shopping_list', 'auth', ... */
  entidad: string;
  entidadId?: string | null;
  entidadCodigo?: string | null;
  /** Datos auditables; nada de secretos (contrasenas, tokens, paths privados). */
  datos?: Record<string, unknown>;
};

/**
 * Escribe en `audit_logs` a traves de la RPC `log_audit` (migracion 13), que
 * fija actor/email desde la sesion (nadie puede firmar por otro).
 *
 * NUNCA lanza: la auditoria no puede tumbar la accion que la origino. Un
 * fallo aqui se registra en consola del servidor y se sigue adelante. No es
 * bloqueante a proposito: los llamadores pueden `void logAudit(...)` (fire
 * and forget) cuando no necesitan esperar, o `await logAudit(...)` cuando la
 * fila debe existir antes de responder (ej.: cambio de contrasena).
 */
export async function logAudit(entrada: AuditoriaEntrada): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_audit', {
      p_accion: entrada.accion,
      p_entidad: entrada.entidad,
      p_datos: entrada.datos ?? {},
      p_entidad_id: entrada.entidadId ?? null,
      p_entidad_codigo: entrada.entidadCodigo ?? null,
    });

    if (error) {
      console.error('[audit] no se pudo registrar', {
        accion: entrada.accion,
        entidad: entrada.entidad,
        error: error.message,
      });
    }
  } catch (error) {
    console.error('[audit] excepcion al registrar', entrada.accion, error);
  }
}
