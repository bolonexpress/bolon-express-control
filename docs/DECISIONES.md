# Registro de decisiones (ADR)

Formato: contexto → decision → consecuencia. Solo se anaden decisiones nuevas;
las aceptadas no se reescriben, se sustituyen con una entrada posterior.

---

## ADR-001 · Peso interno en KG, libras solo en presentacion

**Contexto.** El negocio opera con libras, pero mezclar unidades en la base
genera errores de conversion silenciosos.

**Decision.** `movements.peso_kg` y `products.stock_minimo` se almacenan
siempre en kilogramos. La libra existe como unidad de presentacion
(`units.code = 'lb'`, factor `0.45359237` en `app_config.weight_lb_to_kg`) y se
convierte solo en `lib/format/weight.ts`.

**Consecuencia.** Ninguna consulta, filtro ni comparacion puede hacerse en
libras. Los reportes que pidan libras deben convertir en la capa de presentacion.

---

## ADR-002 · Stock calculado, sin columna

**Contexto.** Una columna `products.stock` se desincroniza con facilidad y es
incompatible con un libro de movimientos auditable.

**Decision.** No existe columna de stock. El stock se obtiene de
`v_stock_productos` (`sum` de `delta_cantidad` / `delta_peso_kg` de movimientos
no anulados). Las escrituras pasan por `registrar_movimiento()`, que bloquea la
fila del producto con `SELECT ... FOR UPDATE` y valida stock >= 0 en la misma
transaccion.

**Consecuencia.** El coste de lectura de stock es proporcional al historial del
producto. Mitigacion: indice `(product_id, created_at desc)` y, si el volumen de
movimientos lo exige, archivado anual de `movements`.

---

## ADR-003 · Movimientos inmutables y correccion por anulacion

**Contexto.** Un `UPDATE` sobre un movimiento destruye la evidencia de que el
stock fue corregido.

**Decision.** `movements`, `movement_anulations` y `audit_logs` rechazan
`UPDATE`/`DELETE` mediante trigger (`fn_prevent_mutation`), no solo con RLS. Un
error se corrige anulando el movimiento y registrando uno nuevo con motivo
`correccion_inventario`. La anulacion guarda un `snapshot` del movimiento.

**Consecuencia.** El historial crece sin limite. Aceptado: es el requisito del
negocio. La UI nunca ofrece "editar movimiento", solo "anular".

---

## ADR-004 · Identidad dual: UUID interno + `display_id` legible

**Contexto.** El personal necesita referirse a un producto o movimiento en
conversacion ("el #000152"), pero los UUID no se pueden dictar por telefono.

**Decision.** `id uuid` para toda relacion y FK; `display_id bigint identity`
para la numeracion; `codigo` generado (`#` + 6 digitos) para mostrar.

**Consecuencia.** El `codigo` no es editable ni reutilizable. La busqueda por
codigo requiere el indice sobre `codigo`.

---

## ADR-005 · RBAC en base de datos, no en codigo

**Contexto.** Con roles escritos en el codigo, cambiar permisos exige redesploy y
el cliente podria saltarse reglas.

**Decision.** `permissions` + `roles` + `role_permissions` + `user_roles`, con
`has_permission()` como unica fuente de verdad, usada tanto en las politicas RLS
como dentro de las funciones `SECURITY DEFINER`. Los movimientos no admiten
`INSERT` directo: la unica via es `registrar_movimiento()`.

**Consecuencia.** Cada politica es mas verbosa, pero ninguna escritura depende
de que el cliente se porte bien. El rol `admin` tiene acceso total por diseno
(comprobacion explicita en `has_permission`).

---

## ADR-006 · Idempotencia en el cliente

**Contexto.** En movil, un doble toque o un reintento por red duplicarian el
movimiento.

**Decision.** El cliente genera un `idempotency_key` (UUID) por formulario de
movimiento; `movements.idempotency_key` es `UNIQUE` y la RPC devuelve el
movimiento existente cuando la clave se repite.

**Consecuencia.** Reintentar es seguro. La clave debe regenerarse al cambiar
cualquier dato del formulario.

---

## ADR-007 · `service_role` fija campos reservados del perfil

**Contexto.** El trigger `fn_protect_profile_fields` restringe
`is_active` / `force_password_change` a `users:manage` (o al propio usuario,
solo para limpiar su flag). Para `service_role` — que usa el seed-admin y las
Server Actions de administracion— `auth.uid()` es null, así que el seed no
podría fijar `force_password_change = true` al crear el primer admin.

**Decision.** La migracion 07 añade `is_service_role()` (lee el claim `role` de
`request.jwt.claims`) y el trigger la acepta como segunda via, junto a
`users:manage` y al caso "el usuario limpia su propio flag". La RLS no cambia:
`service_role` ya bypassea politicas por diseño de Supabase.

**Consecuencia.** Quien separe la clave `service_role` puede gestionar estados
de usuario sin ser admin de la app. Aceptado: es la semantica estandar de
`service_role` (backend de confianza) y la clave nunca sale del servidor ni de
los scripts.

---

## ADR-008 · Cookies de sesion endurecidas y CSP con nonce en middleware

**Contexto.** `@supabase/ssr` escribe las cookies de sesion con opciones por
defecto suaves. La app es privada y corre en Vercel (HTTPS obligatorio).

**Decision.** `lib/supabase/session-cookies.ts` fuerza `HttpOnly`,
`SameSite=Lax` y `Secure` cuando `NODE_ENV=production` (sin `Secure` en
desarrollo, donde HTTP local rompería la sesion). Se aplica en el middleware y
en el cliente de servidor. La CSP usa un nonce por peticion generado en
middleware (Next lo inyecta a sus scripts inline), por eso no se define en
`next.config.ts`; las demas cabeceras sí se setean alli.

**Consecuencia.** Las cookies no son legibles ni enviables en peticiones
cross-site. En desarrollo el flag `Secure` no aplica, documentado como
excepcion intencional.

---

## ADR-009 · `stock_minimo` se captura en la unidad del producto y se guarda en la base

**Contexto.** `v_stock_productos` compara `stock_minimo` contra dos magnitudes
distintas segun el modo de control: para `peso`/`ambos` compara contra
`s.peso_kg`, y para `cantidad` contra `s.cantidad`. Pero `cantidad` viene en la
unidad del producto (que puede ser `lb`) mientras que `peso_kg` siempre esta en
KG. Sin una regla explicita, un stock minimo capturado en libras se compararia
contra kilos y el aviso de reposicion saltaria 2,2 veces antes de tiempo.

**Decision.** El formulario pide `stock_minimo` **siempre en la unidad del
producto**. El servidor lo normaliza antes de escribir
(`server/services/catalog.ts::normalizarStockMinimo`):

- modo `peso` / `ambos` -> se multiplica por `units.factor_to_base` y se guarda
  en KG (coherente con ADR-001);
- modo `cantidad` -> se guarda tal cual, porque ya esta en la unidad en la que
  se contara.

Al reabrir el formulario el valor se deshace la conversion, de modo que editar
sin tocar el campo no altera el dato. La conversion la decide el servidor; la
unica pista que ve el usuario es un texto de ayuda ("se guarda como X kg").

**Consecuencia.** `factor_to_base` deja de ser decorativo: pasa a ser la pieza
que hace comparables los stock minimo de productos expresados en unidades
distintas. Como consecuencia, un producto en modo peso solo admite unidades de
tipo `peso` (`validarModoControl`).

---

## ADR-010 · El catalogo se protege con `catalog:read` / `catalog:write`

**Contexto.** El enunciado de la Fase 3 hablaba de un permiso `products:manage`.
El esquema ya sembrado en la migracion 01 define `catalog:read` y `catalog:write`,
y las politicas RLS de `products`, `categories` y `units` los evaluan con
`has_permission()`. Introducir `products:manage` obligaria a una migracion que
 dejaria las tres tablas con dos permisos de escritura que nadie mas tendria y sin
efecto sobre la RLS.

**Decision.** Se reutilizan los permisos existentes: `catalog:read` para las
rutas de listado y `catalog:write` para los formularios y toda escritura
(`requirePagePermission` en la pagina, `requirePermission` en la Server Action).
El rol `admin` conserva el acceso total por lavia de `has_permission()`.

Las rutas siguen el arbol de ARCHITECTURE.md §3 en espanol: `/productos`,
`/categorias` y `/unidades` (no `/admin/products`), con la navegacion del
catalogo en la cabecera del shell autenticado.

**Consecuencia.** El permiso sigue siendo editable por rol desde la Fase 6 sin
migracion: `supervisor` y `admin` escriben, `consulta` solo lee. Los listados del
administrador muestran tambien los registros inactivos (soft delete) para poder
reactivarlos; el resto de modulos filtraran por `is_active`.

> **Actualizado en la Fase 4 (ver ADR-011).** La segunda bullet de la decision
> anterior queda sustituida: `stock_minimo` se guarda **siempre** en unidad base,
> tambien en modo `cantidad`. El esquema de la Fase 1 ya lo daba por hecho
> (`v_stock_productos.cantidad` es la suma de `delta_cantidad`, que esta en
> unidad base), de modo que la regla anterior producia minima incomparables.

---

## ADR-011 · Fase 4: foto obligatoria, conversion a unidad base y rutas estaticas

Agrupa las cuatro decisiones que tomo la primera entrega de movimientos. Todas
responden al mismo hecho: el enunciado de la Fase 4 es mas estricto que el
andamiaje que dejo la Fase 1, y donde chocan se ajusta el andamiaje.

### 1. La foto es obligatoria por defecto, no opcional

**Contexto.** La migracion 01 sembro `require_movement_photo = false` para que el
despliegue inicial no bloqueara a nadie, pero el principio de ARCHITECTURE.md §1
("movimientos con foto") y el enunciado de la Fase 4 la exigen siempre.

**Decision.** La migracion 09 pone el flag en `true` y el cliente lo trata como
requisito (`exigeFoto`), no como opcion. La validacion vive en la Base de Datos
dentro de `registrar_movimiento`: si el flag esta activo, la RPC **rechaza** el
movimiento sin foto en lugar de registrarlo sin ella.

**Consecuencia.** La foto se sube **despues** de crear el movimiento, porque la
policy de storage (`movement_photos_insert`) exige que el movimiento exista y no
esté anulado. Eso significa que un fallo de subida deja el movimiento registrado
sin foto. Es un coste asumido a cambio de que la foto nunca sea un dato
inventado: si el movimiento se creara primero sin foto, un reintento podria
adjuntarla a una anulacion ya existente. La accion reporta el fallo de forma
explicita en lugar de ocultarlo.

### 2. Idempotencia de la foto sin `upsert`

**Contexto.** El path es `movement-photos/<movement_id>/<key>.<ext>`, donde `key`
es la clave de idempotencia del formulario. Un doble toque produce el mismo
path, pero `upsert: true` exigiria una policy de UPDATE en el bucket que
`authenticated` no tiene: una foto no se renombra ni se reescribe.

**Decision.** Subida con `upsert: false`. "Ya existe" (409) se interpreta como
exito, igual que el `23505` de `photos.path`. El par (subida + fila) es
idempotente sin abrir permisos que el modelo no necesita.

### 3. `stock_minimo` siempre en unidad base (sustituye ADR-009)

**Decision.** `normalizarStockMinimo` convierte siempre por
`units.factor_to_base`, sin mirar el modo de control. El formulario pide el
minimo en la unidad del producto y el servidor lo normaliza; al reabrir, el
valor se deshace la conversion para que editar sin tocar el campo no altere el
dato. En los movimientos ocurre lo mismo: `delta_cantidad` va en unidad base y
`cantidad_original` conserva lo que escribio el usuario.

### 4. Rutas estaticas en lugar de `/movimientos/[tipo]`

**Contexto.** Next.js no admite dos segmentos dinamicos hermanos: `[tipo]` y
`[id]` colisionan, y el orden de resolucion de rutas favours al estatico, con lo
que `/movimientos/entrada` acabaria resolviendo a `[id]`.

**Decision.** Tres rutas fijas: `/movimientos/entrada`, `/movimientos/salida` y
`/movimientos/ajuste`, y se reserva `[id]` para el detalle. El arbol de
ARCHITECTURE.md §3 se actualiza en consecuencia. El tipo viaja ademas en el
cuerpo como campo oculto, de modo que la validacion no depende de la ruta.


---

## ADR-012 · Fase 5: `inventory:read`, estado en la app, vista viva (no materializada)

### 1. Permiso nuevo `inventory:read` en lugar de reusar `catalog:read`

**Contexto.** El enunciado de la Fase 5 pide proteger `/inventario` con
`inventory:read`, que la migracion 01 no sembro. Reusar `catalog:read` lo ve
igual cualquiera que pueda editar el catalogo, y reusar `movements:read` abriria
el libro de movimientos a quien solo quiere contar mercancia.

**Decision.** La migracion 10 crea el permiso y lo otorga a los cuatro roles.
Importante: los grants del seed de la migracion 01 son un cross join EN SU
MOMENTO; un permiso creado despues no se propaga solo, ni siquiera a `admin`
(hay que insertarlo explicitamente). La Fase 7 podra retirarlo por rol sin
tocar codigo.

### 2. El estado (OK / Bajo / Critico) lo decide la app, no la vista

**Contexto.** `v_stock_productos` ya calcula `bajo_minimo` (stock < minimo).
"Critico" (stock <= 0) no esta en SQL.

**Decision.** La app deriva `critico` de `stock_principal <= 0` y reusa
`bajo_minimo` de la vista tal cual, para que la alerta de la Fase 8 no
diverja. El criterio de presentacion vive en codigo (`estadoInventario`),
donde cambiarlo no exige una migracion.

### 3. Vista viva + indice; NO vista materializada

**Contexto.** El enunciado ofrece "vista o funcion RPC" y sugiere mirar vistas
materializadas "si se usan". Una materializada obligaria a un refresh por
cada movimiento (lo contrario de una RPC atomica) o a aceptar datos atrasados
en la pantalla que decide si hay que comprar.

**Decision.** Se mantiene la vista viva de la Fase 1 y se cierra el unico
punto flojo real del plan: el `not exists` contra `movement_anulations` no
tenia indice por `movement_id` y barreria todas las anulaciones por fila. La
migracion 10 lo crea (`movement_anulations_movement_idx`). El filtro por
producto ya usa `movements_product_created_idx`. Con el volumen de un local
(cientos de movimientos por semana) el agregado es inmediato; si algun dia no
lo fuera, la decision se reabriria con mediciones, no de antemano.
**Consecuencia.** El inventario que ve el usuario es exactamente el stock
comprometido por la ultima RPC; nunca una cifra desactualizada.

---

## ADR-013 · Fase 6: se reusa `shopping:write`, realtime por refresh, "cancelado" es "descartado"

### 1. `shopping:create` y `shopping:update` no existen: se reusa `shopping:write`

**Contexto.** El enunciado de la Fase 6 pide `shopping:create` y
`shopping:update`, pero el seed de la migracion 01 define solo `shopping:read` y
`shopping:write`, y las policies de `shopping_list` los evaluan directamente.

**Decision.** Misma regla que ADR-010: se reutilizan los permisos existentes
(`shopping:read` para la ruta y el realtime; `shopping:write` para agregar y
cambiar estado). Crear los dos permisos nuevos dejaria dos pares de permisos
con el mismo efecto en la RLS.

### 2. Transiciones en trigger, no solo en la accion

**Decision.** `COMPRAS_TRANSICIONES` (types/domain.ts) valida en la Server
Action con mensaje amable, y el trigger `trg_shopping_transicion` (migracion
11) repite la misma tabla en `BEFORE UPDATE`: pendiente -> en_proceso ->
comprado | descartado, terminales sin salida. Un UPDATE por SQL directo no
puede resucitar un descartado.

### 3. Realtime sin exponer datos: notificacion + refresh

**Contexto.** El enunciado pide que los cambios se vean "al instante sin
recargar". Supabase Realtime sobre `postgres_changes` pasa por la RLS del
suscriptor, pero la UI de compras la renderiza el servidor con mas datos
(nombres de usuario, vista `v_shopping_list`).

**Decision.** La suscripcion cliente solo dice "algo cambio" y ejecuta
`router.refresh()` con debounce de 250 ms: el servidor vuelve a leer con la
sesion del usuario, la RLS aplica de pleno, y la recarga parcial de Next es
imperceptible en este volumen. Nada de estado espejo en el cliente que pueda
desfasarse.

**Consecuencia.** La migracion 11 publica ambas tablas en `supabase_realtime`
y pone `replica identity full` (el evento UPDATE trae la fila completa).

### 4. "Cancelado" del enunciado es `descartado`

**Contexto.** ARCHITECTURE.md §6.3 y el schema usan `descartado` como estado
terminal; el enunciado lo llama "cancelado". Misma semantica: el pendiente se
cierra sin comprarse.

**Decision.** Se conserva `descartado` en dominio y UI ("Descartar") para no
duplicar enums. Lo aclara `_LABEL` si el negocio prefiere otra palabra.

---

## ADR-014 · Fase 7: paginacion keyset, URLs compartibles, fotos firmadas solo en el detalle

### 1. `history:read` como permiso propio (misma regla que ADR-012)

**Contexto.** El enunciado pide proteger `/historial` con `history:read`, que
no estaba sembrado (como `inventory:read` en la Fase 5).

**Decision.** La migracion 12 lo crea y lo otorga a los cuatro roles. La ruta
y la Server Action lo exigen; DEBAJO sigue trabajando la RLS que exige
`movements:read` (la vista `v_movimientos` es `security_invoker`): dos capas.

### 2. Keyset, no offset/limit

**Contexto.** "Cargar mas" clasico suele ser `offset`: cada pagina relee y
descarta las anteriores, y un movimiento nuevo entre pagina y pagina
desfasaria el conteo.

**Decision.** Cursor `(created_at, id)` con `.or('created_at.lt.X,and(created_at
.eq.X,id.lt.Y)')` sobre `v_movimientos`, orden ya cubierto por
`movements_created_idx`. Piden `LIMIT + 1` y el sobrante decide `nextCursor`:
no hay `count` paginado. La primera pagina sale del servidor con searchParams
GET en la URL (compartible); las siguientes viajan por `consultarHistorialAction`
con el mismo esquema Zod, validado en los dos caminos.

### 3. Fotos: icono en el listado, URL firmada solo en el detalle

**Contexto.** El enunciado pide "no cargar fotos completas en el listado". El
bucket es privado: cualquier lectura del objeto exige una URL firmada.

**Decision.** El listado se queda con el conteo (columna de la vista). El
detalle llama `listFotosDelMovimiento`, que pide una URL firmada de 120
segundos por foto: es lo bastante corta para que una captura de pantalla o una
URL copiada no valga al dia siguiente, y lo bastante larga para verla. Sin
`photos:read` la storage policy falla y la UI pinta el placeholder, sin
excepciones de por medio.

### 4. Los filtros viven en la URL, no en estado oculto

**Decision.** La barra de filtros es un `<form method=GET>` contra `/historial`
(fechas, tipo, producto, responsable). El servidor parsea con Zod: un URL
manipulado degrada a filtros vacios con aviso. Se vio mejor que un filtro en
estado cliente porque (a) compartible, (b) funciona sin JS, (c) el filtrado es
exactamente lo que consulto el servidor.

---

## ADR-015 · Fase 8: una fila por operacion y aunque venga de fuera de la app

### 1. La funcion `logAudit` NO se mete en todas las acciones

**Contexto.** La auditoria ya la hace la base de datos: el trigger `fn_audit`
cubre catálogo, RBAC, config y lista de compras, y las RPC de movimientos
escriben su fila en la misma transaccion. Duplicar eso en la capa app daria
DOS filas por operacion (una del trigger, una del llamado) y haria trampa del
objetivo de la bitacora: exactamente una fila por operacion.

**Decision.** `server/lib/audit.ts::logAudit` solo se integra donde la BD no
alcanza: login exitoso/fallido, logout y cambio de contrasena
(Supabase Auth, no mis tablas). Los demas eventos quedan cubiertos por los
triggers/RPC, y el `SECURITY_AUDIT.md` lo documenta como matriz, no como una
lista de llamadas.

### 2. RPC `log_audit`, no policy de INSERT

**Contexto.** La tabla `audit_logs` no tiene policy de insert para
`authenticated`. Una policy `with check (actor_id = auth.uid())` permitiría
INYECTAR filas falsas (no es escalable: bastaria un cliente con JS).

**Decision.** La RPC `log_audit` (migracion 13) es security definer y fija
actor/email desde la sesion. La revocacion general de la migracion 04 impide
update/delete: la bitacora es append-only por arquitectura, no por convención.

### 3. `/admin/auditoria` con `audit:read`, no `admin:read`

**Contexto.** El enunciado pide `admin:read`, que no existe. El permiso real
de la Fase 1 es `audit:read` (sensible, admin-only por defecto).

**Decision.** Reyusa ese permiso (misma regla que ADR-010/ADR-012). Solo se
crean permisos nuevos cuando el seed no lo cubre (Fase 5/7); para "leer la
auditoria" ya estaba.

### 4. El antes/despues se renderiza al leer, no se normaliza

**Decision.** La fila guarda `datos.before`/`after` completos (o el snapshot);
la UI de `/admin/auditoria` solo muestra los campos que cambiaron (ignora
`created_at`/`updated_at`/`display_id`). Reconstruir el diff en un servicio
seria redundante y reventaria la retrocompatibilidad con los datos ya
registrados.
