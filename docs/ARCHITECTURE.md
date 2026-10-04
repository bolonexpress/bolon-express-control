# Arquitectura — BOLÓN EXPRESS · Control Interno de Inventario

> Documento normativo. Cualquier decisión que contradiga este documento debe
> documentarse en `docs/DECISIONES.md` antes de implementarse.

## 1. Objetivo y principios

App web **privada** (sin registro público) para centralizar:

1. Catálogo de productos (cantidad y/o peso).
2. Movimientos de inventario **con foto** y motivo obligatorio.
3. Lista de compras con trazabilidad completa.
4. Control de acceso por rol y auditoría de acciones críticas.

Principios, en orden de prioridad:

| # | Principio | Implicación técnica |
|---|-----------|--------------------|
| 1 | Seguridad | RLS estricto en todas las tablas, sin `service_role` en el cliente, storage privado, doble validación (Zod + SQL) |
| 2 | Rapidez móvil | Server Actions, HTML-first, imágenes optimizadas, sin JS pesado obligatorio |
| 3 | Datos reales | Cero datos mockeados. Sin acceso a DB ⇒ la pantalla no existe |

## 2. Stack

| Capa | Tecnología | Nota |
|------|-----------|------|
| Framework | Next.js 15 (App Router) + React Server Components | Hosting: Vercel |
| Acciones | Server Actions (`'use server'`) | Única vía de escritura desde la UI |
| Base de datos | Supabase Postgres 15+ | URL de conexión directa solo para migraciones |
| Auth | Supabase Auth (email + password) | Sin OAuth, sin signup público |
| Storage | Supabase Storage (bucket privado) | `movement-photos` |
| Validación | Zod (servidor) + constraints/RPC (base de datos) | "Doble validación" |
| Tipos | TypeScript estricto + `types/database.ts` | Generado desde el esquema |
| Deploy | Vercel (preview por rama, main = producción) | Migraciones aplicadas antes del deploy |

**Prohibido**: `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` en cualquier variable
pública; `createBrowserClient` con la anon key para operaciones de escritura
(no existe: RLS lo impide, pero tampoco debe intentarse).

## 3. Estructura del proyecto

```
/app                     # rutas, Server Components, Server Actions por dominio
  /(auth)/login          # acceso privado
  /(app)/                # shell autenticado (layout exige sesión)
    dashboard/           # alertas de stock, últimos movimientos
    productos/           # catálogo CRUD
    categorias/          # jerarquía del catálogo
    unidades/            # factores de conversión
    inventario/          # stock calculado, solo lectura (Fase 5)
    compras/             # lista de compras en tiempo real + historial
    historial/           # libro con filtros y paginación keyset (Fase 7)
    admin/auditoria/     # panel de auditoría (audit:read)
    movimientos/         # libro de movimientos + detalle + anulación
      entrada/           # rutas fijas, no [tipo] (ver ADR-011)
      salida/
      ajuste/
      [id]/              # detalle del movimiento
    compras/             # lista de compras
    administracion/      # usuarios, roles, config, auditoría
  /api/                  # solo webhooks/rutas auxiliares (nada de negocio)
/components              # UI reutilizable; 'use client' solo si hay interacción
  /ui                    # sistema de diseño (Fase 9): Button, Card, Field, PageHeader,
                         # Dialog, HelpButton, BarraPasos, EstadoVacio, Toaster, BrandLogo.
                         # Tokens de marca en app/globals.css, explicados en GUIA-ESTILO.md
  /tables                # tablas con paginación server-side
  /movements, /products, /shopping
/lib                     # código puro compartido (cliente + servidor)
  /supabase              # clientes browser/server/admin
  /validation            # esquemas Zod por dominio
  /format                # moneda, peso kg↔lb, display_id
  /tours.ts              # contenido del onboarding (modal + /bienvenida)
  /constants
/server                  # SOLO servidor: acciones, repositorios, authz
  /actions               # Server Actions (uno por dominio)
  /repositories          # acceso a datos encapsulado (nada de SQL en componentes)
  /auth                  # guards: requireUser, requirePermission
  /lib                   # logAudit: unica via app -> audit_logs (Fase 8)
  /services              # lógica de negocio (transacciones, idempotencia)
/types
  database.ts            # tipos del esquema (generado)
  domain.ts              # enums, DTOs, labels
/supabase
  /migrations            # SQL versionado (esta fase)
  /seed.sql
/docs
  ARCHITECTURE.md        # este documento
  DECISIONES.md          # registro de decisiones (ADR)
  GUIA-ESTILO.md         # tokens de marca, tipografía, componentes (Fase 9)
```

Regla dura: **los componentes no hacen consultas a Supabase**. Piden datos a
`server/repositories` y(Client) no ve credenciales.

## 4. Modelo de datos (resumen)

| Tabla | Rol | Mutable |
|-------|-----|---------|
| `profiles` | Extensión de `auth.users` (nombre, `is_active`, `force_password_change`) | Sí |
| `roles` / `role_permissions` / `permissions` / `user_roles` | RBAC dinámico | Sí (solo `users:manage`) |
| `units` / `categories` / `products` | Catálogo base | Sí |
| `movements` | Libro de movimientos **inmutable** (append-only) | No |
| `movement_anulations` | Anulación lógica (borrado lógico) de un movimiento | No |
| `photos` | Evidencia fotográfica ligada a un movimiento | No (borrado físico = borrado lógico de la fila + archivo) |
| `shopping_list` / `shopping_list_history` | Lista de compras + trazabilidad | Sí / No |
| `audit_logs` | Bitácora inmutable de acciones críticas | No |
| `app_config` | Configuración global clave-valor (`jsonb`) | Sí |

### 4.1 Decisiones de modelado

1. **Peso interno siempre en KG.** `movements.peso_kg` y
   `products.stock_minimo` están en kilogramos. Las libras existen **solo** para
   presentación: conversión en `lib/format/weight.ts` con factor
   `app_config.weight_lb_to_kg` (0.45359237). Nunca se almacena ni se compara
   en libras.
2. **Doble identidad.** `id uuid` (interno, referencial) + `display_id`
   (serial legible) + `codigo` generado (`#000152`). El usuario ve `#000152`;
   la base y la app internamente usan UUID.
3. **Stock calculado, sin columna.** No existe `products.stock`. El stock es
   `sum(movements.delta_cantidad / delta_peso_kg)` de los movimientos **no
   anulados**, expuesto en la vista `v_stock_productos`. Cada escritura pasa por
   `registrar_movimiento()`, que bloquea la fila del producto
   (`SELECT ... FOR UPDATE`) para serializar y validar stock no negativo dentro
   de la misma transacción.
4. **Immutabilidad por trigger.** `movements`, `movement_anulations` y
   `audit_logs` rechazan `UPDATE`/`DELETE` a nivel de motor
   (`fn_prevent_mutation()`), no solo por RLS. "Corregir" un movimiento =
   anular + registrar uno nuevo.
5. **Idempotencia.** `movements.idempotency_key` es `UNIQUE`. Reintentos de
   red o doble toque en móvil devuelven el movimiento original en lugar de
   duplicar. La clave la genera el cliente (UUID) y el servidor la valida.
6. **Motivo obligatorio** en todo movimiento y en toda anulación.
7. **Fotos ligadas al movimiento, no al producto.** Cada foto vive en
   `movement-photos/<movement_id>/<uuid>.<ext>`, bucket privado. La fila `photos`
   referencia el movimiento; la RLS de `storage.objects` valida que el
   `movement_id` exista y no esté anulado.
8. **Usuario no se elimina, se desactiva.** Las FKs `created_by ... ON DELETE
   RESTRICT` impiden borrar historial. `profiles.is_active` bloquea el acceso
   (todas las políticas exigen usuario activo).
9. **Cambio de contraseña forzado.** `profiles.force_password_change` +
  iddleware que obliga a pasar por `/cambiar-password` antes de usar la app.

## 5. Seguridad

### 5.1 Capas

```
1. Edge/middleware      → sin sesión válida, redirect a /login
2. Guard de Server Action → requireUser() + requirePermission('dominio:permiso')
3. Zod (capa servidor)    → formas: tipo, rangos, longitudes, .strict()
4. RPC de Postgres       → valida permiso, estado, stock e idempotencia
5. RLS                   → última línea: filtra filas por usuario/rol
6. Storage policies      → bucket privado, paths atados a movimientos visibles
```

### 5.2 RBAC

- `permissions` es el catálogo de permisos (`dominio:accion`, ej. `movements:anular`).
- `role_permissions` asigna permisos a roles; `user_roles` asigna roles a usuarios.
- Cambiar permisos de un rol surte efecto **inmediato** (sin redeploy).
- El rol `admin` tiene acceso total por diseño (`has_permission()` lo
  contempla) y es el único que puede modificar RBAC y `app_config`.
- Orden de roles por defecto: `admin` > `supervisor` > `operador` > `consulta`.

### 5.3 Datos sensibles

- `audit_logs.ip_address` y `user_agent` se capturan de `request.headers` en el
  trigger (no confían en el cliente).
- Nada de secretos en `app_config`: valores `is_public = false` son de
  configuración interna; los secretos reales (API keys) viven en Supabase Vault
  o en variables de entorno de Vercel.
- `audit_logs` no se actualiza ni se borra, ni siquiera por `service_role`
  (salvo emergencia controlada en SQL manual, documentada).

### 5.4 Privilegios por defecto

Supabase otorga a `anon` y `authenticated` **todos** los privilegios por defecto
sobre los objetos nuevos de `public`. La migracion 04 aplica
`alter default privileges ... revoke all` para que ninguna tabla, secuencia o
funcion futura los herede. Toda migracion nueva debe respetar esa politica y
repetir el `revoke` explicito si crea objetos.

## 6. Flujos críticos

### 6.1 Registrar movimiento

```
UI (producto + cantidad/peso + motivo + foto)
      │
      ▼
   Server Action ──▶ RBAC (movements:write) ──▶ Zod (.strict())
      │                                              │
      │                                     movementId + idempotencyKey
      ▼                                              ▼
   RPC registrar_movimiento() ◀───────────────────────┘
     · requirePermission('movements:write')
     · idempotencia (UNIQUE): reintento devuelve el movimiento original
     · SELECT ... FOR UPDATE (producto): serializa concurrencia
     · valida modo de control, unidad base y stock >= 0
     · exige foto si require_movement_photo
     · INSERT movements (delta_*) + audit_logs
      │
      ▼
   ¿hay foto? ──▶ Storage (movement-photos/<id>/<key>.<ext>) + INSERT photos
      │
      ▼
   revalidatePath() → stock y libro actualizados
```

La foto se sube **después** de crear el movimiento: la policy
`movement_photos_insert` exige que el path apunte a un movimiento existente y no
anulado, así que un path temporal sería imposible de insertar y, de todos modos,
un reintento podría adjuntarla a una anulación ya hecha. El precio es que un
fallo de subida deja el movimiento registrado sin foto; la acción lo reporta en
lugar de ocultarlo. El `<key>` del path es la clave de idempotencia del
formulario, de modo que un doble toque reescribe el mismo objeto en vez de crear
una segunda foto (ver ADR-011).

### 6.2 Anular movimiento

`anular_movimiento()` valida que la anulación no deje stock negativo, guarda un
`snapshot` del movimiento y, si era parte de una transferencia, anula
automáticamente la pata gemela (`related_movement_id`).

### 6.3 Lista de compras

Estados: `pendiente → en_proceso → comprado | descartado`. Cada cambio de estado
y de cantidad escribe en `shopping_list_history` (inmutable) con `snapshot`
completo. Los ítems generados por alerta de stock mínimo se marcan
`auto_generated = true` y enlazan el producto que los originó.

## 7. Convenciones de código

- Idioma: TypeScript `strict`; sin `any` implícitos.
- Nombres: tablas y columnas en `snake_case` (Postgres), TS en `camelCase`
  vía `camelCase` de `database.types.ts` generado.
- Valores de enum: `lowercase` en español/inglés corto, sin acentos ni mayúsculas.
- Fechas: `timestamptz` en UTC; se formatea en `America/Guayaquil` en la capa de
  presentación.
- Dinero: `numeric(14,4)`, nunca `float`.
- Cantidades/pesos: `numeric(14,3)`.
- Toda Server Action devuelve un `ActionResult<T>` uniforme:
  `{ ok: true, data } | { ok: false, error: { code, message, fields? } }`.
- Nada de `try/catch` silenciosos: los errores se loguean en servidor con
  contexto y se devuelven códigos cerrados al cliente.
- Tests: unitarios de reglas de stock y Zod; de integración sobre Postgres local
  (RLS incluido) antes de cada release.

## 8. Rendimiento móvil

- Server Components por defecto; `"use client"` solo en islands interactivos.
- Listas con paginación por cursor y `select` explícito de columnas (nunca `*`).
- Fotos: `next/image` con `width/height`, cuadrícula diferida de 96 px, original
  solo al abrir.
- Formularios: un solo submit, `useFormStatus` para estado del botón, sin
  librerías de formularios pesadas en la ruta crítica.
- Objetivo: LCP < 2.5 s en 4G, interacción < 100 ms.

## 9. Fases

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Arquitectura + esquema SQL + RBAC + seeds | Completada |
| 2 | Scaffold Next.js, Supabase clients, auth, middleware, layout autenticado | Completada |
| 3 | Catálogo (productos, categorías, unidades) + stock calculado visible | Completada (pendiente aprobación) |
| 4 | Movimientos + fotos + anulaciones | Completada (pendiente aprobación) |
| 5 | Inventario calculado (`/inventario`, `inventory:read`) | Completada (pendiente aprobación) |
| 6 | Lista de compras + historial + realtime | Completada (pendiente aprobación) |
| 7 | Historial con filtros y paginación (`/historial`) | Completada (pendiente aprobación) |
| 8 | Auditoría y revisión de seguridad (`/admin/auditoria`, `scripts/security-audit.mjs`) | Completada (pendiente aprobación) |
| 9 | Rediseño UI/UX, accesibilidad y branding | Completada (pendiente aprobación) |
| 10 | Administración de usuarios (`/admin/usuarios`, `/nuevo`, `/[id]`, `users:manage`) | Completada (pendiente aprobación) |
| 11 | Bug de movimientos (`peso_kg` NaN), persistencia de la foto, limpieza (`/diag`, logs de debug) | Completada (pendiente aprobación) |
| 12 | Pruebas finales con datos reales (`docs/PRUEBAS-FINALES.md`) | En curso |
| 13 | Despliegue | Pendiente |

Cada fase requiere **aprobación explícita** antes de iniciar la siguiente. La
numeración sigue a `README.md` §Fases, que es el plan vigente.
