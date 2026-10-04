# BOLON EXPRESS — Control Interno de Inventario

App web privada (Next.js + Supabase + Vercel) para inventario con movimientos
fotografiados, lista de compras y control de acceso por rol.

Documento normativo: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Diseno visual: [`docs/GUIA-ESTILO.md`](docs/GUIA-ESTILO.md).

## ⚠️ ANTES DE PROBAR EL LOGIN — LEER PRIMERO

> ### ⚠️ EJECUTAR MIGRACIÓN 13 EN SUPABASE SQL EDITOR ANTES DE PROBAR LOGIN
>
> Sin la migracion 13 la funcion `public.log_audit` **no existe** y el login
> falla en la consola con `Could not find the function public.log_audit`.
>
> 1. Abre **Supabase → SQL Editor → New query**.
> 2. Pega **integro** el contenido de
>    [`supabase/migrations/20260101001200_13_auditoria.sql`](supabase/migrations/20260101001200_13_auditoria.sql)
>    (62 lineas, solo `create or replace function` + `comment` + `grant`).
> 3. Ejecuta. Es **idempotente**: puedes pegarlo varias veces sin error.
> 4. Confirma que responde:
>
> ```sql
> select proname, prosecdef
> from pg_proc
> where pronamespace = 'public'::regnamespace
>   and proname = 'log_audit';
> --  proname  | prosecdef
> --  log_audit| t
> ```
>
> Si no devuelve la fila, la migracion no se aplico.
>
> El login **no** se cae por esto: `logAudit()` nunca lanza (atrapa el error y
> solo lo escribe en consola). Lo que si se rompe es la bitacora de
> login/logout/cambio de contrasena en `/admin/auditoria`.

### Memoria insuficiente al arrancar (`ERR_MEMORY_ALLOCATION_FAILED`)

En equipos con **menos de 8 GB de RAM** (o sin pagefile) `next dev` puede morir
al compilar rutas pesadas. Usa el script de memoria acotada:

```bash
npm run dev:low-memory
```

Equivale a `node --max-old-space-size=512 node_modules/next/dist/bin/next dev`:
limita el heap de Node a 512 MB para que el recolector de basura trabaje antes
de que el sistema quede sin RAM.

> **Nota:** se invoca `node_modules/next/dist/bin/next` y **no**
> `node_modules/.bin/next`: ese ultimo es un script de shell POSIX
> (`#!/bin/sh`) y `node` no puede ejecutarlo en Windows. La ruta usada es
> exactamente a la que ese shim apunta.
>
> Si aun asi muere con 512 MB, sube el limite a `1024` editando el script en
> `package.json`. Cerrar procesos huerfanos de Node antes de arrancar tambien
> ayuda: en Windows, `taskkill /F /IM node.exe`.

## Las rutas `/diag` se eliminaron en la Fase 11

`/diag` (sesion) y `/diag/permisos` (permisos) eran pantallas de diagnostico que
existan fuera del middleware. Se borraron junto con su excepcion en el `matcher`
de `middleware.ts`: eran un riesgo de despliegue (vease abajo) y ya cumplieron su
papel.

El diagnostico de sesion que hacian se resuelve hoy asi:

- **Cookie de sesion ausente o caducada** → se limpia desde el navegador con
  `Cookies > localhost > borrar el dominio`. Si persiste, mira el dominio y el
  path de las cookies `sb-*`.
- **`permission denied for table user_roles`** → ver la seccion siguiente.
- **Login que entra y sale** → `profiles` o `user_roles` ilegibles; sin la ruta
  `/diag` el sintoma se diagnostica con `/no-autorizado` y la consola del
  servidor, que ahora registra el motivo (ver ADR-018).

Dos cosas de `/diag` que siguen siendo verdad y conviene no olvidar:

> **`admin` tiene acceso total por diseno**: `contextHasPermission()` devuelve
> `true` para cualquier permiso si `roleKeys` incluye `admin`, sin mirar el array
> `permissions`. Que `role_permissions` este vacio para `admin` NO impide entrar a
> la app, pero si rompe las policies de la base (`has_permission()`).

> ### ⚠️ `NODE_ENV` no debe estar en `.env.local`
>
> Si tu `.env.local` tiene `NODE_ENV=development` fijado a mano, **borralo**.
> Next.js ya lo deduce del comando (`next dev` → `development`, `next build` /
> `next start` → `production`). Ese valor era el unico guard que protegia `/diag`,
> asi que en produccion la ruta exponia nombre, correo y telefono de todos los
> usuarios de `profiles`. Con `/diag` borrada el riesgo desaparece, pero la linea
> sigue sobrando en `.env.local`.

### ⚠️ `user_roles` necesita GRANT de SELECT (bug corregido en la migracion 04)

La migracion 04 revocaba todo y despues re-concedia SELECT a una lista de
tablas en la que **`user_roles` se habia quedado fuera** (solo recibio
`insert, update, delete`). Postgres comprueba el privilegio de tabla **antes**
de evaluar la RLS, asi que la policy `user_roles_select` nunca llegaba a correr
y la consulta fallaba con:

```
42501 permission denied for table user_roles
hint: Grant the required privileges to the current role with:
      GRANT SELECT ON public.user_roles TO authenticated;
```

Como `getAuthContext()` lee esa tabla, devolvia `null` y **todas** las paginas
redirigian a `/login`: el login parecia funcionar pero nunca se entraba. Si tu
base ya tiene las migraciones aplicadas, pega esto en el SQL Editor:

```sql
grant select on public.user_roles to authenticated;
```

## Estado

**Fase 1 — Arquitectura y esquema de base de datos: completada.**
**Fase 2 — Autenticacion, usuarios, roles y permisos: completada.**
**Fase 3 — Catalogo de productos, categorias y unidades: completada (pendiente aprobacion).**
**Fase 4 — Movimientos de stock con foto y anulaciones: completada (pendiente aprobacion).**
**Fase 5 — Inventario calculado (stock solo lectura): completada (pendiente aprobacion).**
**Fase 6 — Lista de compras en tiempo real: completada (pendiente aprobacion).**
**Fase 7 — Historial con filtros y paginacion: completada (pendiente aprobacion).**
**Fase 8 — Auditoria y revision de seguridad: completada (pendiente aprobacion).**
**Fase 9 — Rediseño UI/UX, accesibilidad y branding: completada; los tres pendientes (segunda pasada de colores, toasts de éxito y botón «?» en las 11 pantallas restantes) cerrados. Pendiente de tu aprobación.**

Las siguientes fases requieren aprobacion explicita antes de empezar.

## Estructura actual

```
docs/ARCHITECTURE.md                    arquitectura, seguridad, convenciones
docs/DECISIONES.md                      registro de decisiones (ADR-001..ADR-015)
docs/GUIA-ESTILO.md                     tokens de marca, tipografia, componentes (Fase 9)
supabase/migrations/                    esquema, RBAC, RLS, storage, seed, invariantes
types/database.ts                       tipos del esquema
types/domain.ts                         enums, etiquetas, permisos, DTOs
middleware.ts                           proteccion global de rutas + CSP con nonce
next.config.ts                          cabeceras de seguridad + limite del cuerpo de las Server Actions
lib/supabase/                           clientes: server (anon+sesion), client, admin (service_role)
lib/security/headers.ts                 CSP por peticion
lib/rate-limit/login.ts                 limite de intentos de login (Postgres + memoria)
lib/validation/                         esquemas Zod por dominio (auth.ts, catalog.ts, movements.ts)
lib/format/units.ts                     conversion a unidad base + formato de cantidades
lib/tours.ts                            contenido del onboarding (modal + /bienvenida)
server/actions/                         Server Actions (auth.ts, users.ts, catalog.ts, movements.ts)
server/auth/guards.ts                   RBAC server-side: getAuthContext/requirePermission/requirePagePermission
server/repositories/                    acceso a datos (catalog.ts, movements.ts, users.ts)
server/services/catalog.ts              reglas de negocio del catalogo (base unica, ciclos, conversion)
scripts/seed-admin.mjs                  crea el primer admin (solo service_role)
public/assets/logo.png                  logo de marca (fuente de verdad visual)
app/                                    rutas: (auth) login y cambio de clave, (app) shell autenticado
  globals.css                           tokens de marca (@theme): color, tipografia, espaciado, radios, sombras
  icon.png                              favicon generado desde el logo
  (app)/page.tsx                        inicio: 3 acciones primarias gigantes + modulos secundarios
  (app)/bienvenida                      el recorrido del circuito, en formato lectura
  (app)/productos|categorias|unidades   catalogo CRUD (listado, nuevo, editar)
  (app)/movimientos                     libro de movimientos (filtros, detalle, anulacion)
  (app)/movimientos/entrada|salida|ajuste  asistente de 3 pasos con foto y resumen
  (app)/inventario                      stock calculado, solo lectura, estado OK/Bajo/Critico
  (app)/compras                         lista de compras en tiempo real (agregar, estados, historial)
  (app)/historial                       libro de movimientos con filtros y paginacion keyset
  (app)/admin/usuarios                  personas: listado con filtros, alta y ficha (users:manage)
  (app)/admin/usuarios/nuevo            alta: correo, nombre, telefono y rol -> clave temporal
  (app)/admin/usuarios/[id]             ficha: datos, rol, activar/desactivar y reset de clave
  (app)/admin/auditoria                 panel de auditoria con filtros y antes/despues (audit:read)
components/ui/                          sistema de diseno: BrandLogo, Button, Card, Field, Checkbox,
                                         PageHeader, Dialog, HelpButton, BarraPasos, EstadoVacio, Aviso,
                                         Toaster, ToastProvider, UserMenu, SubmitButton, ToggleActiveButton
components/onboarding/tour.tsx           modal del primer ingreso + "Ver tour de nuevo"
components/catalog/                     formularios y tablas del catalogo (mobile-first)
components/movements/                   asistente de captura, selector de producto, foto y anulacion
components/inventory/                   tabla/tarjetas del inventario (solo lectura)
components/shopping/                    tablero de compras, formulario rapido, botones de estado, realtime
components/history/                     barra de filtros, tarjetas/tabla y "Cargar mas" del historial
components/audit/                       panel, filtros y diff antes-despues de la bitacora
components/users/                      listado con filtros y paginacion keyset, alta, ficha,
                                         roles, activar/desactivar y reset de clave
docs/PRUEBAS-FINALES.md                protocolo de la Fase 12: 67 pasos para PC y celular,
                                         resultados runtime y plan de volumen
scripts/seed-admin.mjs                  crea el primer admin (solo service_role)
scripts/security-audit.mjs              revision estatica de seguridad (Fase 8)
scripts/storage-check.mjs               prueba de las policies del bucket de fotos
                                         (token real + cliente de sesion, ADR-019)
```

## Decisiones de fase 1 (resumen)

| Decision | Implementacion |
|----------|----------------|
| Peso interno siempre KG | `movements.peso_kg`, `products.stock_minimo`; factor en `app_config.weight_lb_to_kg` |
| Libras solo visual | unidad `lb` existe para presentacion; nunca se almacena ni compara |
| UUID + ID legible | `id uuid` + `display_id` identity + `codigo` generado (`#000152`) |
| Stock sin columna | vista `v_stock_productos` = `sum(movements.delta_*)` de movimientos no anulados |
| Escritura atomica | RPC `registrar_movimiento()` con `SELECT ... FOR UPDATE` sobre el producto |
| Corregir no es borrar | `movements` es inmutable (trigger); se anula y se registra de nuevo |
| Idempotencia | `movements.idempotency_key` UNIQUE, clave enviada por el cliente |
| RBAC dinamico | `permissions` + `roles` + `role_permissions` + `user_roles`, sin redeploy |
| Fotos privadas | bucket `movement-photos`, path atado al `movement_id`; el objeto va sin el bucket y `photos.path` con el (`lib/storage/foto-paths.ts`, ADR-019) |
| Usuario no se borra | `profiles.is_active`; FKs `ON DELETE RESTRICT` protegen el historial |

## Migraciones

| Archivo | Contenido |
|---------|-----------|
| `20260101000000_01_schema_base.sql` | enums, tablas, indices, constraints, RBAC base |
| `20260101000100_02_functions_security.sql` | helpers de sesion/RBAC, triggers de inmutabilidad, auditoria, alta de usuario |
| `20260101000200_03_stock_rpc_views.sql` | `registrar_movimiento`, `anular_movimiento`, vistas de lectura |
| `20260101000300_04_rls_grants.sql` | RLS en todas las tablas + grants minimos |
| `20260101000400_05_storage.sql` | bucket privado + policies de `storage.objects` |
| `20260101000500_06_seed_base.sql` | unidades, categorias, `app_config` |
| `20260101000600_07_auth_security.sql` | `force_password_change` propio, `is_service_role()`, tabla y RPC del rate limiting de login |
| `20260101000700_08_catalog_invariants.sql` | invariantes del catalogo: una unidad base activa por tipo, factor 1 en la base, categoria no autopadre |
| `20260101000800_09_movimientos.sql` | motivos de ajuste, `require_movement_photo = true`, stock >= 0 tambien en modo `ambos` |
| `20260101000900_10_inventario.sql` | permiso `inventory:read` + grants a los cuatro roles + indice de `movement_anulations(movement_id)` |
| `20260101001000_11_compras_realtime.sql` | publica `shopping_list`/`shopping_list_history` en realtime + trigger de transiciones de estado |
| `20260101001100_12_historial.sql` | permiso `history:read` + grants a los cuatro roles |
| `20260101001200_13_auditoria.sql` | RPC `log_audit` (unica via de escritura de `audit_logs` desde la app) |
| `20260101001300_14_storage_policies_fix.sql` | `movement_id_de_foto()` + policies de `movement-photos` alineadas con la ruta real del objeto (ADR-019) |

Requisito: PostgreSQL 15+ (las vistas usan `security_invoker`).

### Aplicar

```bash
# Local (requiere Docker)
supabase start
supabase db reset            # aplica migraciones + seed en orden

# Remoto
supabase link --project-ref <ref>
supabase db push
```

SQL Editor de Supabase: ejecutar los archivos 01 a 14 en orden lexicografico.
Las migraciones 09 a 14 son **aditivas** y se pueden aplicar sobre una base que
ya tenga 01-08: no alteran datos previos.

> La 14 **no es el arreglo** de la foto que no subia (eso fue el path en el
> codigo, ADR-019): centraliza la regla del nombre del objeto en
> `movement_id_de_foto()` para que las tres policies no dependan de repetir el
> calculo de `storage.foldername()`. Es idempotente y se puede aplicar antes de
> volver a probar la app.

### Primer usuario (admin)

Con las migraciones aplicadas y `.env.local` completo (`ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_FULL_NAME`):

```bash
npm run seed:admin
```

El script usa solo `SUPABASE_SERVICE_ROLE_KEY`, crea el usuario con correo
confirmado, fija `force_password_change = true` (el admin debera definirla en su
primer ingreso, via `/cambiar-password`) y le asigna el rol `admin` (quitandole
el `operador` que el trigger asigna por defecto). Es idempotente: si el usuario
ya existe, verifica el estado sin tocar su contrasena.

El alta posterior de usuarios se hace desde la pantalla de administracion
(Fase 6). No hay signup publico: la app solo tiene pantalla de login.

## Verificacion de la fase 1

Checklist a ejecutar sobre `supabase db reset` (o tras `db push`):

- [ ] `select * from public.v_stock_productos limit 5;` responde sin error.
- [ ] Un usuario `operador` **no** puede `insert` en `movements`:
      `insert into movements (...) values (...)` -> `permission denied`.
- [ ] Un usuario `operador` **no** puede `update` ni `delete` en `movements`:
      bloqueado por trigger `TABLA_INMUTABLE`.
- [ ] `update public.audit_logs set accion = 'crear' where id = 1;` -> error.
- [ ] `registrar_movimiento()` con salida mayor al stock -> `STOCK_INSUFICIENTE`.
- [ ] `registrar_movimiento()` dos veces con la misma `idempotency_key` -> un solo movimiento.
- [ ] Anular un movimiento deja de impactar el stock y guarda `snapshot`.
- [ ] Un usuario inactivo (`is_active = false`) no lee nada (politicas usan `is_active_user()`).
- [ ] Un usuario sin `users:manage` no puede cambiar `is_active` de otro perfil.
- [ ] Un archivo subido a `movement-photos/<uuid-inexistente>/x.jpg` -> bloqueado por policy.
- [ ] `select has_permission('users:manage')` cambia al editar `role_permissions`.

```sql
-- Comprobaciones rapidas de integridad del modelo
select count(*) as productos from products;
select codigo, producto, stock_principal, bajo_minimo from v_stock_productos order by bajo_minimo desc;
select * from v_movimientos order by created_at desc limit 20;
```

## Fases

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Arquitectura + esquema SQL + RBAC + seeds | Completada |
| 2 | Scaffold Next.js, clientes Supabase, auth, middleware | Completada |
| 3 | Catalogo de productos, categorias y unidades + stock visible | Completada (pendiente aprobacion) |
| 4 | Movimientos con foto y anulaciones | Completada (pendiente aprobacion) |
| 5 | Inventario calculado automaticamente (vista, `/inventario`, `inventory:read`) | Completada (pendiente aprobacion) |
| 6 | Lista de compras con historial + realtime | Completada (pendiente aprobacion) |
| 7 | Historial con filtros y paginacion (`/historial`, `history:read`) | Completada (pendiente aprobacion) |
| 8 | Auditoria y revision de seguridad (`/admin/auditoria`, `audit:read`) | Completada (pendiente aprobacion) |
| 9 | Rediseño UI/UX, accesibilidad y branding (tokens del logo, inicio simplificado, flujos guiados, onboarding) | Completada, con los 3 pendientes cerrados (pendiente aprobacion) |
| 10 | Administracion de usuarios (`/admin/usuarios`, `users:manage`): listado, alta, roles, activar/desactivar y reset de clave | Completada (pendiente aprobacion) |
| 11 | Bug de movimientos (`peso_kg` NaN), foto que sobrevive al reenvio, borrado de `/diag`, limpieza de logs de debug, checklist | Completada (pendiente aprobacion) |
| 12 | Pruebas finales con datos reales (`docs/PRUEBAS-FINALES.md`) | En curso: guion listo, a la espera de ejecutarlo |
| 13 | Despliegue: variables documentadas, `supabase db push`, primer arranque y verificacion en produccion | Pendiente |

## Verificacion de la fase 3

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-08 aplicadas:

- [ ] Un usuario `consulta` entra a `/productos` pero no ve "Nuevo producto" ni los botones de activar/desactivar.
- [ ] Un usuario `consulta` que invoque `saveProductAction` recibe `sin_permiso` y **no** se escribe nada.
- [ ] Crear la unidad `oz` con factor `0.028349523125` y tipo peso: aparece en la tabla como `1 oz = 0.02834952 kg`.
- [ ] Marcar `oz` como unidad base con factor distinto de 1: el servidor lo rechaza (`units_base_factor_uno` lo rechaza tambien en SQL).
- [ ] Marcar una segunda unidad peso como base: el servidor la rechaza por conflicto con la base activa.
- [ ] Producto con modo `peso` y unidad `u`: el servidor lo rechaza con "El control por peso exige una unidad de tipo Peso".
- [ ] Producto con modo `peso` y unidad `lb`, stock minimo `10`:
      `select stock_minimo from products where sku = '...'` devuelve `4.536` (10 lb redondeadas a kg, 3 decimales).
- [ ] Producto con modo `cantidad` y unidad `u`, stock minimo `10`: se guarda `10` (la unidad base de `u` es factor 1). Con una unidad de conversion, p. ej. `caja` -> factor `12`, el minimo `10` se guarda como `120` en unidades base (ADR-011).
- [ ] Editar ese producto sin tocar el stock minimo no altera el valor guardado (la conversion se deshace al abrir el formulario).
- [ ] Editar una categoria y elegirla como su propia superior: la opcion no aparece y el servidor la rechaza.
- [ ] `update categories set parent_id = id where id = <uuid>` -> error `categories_no_autopadre`.
- [ ] Crear dos unidades base activas del mismo tipo por SQL directo -> `23505` (indice `units_base_unica_por_tipo`).
- [ ] Desactivar un producto: desaparece del conteo de su categoria y sigue visible (inactivo) en `/productos`, con "Reactivar".
- [ ] `/productos` y `/unidades` se ven en < 375 px sin scroll horizontal (una tarjeta por registro).

## Verificacion de la fase 4

Fuera de alcance en esta fase: la paginacion server-side con cursor del libro de
movimientos (ARCHITECTURE.md §8 pide `components/tables`; hoy el listado devuelve
los 100 mas recientes y muestra el conteo), la exportacion CSV (`movements:export`),
el visor de fotos con URL firmada —el detalle muestra el conteo, y la foto
original se abre en una fase posterior— y las alertas de stock minimo (Fase 7).

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-09 aplicadas:

- [ ] `consulta` entra a `/movimientos`, ve el libro y **no** ve los botones de entrada, salida ni ajuste.
- [ ] `operador` registra entradas, salidas y ajustes, pero en el detalle de un movimiento **no** aparece la anulacion (`movements:anular` es de `supervisor` y `admin`).
- [ ] Un `operador` que invoque `anularMovimientoAction` recibe `sin_permiso` y el movimiento sigue sin anular.
- [ ] Entrada de 5 kg de un producto en modo `peso`: `select peso_kg, delta_cantidad, delta_peso_kg, cantidad_original from movements order by created_at desc limit 1` devuelve `5.000`, `NULL`, `5.000`, `5.000`.
- [ ] Salida de 2 lb de un producto en modo `peso` (factor `0.45359237`): `peso_kg` = `0.907`, `delta_peso_kg` = `-0.907`, `cantidad_original` = `2` (lo que escribio el usuario, sin convertir).
- [ ] Entrada de una cantidad en modo `cantidad` con unidad de conversion: `cantidad` va en unidad base y `cantidad_original` conserva lo capturado.
- [ ] Salida que deja el stock por debajo de cero: la RPC responde `STOCK_INSUFICIENTE` y no se inserta nada.
- [ ] Salida que lleva el peso a negativo en un producto en modo `ambos`: tambien se rechaza (fue el fallo que corrigio la migracion 09).
- [ ] Registrar sin motivo: la accion devuelve `MOTIVO_REQUERIDO` (el select de motivos no incluye "sin motivo").
- [ ] Registrar sin foto con `require_movement_photo = true`: la RPC responde `FOTO_REQUERIDA`.
- [ ] Doble toque en "Registrar": un solo movimiento. La segunda peticion devuelve el mismo `movement_id` y no duplica la foto (`photos` tiene una fila y un solo objeto en storage).
- [ ] Salida sin motivo valido -> validacion Zod en el formulario antes de tocar la red.
- [ ] Ajuste que fija el stock a un valor exacto (cantidad positiva o negativa): `delta_cantidad` con signo y el stock resultante coincide con el ajuste.
- [ ] Anulacion de un movimiento: desaparece del libro y del stock (`v_stock_productos`), y en `/movimientos/[id]` consta motivo, snapshot y responsable.
- [ ] Anulacion de la pata de una transferencia: anula tambien la gemela.
- [ ] Foto adjunta: el detalle muestra el conteo, y el objeto existe en el bucket con path `movement-photos/<movement_id>/<idempotency_key>.<ext>`.
- [ ] `/movimientos` y `/movimientos/entrada` se ven en < 375 px sin scroll horizontal.
- [ ] `/audit_logs` (o `select * from audit_logs order by created_at desc limit 5`) registra `crear` y `anular` con el stock resultante.

## Verificacion de la fase 5

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-10 aplicadas:

- [ ] Rol `consulta` entra a `/inventario`, ve las tarjetas/tabla y NO ve ninguna forma de editar el stock.
- [ ] Un usuario activo sin rol (o un rol al que se le quite `inventory:read` desde la Fase 6) es redirigido a `/no-autorizado`.
- [ ] Producto con stock > minimo muestra "OK"; con 0 < stock < minimo muestra "⚠️ Inventario bajo" y estado "Bajo"; con stock <= 0 muestra "⛔" y estado "Critico". El orden de la lista es: criticos, bajos, ok.
- [ ] El filtro "Bajo minimo" muestra solo criticos + bajos; "En nivel" solo los ok.
- [ ] Registrar una entrada eleva el stock en `/inventario` tras el revalidate.
- [ ] Anular ese movimiento devuelve el stock a su valor anterior (la vista excluye anulados).
- [ ] No existe forma de editar el stock directamente: no hay formulario en `/inventario` y `products` no tiene columna de stock (un `update products set stock...` fallaria por columna inexistente).
- [ ] `select * from v_stock_productos` es indistinguible de la suma manual de `delta_cantidad`/`delta_peso_kg` no anulados (store-check de la optimizacion: el plan usa `movements_product_created_idx` y `movement_anulations_movement_idx`).
- [ ] `/inventario` se usa en < 375 px sin scroll horizontal (tarjetas); en >= 640 px se ve la tabla.

## Verificacion de la fase 6

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-11 aplicadas:

- [ ] `consulta` entra a `/compras`, ve el tablero y NO ve el formulario ni los botones de estado. Un intento directo de `agregarPendienteAction` devuelve `sin_permiso` y no se inserta nada.
- [ ] Rol activo sin `shopping:read` es redirigido a `/no-autorizado`.
- [ ] Agregar pendiente "Del catalogo": aparece el producto con su unidad; la fila nueva es visible de inmediato.
- [ ] Agregar pendiente "Texto libre" sin producto: se crea; con ambas cosas: validacion en el formulario (Zod).
- [ ] Pendiente -> "Tomar" pasa a "En proceso"; "Descartar" de una en proceso la descarta; "Comprado" registra `completed_at`/`completed_by` (el constraint estaria roto si no).
- [ ] Pasar un "comprado" a "pendiente" falla: la accion explica la transicion y el trigger `trg_shopping_transicion` responderia igual por SQL directo.
- [ ] Dos sesiones abiertas: un cambio en una aparece en la otra sin recargar (Realtime); el punto verde indica "En vivo".
- [ ] El detalle `/compras/[id]` muestra quien creo el pendiente y quien hizo cada cambio de estado, con su fecha-hora.
- [ ] El historial se escribe solo por trigger: `select tipo_registro, estado_anterior, estado_nuevo, changed_by from shopping_list_history order by id desc`.
- [ ] `/compras` se usa en < 375 px: botones de estado grandes, secciones apiladas, sin scroll horizontal.

## Verificacion de la fase 7

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-12 aplicadas:

- [ ] Rol `consulta` entra a `/historial`, ve tarjetas/tabla y puede filtrar; NO tiene forma de anular desde aqui.
- [ ] Rol activo sin `history:read` (quitado desde la Fase 8) es redirigido a `/no-autorizado`, y `consultarHistorialAction` devuelve `sin_permiso`.
- [ ] Filtro por tipo "Entradas": solo entradas. Por responsable: solo los de esa persona (indice `movements_created_by_idx`). Por producto: solo de ese producto (`movements_product_created_idx`).
- [ ] Rango de fechas (desde/hasta en hora America/Guayaquil): limita el libro inclusivamente; fecha final anterior da el aviso amable y los filtros se limpian.
- [ ] Mas de 25 movimientos: "Cargar mas" trae la pagina siguiente sin repetir ni saltar filas (cursor `created_at|id`, orden cubierto por `movements_created_idx`).
- [ ] Los anulados aparecen tachados y con sello "Anulado"; los vigentes, con "Vigente".
- [ ] Foto: el listado muestra solo el conteo (📷), jamas la imagen; en `/movimientos/[id]` la foto aparece con su URL firmada (caduca a los 2 min: recargarla desde cero firmada otra vez).
- [ ] `history:read` sin `photos:read`: el placeholder lo dice ("existe pero tu rol no la ve"); sin permisos de lectura no llega ni la fila.
- [ ] URL con filtros manipulados (espacio u otra cosa): la pagina limpia los filtros y avisa, no revienta.
- [ ] `/historial` se usa en < 375 px: barra de filtros plegable, tarjetas, sin scroll horizontal; en >= 640 px la tabla.
- [ ] `explain select ... from v_movimientos order by created_at desc limit 26` usa el indice (no seq scan) aun con el filtro de fecha.

## Verificacion de la fase 8

Checklist a ejecutar con la app levantada (`npm run dev`) y las migraciones 01-13 aplicadas:

- [ ] `npm run audit:security` sale en verde (6 controles). Tras `next build` cubre ademas "Secretos en el bundle".
- [ ] Rol `admin` abre `/admin/auditoria`: ve filtros y el diff antes→despues de cada evento (crear/actualizar/eliminar de catálogo, RBAC, compras, y login/logout/cambio_password en "Autenticación").
- [ ] Rol NO admin queda fuera: `audit_logs_select` exige `audit:read`; ese permiso no se concede a `operador`/`supervisor`/`consulta` por defecto.
- [ ] Doble cobertura: crear un producto genera UNA fila (trigger), no dos. Lo mismo para anular un movimiento (su RPC) y cambiar un estado de compra (trigger). Ver ADR-015.
- [ ] Login exitoso: `select * from audit_logs where accion = 'login' order by created_at desc limit 1` muestra el correo y la IP; login fallido con actor NULL.
- [ ] Filtro por usuario y entidad: reduce la tabla; el rango de fechas filtra en hora de Guayaquil.
- [ ] Paginacion "Cargar mas" en la bitacora con mas de 50 eventos: sin repetir ni saltar.
- [ ] Una URL firmada de foto caduca tras 2 minutos (refresh la firma de nuevo).
- [ ] Errores de la app nunca muestran SQL/stack: el campo `error.message` al cliente siempre es un texto fijo; el detalle por consola del servidor.

## Verificacion de la fase 9

Checklist a ejecutar con la app levantada (`npm run dev`). No toca esquema ni permisos: si algo de aqui falla, el problema es de la capa UI.

### Cierres de la Fase 9

Los tres pendientes que quedaban al aprobar el diseno se cerraron sobre el codigo
existente: ninguna Server Action cambio de firma ni de contrato.

- [x] **Segunda pasada de colores.** Cero clases de la paleta cruda de Tailwind
      (`slate-*`, `gray-*`, `amber-500`, `emerald-600`) en `app/`, `components/`,
      `lib/`, `server/` y `types/`. Comprobacion reproducible en
      `docs/GUIA-ESTILO.md` §8.
- [x] **Botones de estado con tokens.** `en_proceso` usa `--color-aviso` (antes
      `amber-500`) y `comprado` usa `--color-exito` (antes `emerald-600`).
      Contraste con texto blanco **7.1:1** y **5.4:1**: los dos por encima de AA.
      Tabla completa en `docs/GUIA-ESTILO.md` §6.
- [x] **Toasts de éxito.** «Guardado correctamente» y sus variantes en los
     _catalogos_ (editar), _cambios de estado de compras_, _activar/desactivar_,
      _cambio de contrasena_ y _anular un movimiento_. Los flujos que redirigen
      pasan el aviso por `?mensaje=` cuando la redireccion ya lo admitia, y por
      `sessionStorage` solo en el cambio de contrasena. Decision justificada en
      `docs/GUIA-ESTILO.md` §6.
- [x] **Boton «?» en las 11 pantallas que faltaban**: los 9 del catalogo
      (listado, nuevo y editar de productos, categorias y unidades), mas
      `compras/[id]` y `movimientos/[id]`. Son las 20 pantallas de la app.
- [x] `npm run typecheck`, `npm run lint` y `npm run build` en verde.

### Comprobaciones manuales

Requieren la app en marcha y dedos humanos; las dejo para el repaso visual.

- [ ] `public/assets/logo.png` es el logo de marca y aparece en la barra de navegacion (sobre su panel blanco), en el login, en el onboarding, en `app/icon.png` (pestaña del navegador) y en los estados vacios.
- [ ] La paleta de `app/globals.css` coincide con el logo (verde `#006837`, verde medio `#2b8724`, lima `#85bf3f`, amarillo `#f5e721`, naranja `#ff8c1e`). Guia completa en `docs/GUIA-ESTILO.md`.
- [ ] Contraste AA: cada token de texto (`marca`, `texto`, `texto-suave`, `texto-tenue`, `exito`, `aviso`, `peligro`, `info`) pasa 4.5:1 contra el fondo donde se usa; la barra de navegacion pasa 4.5:1 en blanco.
- [ ] Base tipografica 17px y rejilla de espaciado de 8px: no hay medidas rareas ni numeros que multiplican por 4.
- [ ] Todos los botones de accion miden 48px o mas, llevan icono Y texto (ningun boton solo con icono).
- [ ] Ningun campo depende del `placeholder` para identificarse: todos tienen etiqueta visible.
- [ ] El foco por teclado se ve en todos los controles (contorno verde de 3px; blanco sobre la barra oscura) y el primer `Tab` lleva al enlace "Saltar al contenido".
- [ ] El inicio muestra las tres acciones gigantes ("Recibir mercancía", "Sacar mercancía", "Ver que queda") y debajo "Otras pantallas". Cada rol solo ve lo que su permiso permite.
- [ ] `/movimientos/entrada`, `/salida` y `/ajuste` son un asistente de 3 pasos con barra de progreso; "Continuar" no deja avanzar sin lo imprescindible y explica por que.
- [ ] El paso 3 muestra el resumen (producto, cantidad, motivo, foto) y la frase de efecto: "El inventario de X subira/bajara N".
- [ ] Si el servidor devuelve un error de campo, el formulario salta al paso que contiene ese campo.
- [ ] Tras guardar bien aparece el aviso emergente en lenguaje humano; tras un error de Storage o inesperado aparece el mensaje real, no uno generico.
- [ ] El primer ingreso abre solo el carrusel de bienvenida; "Saltar" y "Entendido" lo cierran y no vuelve a aparecer. `/bienvenida` lo muestra siempre, y "Ver tour de nuevo" esta en el menu de la cuenta.
- [ ] El boton "?" esta en cada pantalla y explica esa pantalla en 2-3 frases.
- [ ] Cada pantalla se usa en < 375px sin scroll horizontal y a 200% de zoom sin perdida de contenido.
- [ ] `prefers-reduced-motion` desactiva animaciones.

## Verificacion de la fase 10

Checklist a ejecutar con la app levantada (`npm run dev`). **No toca el esquema**:
`profiles`, `user_roles`, los permisos y el trigger de auditoria ya existen. Si
algo de aqui falla, el problema es de la capa de aplicacion.

### Cerrado por codigo

- [x] `npm run typecheck`, `npm run lint`, `npm run build` y `npm run audit:security` en verde (6/6).
- [x] Las tres rutas (`/admin/usuarios`, `/admin/usuarios/nuevo`, `/admin/usuarios/[id]`) exigiendo `users:manage` con `requirePagePermission`, igual que el resto de paginas.
- [x] La contrasena temporal viaja en la respuesta de la Server Action, nunca en la URL. Comprobable en la pestaña Network: el POST no lleva la clave y la URL queda limpia.
- [x] Ninguna pantalla de esta seccion borra usuarios. No hay llamada a `delete` sobre `profiles` ni a `admin.deleteUser`.

### Comprobaciones manuales

- [ ] `admin` abre `/admin/usuarios`; ve el listado con nombre, correo, rol y estado. `supervisor`, `operador` y `consulta` reciben `/no-autorizado` y **no** ven el enlace "Personas" ni en la barra ni en el inicio.
- [ ] Filtros: por nombre, por correo (parte del termino), por rol y por estado. La combinacion acota. Un filtro basura (`?rol=root`) no rompe: avisa y muestra todo.
- [ ] "Cargar mas" con mas de 25 personas: sin repetir ni saltar, y el orden por nombre se mantiene.
- [ ] Alta: al guardar aparece la clave temporal **una sola vez**. No esta en la URL ni sobrevive a recargar. El correo queda confirmado y la persona entra con esa clave.
- [ ] La persona entra con la clave temporal y la app la manda a `/cambiar-password` antes de dejarla usar nada.
- [ ] Roles: al cambiar un rol, el permiso aplica en la siguiente peticion (no hay que volver a entrar). La bitacora registra el cambio con `granted_by`.
- [ ] Anti-encierro, los cuatro casos: no autodestacar; no quitarse el propio rol admin; no desactivar al ultimo admin activo; no quitar `admin` al ultimo admin activo. Cada uno muestra el motivo y **deja el modal abierto**.
- [ ] Desactivar no borra nada: los movimientos y compras anteriores conservan el nombre de la persona, y `/admin/auditoria` muestra la fila del cambio.
- [ ] Reset: genera clave nueva, invalida la anterior al instante y marca `force_password_change`. En `/admin/auditoria` aparece un evento `cambio_password` (esta escritura en `auth.users` no la ve ningun trigger).
- [ ] Sin `SUPABASE_SERVICE_ROLE_KEY`: la app arranca, el listado muestra "Correo no disponible" y el reset dice que este entorno no puede, sin reventar.
- [ ] Sin JavaScript: el alta, el cambio de rol y la desactivacion se envian igual (`<form action>`), y el listado renderiza en el servidor.

## Verificacion de la fase 11

Esta fase es de **limpieza y correccion de un bug**, asi que casi todo se puede
comprobar sin base de datos: el esquema de Zod es codigo puro y se ejecuta, y el
resto se comprueba con los cuatro comandos de la tabla.

### Cerrado por codigo

- [x] `npm run typecheck`, `npm run lint`, `npm run build` y `npm run audit:security` en verde (6/6).
- [x] **Bug `peso_kg` NaN**: reproducido antes de tocar nada. Con un producto en
      modo `cantidad` (el caso ACEITE, unidad `l`), el formulario no dibuja el
      campo de peso, `texto(formData, 'peso_kg')` devuelve `""`, `z.coerce.number()`
      lo convertia en `NaN` y Zod rechazaba con `invalid_type` sobre un campo que
      el usuario nunca ve. Tras el fix, las 15 comprobaciones de la matriz pasan:
      cantidad sin peso, peso sin cantidad, `ambos`, vacios, cero, negativos,
      decimales y ajustes. Comprobable ejecutando `registrarMovimientoSchema` en
      aislamiento (ver ADR-017).
- [x] Con el fix, "ambos vacios" devuelve el mensaje util ("Ingresa la cantidad o
      el peso del movimiento") en vez de dos `invalid_type` que no senalaban nada.
- [x] La foto se conserva tras un envio fallido: `PhotoInput` guarda el `File` y
      lo reinyecta con `DataTransfer` cuando la accion responde. El mensaje
      distingue "Foto lista" de "Foto recuperada, se enviará otra vez".
- [x] `/diag` y `/diag/permisos` borrados, junto con `diag(?:/|$)` del `matcher`,
      las dos entradas de `EXENTAS_PERMISOS` y la rama `esRutaDiag`.
- [x] `npm run build` ya no genera `/diag` ni `/diag/permisos`.
- [x] Cero `console.log` de depuracion en `app/`, `components/`, `lib/`,
      `server/`, `types/` y `middleware.ts`. Los que quedan son `console.error`
      en fallos que no tienen otra traza (ver ADR-018) y la salida de los scripts
      de CLI, que es su interfaz.
- [x] Sin codigo muerto por el borrado: `tsc` y `eslint` limpios (unused imports
      incluidos).

### Se deja abierto para la fase 12

Estos necesitan **la base de datos real y tráfico**, asi que no se pueden dar por
cerrados desde el codigo:

- [ ] `explain` de los indices de `v_movimientos` y de `profiles_full_name_id_idx`
      (este ultimo sigue sin crearse: la busqueda de usuarios recorre la tabla).
- [ ] La firma de las fotos caduca a los 120 s y se refresca al abrir el detalle.
- [ ] Paginacion "Cargar mas" con volumen real (> 50 registros), sin repetir ni saltar,
      en `/historial`, `/admin/auditoria` y `/admin/usuarios`.
- [ ] Orden del render en realtime: en `/compras`, un cambio hecho desde otro
      dispositivo aparece sin recargar y sin pisar lo que se esta escribiendo.
- [ ] El bug de movimientos **en la app de verdad**: registrar entrada, salida y
      ajuste de un producto por peso y otro por cantidad, con foto, y comprobar
      que la foto sobrevive a un rechazo.
- [ ] Rutas de permisos: que `supervisor`, `operador` y `consulta` reciban
      `/no-autorizado` en cada pantalla de administracion, contra la RLS real.
- [ ] Los checklists de las fases 1 a 10 que siguen con `[ ]`: son comprobaciones
      manuales de pantalla, contraste, teclado y `< 375 px`, y no se pueden cerrar
      sin una persona mirando la app.

## Verificacion de la fase 12

Esta fase cierra el telefono sobre **HTTP plano**. La app se usa en la tienda
entrando por la IP del Wi-Fi, y eso no se habia probado nunca: en el PC siempre
fue `localhost`, que si es contexto seguro. Lo que se rompia ahi, y como quedo,
esta en **ADR-020**.

- [x] `npm run check:http-plano` en verde: **11 PASS, 0 FAIL, 1 WARN**. El script
      importa los modulos reales y simula el contexto no seguro.
- [x] El build de produccion no tiene ninguna llamada desnuda a `crypto.randomUUID`
      ni a `navigator.clipboard.writeText`: los 58 archivos de `.next/static`
      revisados, y lo unico que aparece es el codigo con su `typeof`.
- [x] El identificador de idempotencia sigue siendo un **UUID v4 canonico** sin
      `randomUUID`: es lo que exigen Zod y Postgres, asi que la proteccion contra
      el doble toque no depende del navegador.
- [x] El boton de copiar **dice** si copio (`copiarAlPortapapeles` devuelve
      `boolean`) en vez de fallar en silencio, que era el fallo peor de los dos.
- [x] Sin dependencias nuevas para resolverlo: 20 lineas y un `Uint8Array`.
- [ ] **A-3** y **J-1b** del guion, en el celular y por la IP: que el formulario
      de entrada se pinte entero y que la clave temporal se pegue de verdad. Es lo
      unico que no se puede cerrar sin una persona con el telefono en la mano.

El protocolo numerado para PC y celular esta en
**[`docs/PRUEBAS-FINALES.md`](docs/PRUEBAS-FINALES.md)** (84 pasos, con resultado
esperado y casilla por paso). Alli queda tambien:

- El snapshot de la base real del `2026-10-04` y la config que gobierna cada
  comportamiento (`require_movement_photo`, `allow_negative_stock`, ...).
- El resultado de las verificaciones runtime de solo lectura: **10 hechas** (la mas
  importante, R-1: el bug del `peso_kg` corregido y comprobado sobre un movimiento
  real) y **3 bloqueadas** por falta de acceso directo a Postgres, con el SQL
  exacto para pegar en el SQL Editor de Supabase.
- **H-1** resuelto: la foto no fallaba por la puerta sino por el `INSERT` en
  Storage (`new row violates row-level security policy`). Diagnostico y arreglo
  en **ADR-019**; verificado en runtime con `npm run check:storage` (token real
  de la API de Auth, cliente de sesion, subida -> 201 -> borrado).
- **H-2** resuelto: el motivo es obligatorio y la observacion es opcional. Sin
  cambios de esquema; se ajusto la ayuda "?" y el formulario.
- **H-3** resuelto: el celular entra por **HTTP plano**, y ahi
  `crypto.randomUUID()` no existe y `navigator.clipboard` falla en silencio.
  Arreglado en `lib/uuid.ts` y `lib/copiar.ts`; decision en **ADR-020** y
  verificacion con `npm run check:http-plano` (11 PASS, 0 FAIL, 1 WARN).
- El plan de volumen **aprobado** para probar la paginacion y los `EXPLAIN`, con
  su orden: despues de que el guion A-F pase completo.

> **Ojo con la IP del celular:** `172.24.176.1` es el puente virtual de WSL y el
> celular **no tiene ruta hacia el**. En el Wi-Fi de la casa hay que usar
> `http://192.168.1.3:3000`.

> **No hace falta HTTPS.** Es un contexto no seguro (ahi no existen
> `crypto.subtle`, `crypto.randomUUID` ni `getUserMedia`, y el portapapeles
> puede rechazar), y la app esta hecha para aguantarlo: el identificador se
> genera con `nuevoUuid()` y el copiado con `copiarAlPortapapeles()`, los dos con
> reserva. Lo que **no** hay es camara dentro de la app: la foto se elige con el
> selector de archivos, y en el celular es el sistema quien ofrece la camara.
> Ver **ADR-020**.

> **Ojo con `npm run build`:** si el servidor de desarrollo esta levantado,
> `next build` y `next dev` se pelean por la misma carpeta `.next` y el build
> puede morir con `Invariant: no direct app page entry found for /_not-found`.
> No es un fallo del codigo: **para el build, para el `dev` primero**. Si ya lo
> paraste y aun asi falla, es que el `.next` quedo a medias: borralo
> (`Remove-Item -LiteralPath .next -Recurse -Force`) y repite. Para las pruebas
> solo hace falta `npm run dev`.

## Verificacion de la fase 12B

Dos mejoras de uso diario: ver las fotos en grande y que la app no se sienta
como una web grande en el celular. Decisiones y descartes, en **ADR-022**.

### Cerrado por codigo

- [x] `npm run typecheck`, `npm run lint` y `npm run build` en verde.
- [x] `components/photos/photo-viewer.tsx`: modal a pantalla completa en movil y
      centrado en escritorio, con `object-contain`, navegacion entre fotos,
      flechas del teclado, `Esc`, foco atrapado y bloqueo del fondo (`<dialog>`
      nativo). Cerrar tocando fuera y deslizando hacia abajo.
- [x] **Zoom sin librerias**: pellizco con eventos de puntero, doble toque y
      botones. La imagen crece de verdad (cambia su `width`), asi que el
      desplazamiento con el dedo es el nativo del navegador y no hay que
      reimplementarlo.
- [x] **URL firmada nueva en cada apertura**, de 5 minutos, hecha por el cliente
      de sesion: la policy de Storage evalua el mismo `auth.uid()` que en el
      servidor, asi que no hace falta Server Action. Con reloj de caducidad y
      boton **"Recargar imagen"**.
- [x] Descargar con nombre legible: `movimiento-#000001-2026-10-04.jpg`.
- [x] Integrado en `/historial` (el contador de fotos abre el visor; el listado
      **sigue sin cargar imagenes**, ADR-014) y en `/movimientos/[id]`
      (miniaturas con lupa).
- [x] Compacto en movil en **un solo sitio**: `@media (width < 640px)` en
      `app/globals.css` redefiniendo las variables de texto, que es donde Tailwind
      v4 las lee. Titulos, labels, botones y tarjetas de toda la app bajan a la
      vez; el escritorio no se entera.
- [x] Barra de navegacion inferior en movil con los cuatro destinos de uso
      diario y un panel "Mas" con el resto. La lista llega ya filtrada por
      permisos desde el servidor: el componente no decide nada.
- [ ] **L-2, L-3 y L-11 a L-15 del guion, en el celular**: el pellizco, el
      desplazamiento con la foto ampliada y si 15px de base se leen bien. Es lo
      unico que no se puede cerrar sin una persona mirando la pantalla.

### Lo que no se hizo, y por que

- **Infinite scroll**: el listado ya pagina por keyset `created_at|id`; cambiarlo
  es un cambio de logica de carga, no de estilo.
- **`select` como bottom sheet**: reemplazar el selector nativo obliga a
  implementar lista, busqueda y navegacion por teclado para no perder
  accesibilidad. Es un componente entero, no un ajuste de CSS.
- **El visor en `/admin/auditoria`**: la bitacora no guarda fotos (los eventos son
  de perfil, rol, catalogo, compras y movimientos), asi que no hay nada que abrir.
