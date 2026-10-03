# Revisión de seguridad (Fase 8)

Checklist automatizado. Se ejecuta con:

```bash
npm run audit:security
```

Tras un `next build` para que `.next/static` exista (si no, ese control sale
con WARN y no cuenta como fallo).

## Qué verifica `scripts/security-audit.mjs`

| Control | Estado automático | Cómo lo comprueba |
|---------|-------------------|-------------------|
| RLS habilitado en todas las tablas | PASS/FAIL | Recorre `create table public.*` en las migraciones y cruza con los `enable row level security` (incluido el foreach de la migración 04). |
| Secretos expuestos en el bundle | PASS/FAIL (WARN sin build) | Busca el valor real de `SUPABASE_SERVICE_ROLE_KEY` y patrones de claves (`sbp_`, `sk_live_`) en `.next/static`. |
| Cabeceras de seguridad | PASS/FAIL | Confirma `X-Frame-Options: DENY`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy` en `next.config.ts`, y la CSP con nonce por petición en `middleware.ts` (la CSP no vive en `next.config.ts` porque requiere nonce; ver ADR-008). |
| Zod presente en endpoints de escritura | PASS/FAIL | Cada `server/actions/*.ts` que recibe entrada debe pasar por `safeParse`; los esquemas están en `lib/validation/*.ts` con `.strict()`. |
| Rate limiting y auth endurecida | PASS/FAIL | `loginAction` pasa por `checkLoginRateLimit`/`recordLoginAttempt`; el cambio de clave verifica la actual antes de actualizar. |
| Errores sin detalles internos | PASS/FAIL | Las respuestas al cliente usan mensajes fijos; el detalle crudo solo va a `console.error`. |

## Bitácora de auditoría: qué cubre cada capa

No hay una sola funciencia "logAudit" invocada a mano en cada acción por
diseño (ver DECISIONES.md ADR-015): el desastre con la auditoría a mano alzada
es que se pisen las filas. La cobertura queda asi:

| Evento | Quien lo registra | Alcance |
|--------|-------------------|---------|
| Catálogo (alta/edición/desactivación) | Trigger `fn_audit` (migración 02) | cualquier canal de escritura, no solo la app |
| Roles y permisos | Trigger `fn_audit` (`asignar_rol`/`actualizar`) | idem |
| `app_config` | Trigger `fn_audit` (`config_cambio`) | idem |
| Lista de compras | Trigger `fn_audit` | idem |
| Movimientos / anulaciones | Las RPC `registrar_movimiento` / `anular_movimiento` escriben su fila en la MISMA transacción | no hay forma atomica sin esa fila |
| Login, logout, cambio de contraseña | `logAudit` (RPC `log_audit`, migración 13) desde las acciones de auth | la BD no ve eventos de Supabase Auth |

Garantías de la bitácora en sí:

- `audit_logs` no tiene policies de INSERT/UPDATE/DELETE para `authenticated`;
  la única escritura desde la app es por la RPC `log_audit` (security definer),
  que fija `actor_id`/`actor_email` desde la sesión: un cliente no puede firmar
  por otro usuario ni editar su historial.
- La bitácora es puramente append-only: la revocacion general de la migración
  04 impide cualquier borrado por la capa app.
- El actor de un login fallido queda NULL (aún no hay sesión): es un intento,
  no una sesión.

## Hardening adicional (verificado con la revisión)

- Mensajes de API: las Server Actions siempre responden con mensajes fijos y
  código genérico (`validacion`, `regla_negocio`, `sin_permiso`); el mensaje
  crudo de PostgREST/SQL queda solo en `console.error` del servidor.
- CSP con nonce por petición (ADR-008); en desarrollo se tolera `unsafe-eval`
  para el overlay de Next, en producción no.
- Rate limiting del login: Postgres-RPC + fallback en memoria (Fase 2).
- `isSafeRedirect` evita redirecciones abiertas tras el login.

## Lo que esta revisión NO cubre

No es sustituto de `supabase db reset` ni de una sesión de pruebas E2E. Los
controles automáticos verifican que el código ESTÁ ahí (RLS, guards, Zod,
cabeceras), no que la base de datos remota los tenga migrados: eso requiere
aplicar las migraciones y ejecutar el checklist de cada fase del README.
