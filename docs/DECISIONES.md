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

---

## ADR-016 · Fase 10: una sola acción por poder, cerrojo anti-encierro y la clave fuera de la URL

### 1. `users:manage` y solo ese

**Contexto.** El enunciado menciona `users:read` y `users:manage`. El seed de
la Fase 1 solo siembra `users:manage`.

**Decision.** Las tres rutas (`/admin/usuarios`, `/admin/usuarios/nuevo`,
`/admin/usuarios/[id]`) exigen `users:manage`, sin excepcion. **La fase no
anade migracion ni permiso nuevo**: quien puede administrar personas ya puede
leerlas. Anadir `users:read` abriria una lectura de datos personales (correos,
telefonos, ultimos accesos) a un perfil que no existe en este proyecto.

### 2. No existe "borrar usuario": solo desactivar

**Decision.** Ninguna accion llama a `delete` sobre `profiles` ni a
`admin.deleteUser`. La unica operacion de salida es `profiles.is_active = false`,
que ya respalda el `ON DELETE RESTRICT` de las FKs de `movements` y `shopping`.

**Por que.** Un usuario que borro es un nombre que desaparece de la bitacora y
de los movimientos que el equipo necesita explicar. Desactivar cierra la puerta
sin perder el rastro. La pantalla de baja pide confirmacion y explica
explicitamente que el historial se conserva.

### 3. La contrasena temporal viaja en la respuesta, nunca en la URL

**Contexto.** El alta de usuario necesita redirigir al listado tras guardar,
que es el camino natural para el resto de la app.

**Decision.** El alta **no redirige**: `crearUsuarioAction` y
`resetPasswordAction` devuelven `data.claveTemporal` y la UI la muestra una vez
en un modal con "copiar". Una contrasena en un query param queda en el historial
del navegador, en el log del servidor y en la cabecera `Referer` de la peticion
siguiente.

**Consecuencia.** El `estado.data` de `UsuariosActionState` lleva `claveTemporal`
por diseno. La clave se descarta al cerrar el modal; pulsar "crear otra persona"
deja de mostrarla.

### 4. Cerrojo anti-encierro en el servidor, explicado en la UI

**Contexto.** Un admin puede dejar la tienda sin nadie que la administre: si se
desactiva a si mismo, si se quita el propio rol `admin`, o si toca el ultimo
admin activo. El ultimo escenario no se puede resolver solo con un chequeo
"soy yo": depende de cuantos admins quedan.

**Decision.** Cuatro reglas, todas evaluadas **en la Server Action** (la UI
nunca es la que decide):

1. Nadie se desactiva a si mismo.
2. Nadie se quita a si mismo el rol `admin` que tiene.
3. No se desactiva al ultimo admin activo.
4. No se le quita `admin` al ultimo admin activo.

El conteo usa `contarAdminsActivos(exceptoId)`. Cuando el servidor rechaza, el
modal **se queda abierto** con el motivo: si se cerrara, quien administra
veria un toast y creeria que se guardó.

### 5. Keyset por `(full_name, id)` y correo buscado con `service_role`

**Contexto.** `profiles` no tiene indice por nombre, y el correo vive en
`auth.users`, fuera del alcance de la RLS del usuario.

**Decision.** Paginacion keyset como en la Fase 7 (ADR-014), con cursor
`base64url(nombre)|uuid` y `LIMITO+1`. La busqueda por nombre usa `ilike` con
comillas y escapes (mismo problema de sintaxis de PostgREST que en
`history.ts`); la busqueda por correo pagina `auth.admin.listUsers` con
`service_role` hasta tres paginas de 200.

**Consecuencia aceptada.** El recorrido de correos tiene un techo operativo de
600 usuarios y no es una busqueda por indice. Con el volumen de una tienda sobra.
Si algun dia no, el orden es: indice `profiles_full_name_id_idx on
public.profiles (full_name, id)` primero, y una tabla espejo de correos despues.

### 6. `logAudit` solo en el reset de contrasena

**Decision.** Es la unica escritura de la fase que la base no ve (`admin.auth.
updateUserById` no dispara ningun trigger de `fn_audit`), asi que es la unica
que llama a `logAudit` con `accion: 'cambio_password'` (misma regla que
ADR-015). `profiles` y `user_roles` ya se auditan solos; a~adir `logAudit` alla
duplicaria la fila.

La contrasena no entra en la bitacora ni en la consola: solo el nombre de quien
la cambio y el id del usuario afectado.

---

## ADR-017 · Fase 11: el campo ausente es `undefined`, y la foto sobrevive al reenvio

### 1. Causa del bug: faltaba `.optional()` en los helpers numericos

**Sintoma.** Registrar una entrada de un producto en modo `cantidad` (el caso
reportado con ACEITE, unidad `l`) fallaba siempre con
`invalid_type` / "Ingresa un numero valido" sobre `peso_kg`. Un campo que la
persona no ve, con un error que no puede corregir.

**Causa.** `numeroOpcional` y `numeroPositivo` de `lib/validation/movements.ts`
eran `z.preprocess(vacioAUndefined, z.coerce.number()...)` **sin `.optional()`**.
La cadena era:

1. El formulario solo dibuja el input de peso si el producto es de modo `peso`,
   asi que para ACEITE el campo no existe en el DOM.
2. `texto(formData, 'peso_kg')` devuelve `""` cuando el campo no esta.
3. `vacioAUndefined("")` produce `undefined` (correcto).
4. Pero `z.coerce.number()` coercea `undefined` a `NaN`.
5. El `.refine(Number.isFinite)` lo rechaza con `invalid_type`.

El `.optional()` que faltaba impedia que el paso 3 sirviera de algo. El
`superRefine` de la misma funcion ya comparaba contra `undefined`
(`datos.cantidad === undefined`), o sea que la intencion era correcta y la
implementacion no.

**Decision.** `.optional()` despues del ultimo `.refine` en ambos helpers. Se
documenta con el porque en el propio codigo, porque el orden de las dos cosas
importa y un futuro `.optional()` colocado antes del `refine` volveria a
cambiar el significado.

**Por que el bug nunca salio antes.** Afectaba a los **dos** modos: cualquier
movimiento de un producto controlado por cantidad fallaba por `peso_kg`, y
cualquier movimiento de uno controlado por peso fallaba por `cantidad`. Es decir,
el camino de captura de la app —su funcion principal— no podia completarse para
ningun producto. Salio en la Fase 11 porque es la primera vez que se registraba
un movimiento de verdad desde la app.

### 2. La regla por tipo de unidad no cabe en el esquema

El enunciado pide un `superRefine` que exija "el campo que corresponde al tipo de
unidad del producto". El esquema **no puede** saberlo: el producto se elige en el
formulario y solo existe en el servidor, y el esquema se ejecuta en los dos
lados con la misma forma. Meter el `unidad_tipo` en el esquema obligaria a
mandarlo en el FormData (y por tanto a que el cliente decidiera la regla, que es
justo lo que no se quiere).

**Decision.** Se reparte en las dos capas que ya existen:

- `superRefine` decide lo que el FormData permite ver por si mismo: que no
  falten los dos a la vez, que la cantidad no sea 0 o negativa fuera de un
  ajuste, y que el peso sea mayor que 0 en cualquier tipo.
- `validarValoresSegunModo(datos, control_mode)` decide que campo exige el
  producto, y corre en el formulario (con la fila que ya tiene en memoria) y en
  la accion (con la fila real). Un solo codigo, mismo mensaje en los dos lados.

Se anadio ademas el `peso_kg <= 0` al `superRefine`: antes se colaba por la regla
general de "no negativo" solo para `cantidad`, y un peso de 0 pasaba el esquema
para ser rechazado mas tarde por la RPC.

### 3. La foto se conserva reinyectando el `File`, no guardandolo en el servidor

**Sintoma.** React resetea el formulario cuando termina una Server Action, y eso
vacia el `<input type="file">`. Pero `PhotoInput` tiene su vista previa en estado
de React, que **no** se reinicia: la pantalla seguia diciendo "Foto lista:
ACEITE.jpg" con la imagen al lado mientras el segundo envio llegaba sin foto.

Eso es peor que perderla. No es una molestia: es una promesa falsa sobre un campo
**obligatorio**. Quien lo ve pense que la foto iba a ir y el movimiento se
registra sin ella, o falla de nuevo por un motivo que no entiende.

**Alternativas descartadas.**

- *Subir la foto antes de validar.* Duplica el trabajo: el movimiento se puede
  rechazar despues (stock insuficiente, producto desactivado) y habria que
  borrar un archivo huerfano, sin RPC que lo haga.
- *Recordar solo "habia una foto".* No se puede: un `<input type="file">` es el
  unico control que el navegador prohibe rellenar por script, precisamente para
  que una pagina no pueda leer un archivo que la persona no eligio. Por eso el
  unico camino es un `DataTransfer` con el `File` que ya esta en memoria.

**Decision.** `PhotoInput` guarda el `File` en un ref y, cuando la accion
responde, comprueba si el input quedo vacio; si es asi, lo reinyecta. Si el
`DataTransfer` no estuviera disponible, no se finge: se avisa al formulario padre
(`onCambia(null)`) y el texto pasa a "Vuelve a adjuntar la foto". Prefiere
molestar a mentir.

El exito redirige, asi que el componente se desmonta y la reinyeccion solo ocurre
en el camino del fallo: no hace falta coordination extra con el exito.

---

## ADR-018 · Fase 11: que se escribe en la consola, y por que

**Contexto.** Las fases anteriores dejaron `console.log` de diagnostico puestos
para depurar: uno por request en el middleware, el contexto de permisos completo
en cada carga de pagina, y el volcado completo de los issues de Zod en cada
intento fallido. Los tres se retiredaron con `/diag` y sus paginas.

**Decision.** La consola no es un canal de auditoria: es un canal de
incidentes. Se escribe solo cuando **paso algo que no es el camino normal** y
que no deja otra traza.

**Que se quita.**

- El camino feliz del RBAC (`[guards] contexto OK`, `[middleware] uid: ...`).
  Una linea por peticion no informa de nada: el middleware corre en todas las
  peticiones, asi que esto era ruido puro y el mas caro de los tres.
- Estados **normales**: sin sesion, perfil inactivo, usuario sin rol. El logout
  existe y un usuario sin rol es una situacion valida de la que el middleware ya
  se ocupa mandando a `/no-autorizado`. La bitacora guarda `login` y `logout` en
  `audit_logs`; la consola solo duplicaria lo que ya esta escrito.
- La validacion fallida (`[movimientos] issues: ...`). Un rechazo de Zod es lo que
  pasa cuando alguien escribe mal un campo, no un incidente. Volcar el array
  entero generaba una linea por cada intento fallido de todos los usuarios.

**Que se queda, y por que.**

- **Fallo de lectura de `user_roles`, `roles` o `role_permissions`.** El guard
  falla cerrado: si esas tablas no se pueden leer, `getAuthContext()` devuelve
  `null` y TODOS los usuarios salen de la app sin causa visible. Sin esta linea
  el sintoma es "la aplicacion no deja entrar a nadie" y no hay nada en ninguna
  parte que lo explique.
- **Denegacion de permiso.** Es un evento de seguridad. La RPC `log_audit` cubre
  las Server Actions, pero la redireccion del middleware y de las paginas no pasa
  por ella: sin esta linea, un intento de entrar donde no se puede no deja
  registro. `requirePermission` y `requirePagePermission` escriben la misma forma
  a traves de `registrarDenegacion`, con `via: 'accion' | 'pagina'`, para que el
  mismo evento no salga con dos redacciones distintas.
- **Zod que falla sin ningun campo** (`Object.keys(fields).length === 0`). Es el
  unico caso en que la UI solo puede pintar "no se pudo validar"; el mensaje en
  pantalla no dice por que, asi que la consola es el sitio donde averiguarlo.

Todo lo demas que la app escribe en el servidor sigue siendo `console.error` en la
operacion que fallo (RPC, Storage, migraciones), que es donde se busca cuando
algo se rompe. La trazabilidad de quien hizo que es `audit_logs`, y no se toca.

---

## ADR-019 · Fase 12: la foto del movimiento nunca llego al bucket

### 1. Sintoma

El movimiento `#000001` (entrada de ACEITE, 20 l) quedo registrado **sin foto**,
con `require_movement_photo = true`. El aviso que salia al volver al inicio era
literalmente:

> No se pudo subir la foto al almacenamiento: new row violates row-level security policy

Es decir: la puerta de obligatoriedad si se disparo, la RPC si escribio el
movimiento, y lo que fallo fue el `INSERT` del objeto en `storage.objects`.

### 2. La desalineacion exacta: dos convenciones de ruta, dos prefijos distintos

El bug era una confusion entre lo que Storage guarda y lo que la tabla guarda:

| Donde | Que se guarda | Ejemplo |
|---|---|---|
| `storage.objects.name` | **Sin** el bucket | `<movement_id>/<archivo>` |
| `public.photos.path` | **Con** el bucket | `movement-photos/<movement_id>/<archivo>` |

`supabase.storage.from(bucket)` ya apunta al bucket, asi que el `path` que se le
pasa es **relativo a el**: eso es lo que queda en `name`. La segunda forma la
impone el CHECK `photos_path_movimiento` (migracion 01), que exige
`split_part(path,'/',1) = 'movement-photos'` y 36 caracteres en el segmento 2,
y es lo que hace unico el path dentro de un bucket privado. De ahi
`public.photo_object_path()`, que existe para quitar el prefijo.

La policy `movement_photos_insert` (migracion 05) leia el movimiento de
`(storage.foldername(name))[1]`. `adjuntarFotoMovimiento()` en cambio construia
la ruta con el bucket dentro, de modo que el nombre real del objeto era
`movement-photos/<movement_id>/<archivo>`, `foldername(name)[1]` devolvia la
cadena `"movement-photos"` y el `exists (... where m.id::text = 'movement-photos')`
era falso. De ahi el 403.

Comprobado en runtime con `npm run check:storage` (token real de la API de Auth
y cliente de sesion):

```
upload('movement-photos/<mid>/prueba.png') -> 403 new row violates row-level security policy
upload('<mid>/prueba.png')                 -> 201 objeto creado
remove('<mid>/prueba.png')                 -> borrado (mismo cliente de sesion)
```

**Decision.** Las dos convenciones se definen en un solo sitio del codigo,
`lib/storage/foto-paths.ts`: `pathDeFoto()` para la columna y
`objectPathDeFoto()` para el bucket, mas `objectPathDesdePath()` para firmar.
Ningun modulo vuelve a armar la ruta con concatenacion propia.

### 3. Lo que NO era la causa (descartado una vez, medido y no por suposicion)

- **`owner` / `owner_id` de `storage.objects`.** Ninguna policy de la 05 los
  menciona. La de DELETE usa `public.photos.created_by`, que es la autoria real
  que registra la app. Supabase rellena `owner_id` con `auth.uid()` en un trigger
  (`objects_update_owner`) y solo si la sesion es `authenticated`: por eso la
  subida va con el cliente de sesion.
- **`service_role`.** No estaba en juego: la subida ya usaba `createClient()` de
  `@/lib/supabase/server` (cookies de sesion). Aun asi se fijo como regla, porque
  con la service_role la RLS se salta entera (`BYPASSRLS`), `auth.uid()` seria
  null y el objeto quedaria sin dueno: la foto entraria sin que nadie figure
  como autor. La migracion 14 hace explicito el requisito con
  `(select auth.uid()) is not null` en la policy de INSERT.
- **`has_permission()` como security invoker o definer.** Es `security definer`
  (migracion 02) para evitar la recursion de RLS al leer `user_roles`, y el
  `grant execute ... to authenticated` de la 04 lo cubre. Devolvia `true`
  correctamente: el movimiento entro por la RPC y la foto se rejectsolo por la
  ruta.
- **El bucket.** Existia, privado y con los limites correctos (si no hubiera
  existido, el mensaje habria sido "Bucket not found"; `adjuntarFotoMovimiento`
  distingue ese caso a proposito).

### 4. Segundo bug con la misma raiz: la foto no se veia aunque subiera

`listFotosDelMovimiento()` firmaba `createSignedUrl(foto.path, 120)` con el
path tal cual, o sea **con** el bucket dentro. Aunque la subida hubiera
funcionado, la URL firmada apuntaria a
`movement-photos/movement-photos/<mid>/<archivo>`, un objeto que no existe. Se
arregla con el mismo helper: `objectPathDesdePath(foto.path)`.

### 5. Decision sobre la base: migracion 14, sin tocar la 05

La 05 ya esta aplicada en el proyecto y sus policies son correctas respecto a la
convencion. Editarla no cambiaria nada en los proyectos que ya la aplicaron, asi
que el arreglo va en una migracion nueva e idempotente
(`supabase/migrations/20260101001300_14_storage_policies_fix.sql`) que:

1. Crea `public.movement_id_de_foto(text)`: resuelve el movimiento desde el
   nombre en un solo lugar, rechaza por forma la variante con el bucket dentro y
   valida que el primer segmento sea un UUID **antes** de castear (un `::uuid`
   sobre un texto invalido, dentro de una policy, sale como error 500 y no como
   403). Con `grant execute ... to authenticated`: las policies se evaluan con
   los privilegios de quien las invoca, y la migracion 04 revoco `execute` a
   `public` a proposito.
2. Recrea las tres policies sobre ese helper, **con los mismos permisos que
   tenian**. No se abre nada: ni UPDATE, ni escritura para `anon`, ni lectura
   fuera de `photos:read` + `movements:read`.
3. Avisa (no borra) si quedaran objetos con la forma antigua. En este proyecto
   no hay ninguno: el bucket esta vacio, porque el `INSERT` rechazado no deja
   objeto.

La convencion canonica queda siendo `<movement_id>/<archivo>` para el objeto y
`movement-photos/<movement_id>/<archivo>` para la fila. Aceptar las dos formas en
la policy habria dejado el layout ambiguo, que es como se produjo el bug.

### 6. Readjuntar la foto: decision de producto

Un movimiento es append-only (ADR-003) y la foto se sube **despues** de
registrarlo (la policy exige que el movimiento exista). Eso abre una ventana en
la que el movimiento queda escrito sin foto, y la foto es obligatoria: sin una
salida, la unica forma de cumplir la regla era registrar otro movimiento y
anular este. Eso es un castigo desproporcionado por un fallo de red o de
permisos.

**Decision.** El detalle del movimiento ofrece **"Adjuntar foto"** cuando el
movimiento no tiene ninguna (`fotos_count === 0`), no esta anulado y el usuario
tiene `photos:write` + `movements:write`, que es exactamente lo que exige la
policy de INSERT. Es un camino de recuperacion, no una segunda via de captura:
no aparece en los que ya tienen foto, y un movimiento anulado no admite fotos.

La clave de idempotencia es un `randomUUID()` nuevo en cada intento, al
contrario del formulario de registro: alliprotege del doble toque; aqui dos
pulsaciones deben crear dos fotos, no pelearse por el mismo objeto.

El boton no borra ni sustituye: la policy no tiene UPDATE y asi sigue.

### 7. El mensaje de error, que es lo que mas caro salio

`new row violates row-level security policy` se muestra ahora traduzido
("la causa mas probable es que el movimiento ya no exista o este anulado") y el
aviso de "movimiento registrado sin foto" dice que se puede readjuntar desde el
detalle. La regla de ADR-018 se mantiene: la consola sigue teniendo el error
real; lo que cambia es que la pantalla deja de pedirle a quien lee que traduzca
un nombre de constraint.

### 8. Como se verifica

`npm run check:storage` (antes `scripts/storage-check.mjs`, escrito sin
dependencias): pide un token real a la API de Auth y recorre el camino completo
—subir, firmar, registrar la fila, leerla, borrarla y borrar el objeto— con el
cliente de sesion, y lista el bucket con `service_role` para confirmar que no
queda nada. Resultado en la base real: **9 PASS, 0 FAIL, 0 WARN**, 0 objetos y 0
filas al terminar.

Es la prueba que faltaba en la 1.2 de `PRUEBAS-FINALES.md`, donde no habia forma
de ejecutar SQL contra Postgres: para el bucket de fotos no hace falta, porque la
API de Storage evalua las mismas policies que la base y lo hace con el mismo
`auth.uid()` del JWT.
