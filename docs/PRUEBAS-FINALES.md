# Pruebas finales · Fase 12

Guion para cerrar a mano los `[ ]` que quedan del README, con evidencia y sin
ensuciar la base de datos real.

- **Alcance:** pruebas manuales en PC y celular + verificaciones runtime de solo
  lectura.
- **Regla dura:** no se insertan movimientos, compras ni usuarios de prueba en la
  base real. Todo lo que se registre es un movimiento real y valido.
- **Cómo se marca:** cada paso lleva una casilla. `FAIL` con lo que se vio, sin
  interpretation: el arreglo se hace en esta misma fase.

---

## 0. Antes de empezar

### 0.1 Dos IP, una sola sirve para el celular

La maquina tiene dos adaptadores:

| IP | Adaptador | ¿Llega el celular? |
|---|---|---|
| `172.24.176.1` | `vEthernet (WSLCore)` | **No.** Es el puente virtual de WSL: solo lo alcanzan el propio PC y el contenedor. |
| `192.168.1.3` | `Wi-Fi` | **Si.** Es la IP de la red del router. |

- **Celular en el Wi-Fi de la casa:** usar `http://192.168.1.3:3000`.
- `http://172.24.176.1:3000` responde desde el PC (verificado: HTTP 200) pero el
  celular no tiene ruta hacia ahi. Si el celular no carga, es por esto.

Comprobado antes de escribir este guion:

```
172.24.176.1     -> HTTP 200  (23636 bytes)
192.168.1.3      -> HTTP 200  (23636 bytes)
localhost        -> HTTP 200  (23636 bytes)
```

El servidor ya estaba levantado. Si hay que levantarlo:

```bash
npm run dev            # normal
npm run dev:low-memory # equipos con menos de 8 GB de RAM
```

### 0.2 Si el celular no entra

1. ¿El servidorarranca en `0.0.0.0`? Next.js lo hace por defecto; si `localhost`
   funciona en el PC pero el celular no, casi siempre es el firewall de Windows.
2. Permitir Node.js en el **Firewall de Windows Defender** (peticion entrante,
   puerto 3000).
3. Confirmar que el celular esta en el **mismo** Wi-Fi, no en datos moviles ni en
   una red de visitas.

### 0.3 Estado real de la base al escribir este guion

Snapshot de solo lectura del `2026-10-04`. Sirve para saber que hay antes y que
hay despues, y para detectar que un paso escribio de mas.

| Tabla | Filas | Nota |
|---|---|---|
| `products` | 1 | `ACEITE`, `control_mode = 'cantidad'`, unidad `l`, `stock_minimo = 20` |
| `movements` | 1 | `#000001`, entrada de 15 l, `peso_kg = null` |
| `photos` | 0 | **Ojo: ver hallazgo H-1**. Se llena con el paso B-0 |
| `shopping_list` | 0 | vacio, se puede probar sin limpiar nada |
| `audit_logs` | 98 | catalogo, config, login/logout y el movimiento |
| `profiles` | 1 | solo `admin` |

`v_stock_productos` para ACEITE: `cantidad = 15`, `peso_kg = 0`,
`stock_principal = 15`, `bajo_minimo = true`, `stock_minimo = 20`.

**El stock ya esta por debajo del minimo.** El paso C-1 sale! ("asi esta", no
"lo dejó asi"). Si se quiere volver a tener stock alto, el paso B-1 lo hace.

Config que gobierna el comportamiento (`app_config`):

| Clave | Valor | Efecto |
|---|---|---|
| `require_movement_photo` | `true` | **La foto es obligatoria en todo movimiento** |
| `allow_negative_stock` | `false` | No deja bajar de cero |
| `low_stock_alerts_enabled` | `true` | Muestra la alerta de bajo minimo |
| `photos_max_size_bytes` | `15728640` | 15 MB por foto |
| `require_movement_reason` | `true` | El motivo es obligatorio |
| `weight_lb_to_kg` | `0.45359237` | Libras → kg |
| `timezone` | `America/Guayaquil` | Fechas de la bitacora |

Bucket `movement-photos`: **privado** (`public = false`). Correcto: las fotos no
se sirven por URL directa.

### 0.4 Hallazgos que hay que decidir ANTES de correr el guion

No son fallos de prueba, son cosas que el guion asumia y el codigo no hace.

**H-1 · RESUELTO · La foto nunca llego al bucket (no fue la puerta).**

El movimiento `#000001` existe, `photos` tiene 0 filas y el bucket **0
objetos**, con `require_movement_photo = true`. El toast real del primer intento
dijo:

> No se pudo subir la foto al almacenamiento: new row violates row-level security policy

La puerta **si** se disparo y la RPC **si** escribio el movimiento: lo que fallo
fue el `INSERT` del objeto. La causa era la ruta — el codigo pasaba el bucket
dentro del path (`movement-photos/<id>/<archivo>`) y la policy leia el
movimiento de `(storage.foldername(name))[1]`, que entonces era la cadena
`"movement-photos"` en vez del UUID. Arreglado en el codigo
(`lib/storage/foto-paths.ts`) y documentado en **ADR-019**; verificado en
runtime con `npm run check:storage`.

Lo que **no** se puede recuperar es el archivo original: el `INSERT` se rechazo
antes de escribir nada, asi que los bytes de esa foto nunca estuvieron en el
servidor. El movimiento se deja como esta y la foto se vuelve a tomar con el
boton **"Adjuntar foto"** del detalle (paso **B-0**), que es exactamente el
camino de recuperacion que se decidio anadir por esto mismo.

**H-2 · RESUELTO · El motivo es obligatorio; la observacion es opcional.**

`notes` es opcional en el esquema (`textoOpcional`) y el `<textarea>` de
Observaciones no tiene `required`. Lo obligatorio en un ajuste es el **motivo**
(`require_movement_reason = true`). Decision del negocio: **sin cambios de
esquema**. Se ajusto solo la ayuda "?" de las tres pantallas y el campo del
formulario, que ahora dicen "Motivo obligatorio, observación opcional" ( paso 3
de la ayuda y una etiqueta `Obligatorio` en el motivo). El paso **D-4** queda
como prueba de esa regla: guardar **funciona**.

**H-3 · RESUELTO · El celular entra por HTTP plano, y eso rompia dos cosas.**

El guion asumia que en el celular se podia entrar, pero **nunca se probo por la
IP**: en el PC siempre fue `localhost`, que si es contexto seguro. Al preparar la
Fase 12 aparecieron dos fallos que solo existen en `http://192.168.1.3:3000`:

1. `crypto.randomUUID()` **no existe** fuera de HTTPS/localhost, y el formulario
   de movimientos lo llama al pintarse: pantalla en blanco con `TypeError`.
2. `navigator.clipboard.writeText()` **existe pero rechaza**, sin lanzar error:
   el boton "Copiar la clave" no hacia nada y no habia forma de enterarse.

Ninguno era un problema de negocio, pero los dos hacen la app **inservible en el
celular**, que es donde se usa. Arreglados con dos modulos pequenos y sin
dependencias (`lib/uuid.ts`, `lib/copiar.ts`); decision completa en **ADR-020**,
verificacion en la seccion 1.5. Por eso el guion tiene ahora los pasos **A-3**
(el formulario pinta en el celular) y **J-1b** (la clave se copia de verdad), que
hay que hacer en el movil y no en el PC.

**H-4 · PENDIENTE · La migracion 14 aplicada impedia subir cualquier foto.**

> **BLOQUEA B-0 y B-1. Aplicar la migracion 15 ANTES de correr el guion.**
> Si se empieza por el guion sin esto, los dos pasos fallan con
> `new row violates row-level security policy` y parece un fallo de la app cuando
> no lo es.

La **migracion 14 si esta aplicada** en el proyecto (se confirma porque
`public.movement_id_de_foto()` existe y responde), y tiene un fallo: pedia **dos**
carpetas para aceptar un nombre de objeto, pero `storage.foldername()` devuelve
solo las carpetas y **excluye el nombre del archivo**, asi que la forma canonica
`<movement_id>/<archivo>` tiene **una** sola. El helper devolvia `null` siempre y
las tres policies rechazaban toda subida con 403.

Lo descubrio `npm run check:storage` al volver a correrlo: paso de **9 PASS** a
**3 PASS · 1 FAIL · 3 WARN**, con el paso 4 (subida canonica) en 403.

Correccion en la **migracion 15** (`create or replace` de la funcion, sin tocar
las policies), con autocomprobacion: si el helper sigue sin resolver la forma
canonica, la migracion **aborta y no aplica nada**. Diagnostico completo y
leccion en **ADR-021**; detalle de la evidencia en la seccion 1.6.

Despues de aplicarla, `npm run check:storage` tiene que volver a **9 PASS · 0
FAIL · 0 WARN**. Ese es el aviso de que la base esta lista para el guion.

---

## 1. Verificaciones runtime (solo lectura)

Resultado de lo que se pudo comprobar sin escribir nada.

### 1.1 Hecho, con evidencia

| # | Verificacion | Resultado | Evidencia |
|---|---|---|---|
| R-1 | El bug de la Fase 11 esta arreglado **en la app real** | **PASS** | El movimiento `#000001` (`2026-10-04T02:02:40`) es exactamente el caso del bug: ACEITE, `control_mode = 'cantidad'`, y por lo tanto el formulario no dibuja el campo de peso. Se guardo con `cantidad = 15` y `peso_kg = null`. Ya no hay `invalid_type`. **Limite de la evidencia:** la primera lectura de la base (pocos minutos antes) daba `movements = 0`, asi que el movimiento se creo despues del fix; aun asi no cubre la foto ni el reenvio, que son los pasos B-1 y B-4. |
| R-2 | El trigger de auditoria fires | **PASS** | Fila en `audit_logs`: `accion = 'crear'`, `entidad = 'movements'`, `entidad_id = 69d4612c...`, `actor = 46877040...`, con `after` completo y `stock_tras_movimiento_cantidad = 15`. |
| R-3 | Migraciones aplicadas | **PASS** | Las 13 existen; `v_stock_productos` y `v_movimientos` responden; las 4 filas de `roles`; `app_config` con 12 claves; bucket privado. |
| R-4 | Base de datos con RLS | **PASS** | `npm run audit:security` → 6/6 PASS, "RLS habilitado en todas las tablas — 16 tablas revisadas". |
| R-5 | La app aguanta HTTP plano (celular por IP) | **PASS** | `npm run check:http-plano` → 11 PASS, 0 FAIL, 1 WARN; y el build de produccion no tiene ninguna llamada desnuda a `randomUUID` ni a `navigator.clipboard`. Detalle en **1.5** y **H-3**. |
| R-5 | La foto es obligatoria en config | **PASS** | `require_movement_photo = true`. |
| R-6 | La foto no es publica | **PASS** | `movement-photos` con `public = false`. |
| R-7 | TTL de la URL firmada en el codigo | **PASS (estatico)** | `server/repositories/history.ts` → `createSignedUrl(objectPathDesdePath(foto.path), 120)`. 120 s, como pide el checklist. |
| R-8 | realtime declarado en migracion | **PASS (estatico)** | Migracion 11 anade `shopping_list` y `shopping_list_history` a `supabase_realtime` y les pone `replica identity full`. |
| R-9 | Indices declarados para las 4 paginaciones | **PASS (estatico)** | `movements_created_idx (created_at desc)`, `audit_logs_created_idx (created_at desc)`, `photos_movement_idx`, `shopping_list_estado_idx`. **Falta** el de `profiles (full_name, id)`: el listado de personas hace seq scan (ADR-016 §5). |

### 1.2 Bloqueado: falta acceso directo a Postgres

**No se pudo hacer `EXPLAIN ANALYZE`, ni leer `pg_indexes`, ni comprobar la
publicacion de realtime en caliente.** Motivo, medido:

| Se intento | Resultado |
|---|---|
| `psql` en el sistema | No instalado |
| `docker` | No instalado |
| `pg` (driver) | No instalado |
| Contrasena de la BD / `DATABASE_URL` | No esta en el repo ni en `.env.local` |
| `pg_indexes`, `pg_publication_tables`, `pg_class` por PostgREST | `Could not find the table ... in the schema cache` |
| `EXPLAIN` por PostgREST | No existe: PostgREST no ejecuta SQL arbitrario |

Lo unico que hay son las claves de la API (`.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY`. Con la `service_role` se lee **contenido** de
tablas, pero no el plan de ejecucion ni los catalogos.

> Ojo con un falso positivo facile: `select('*', { head: true })` sobre una tabla
> inexistente **devuelve "sin error"**. Hay que pedir filas de verdad para saber
> si la tabla existe. Asi se detecto que `pg_indexes` no era accesible.

**Como cerrarlo en 5 minutos:** pegar esto en el SQL Editor de Supabase. Todas
las consultas son de solo lectura. Los resultados se analizan en la seccion 1.4.

```sql
-- E-1 · Historial: cursor keyset sobre (created_at desc, id desc)
explain analyze
select * from public.v_movimientos
order by created_at desc, id desc
limit 26;

-- E-2 · Historial con filtro de fecha (el caso caro)
explain analyze
select * from public.v_movimientos
where created_at >= now() - interval '30 days'
order by created_at desc, id desc
limit 26;

-- E-3 · Inventario (la vista se recalcula en cada lectura)
explain analyze
select * from public.v_stock_productos
where is_active
order by producto
limit 200;

-- E-4 · Auditoria: cursor sobre audit_logs
explain analyze
select * from public.audit_logs
order by created_at desc, id desc
limit 51;

-- E-5 · Listado de personas: se espera seq scan (no hay indice)
explain analyze
select id, full_name, is_active from public.profiles
order by full_name, id
limit 26;

-- E-6 · Realtime: publicacion y replica identity, de verdad
select pt.pubname, pt.schemaname, pt.tablename
from pg_publication_tables pt
where pt.pubname = 'supabase_realtime';

select c.relname, c.relreplident
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('shopping_list', 'shopping_list_history', 'audit_logs');

-- E-7 · Indices que existen de verdad
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('movements', 'audit_logs', 'profiles', 'shopping_list')
order by tablename, indexname;
```

Que se espera:

- **E-1 / E-2** → que el plan use `movements_created_idx`. Si aparece
  `Seq Scan on v_movimientos`, la vista no es `pushdown`-amigable y con volumen
  hay que revisar. Con **1 solo movimiento** el planner va a elegir seq scan
  igualmente porque es mas barato: esto solo es concluyente con volumen real
  (ver seccion 4).
- **E-3** → la vista es `security_invoker` y agrega `movements`; se espera
  seq scan sobre `movements` + indice en `products`. Aceptable a este volumen.
- **E-4** → `audit_logs_created_idx`. **Aqui si se puede concluir ya**: hay 98
  filas y el indice existe.
- **E-5** → **seq scan esperado**. No hay indice en `profiles (full_name, id)`.
  Es la decision que ya se documento en ADR-016 §5; con 1 usuario es irrelevante.
- **E-6** → dos filas: `shopping_list` y `shopping_list_history`, y
  `relreplident = 'f'` (full) para las dos.
- **E-7** → los indices de R-9.

### 1.3 Cerrado: la subida a Storage verificada con token real

La 1.2 de la version anterior de este documento decia que la URL firmada no se
podia generar porque el bucket no tenia objetos. **Eso ya no es un bloqueo:**
`npm run check:storage` pide un token real a la API de Auth y ejecuta la
subida, la firma y el borrado con el cliente de SESION (nunca con
`service_role`), que es la unica forma de que la prueba signifique algo.

Resultado con la policy de la migracion 05, antes de aplicar la 14:

```
--- 3) Ruta CON el bucket dentro (la que generaba el codigo) ---
  resultado -> ERROR 403: new row violates row-level security policy
--- 4) Ruta canonica que exige la policy (sin el bucket) ---
  resultado -> 201, objeto creado
--- 5) Firma de la URL (mismo cliente de sesion) ---
  PASS  firmar y descargar — 200 y 70 bytes identicos al subido
  firmar con el prefijo de mas (como hacia el codigo antes): ERROR 404: Object not found
--- 6) Fila en public.photos con la ruta que usa la app ---
  PASS  insertar / leer / borrar la fila — created_by = el mismo usuario
--- 7) Borrado del objeto con el mismo cliente de sesion ---
  resultado -> eliminado
--- 8) Estado final ---
  raiz del bucket: (vacia) | objetos del movimiento: (ninguno) | fotos de #000001: 0
9 PASS · 0 FAIL · 0 WARN
```

Conclusiones:

1. El diagnostico de **H-1** queda confirmado con evidencia, no por deducción:
   el mismo token y el mismo cliente que rechazan una ruta y aceptan la otra.
2. **Segundo bug confirmado en la misma corrida:** firmar con `photos.path` tal
   cual daba `404 Object not found`. Aunque la subida hubiera funcionado, la foto
   no se habria visto nunca. Corregido con el mismo helper de rutas.
3. El camino completo queda probado con cliente de sesion: **subir → firmar →
   registrar la fila → leer → borrar la fila → borrar el objeto**. No queda
   rastro (0 objetos y 0 filas al terminar).
4. La **migracion 14 es/endurecimiento, no el arreglo**: con la 05 sola la ruta
   canonica ya sube, firma y borra bien. Aun asi hay que aplicarla, porque
   centraliza la regla en `movement_id_de_foto()` y rechaza por forma la variante
   rota.
5. El paso **B-0** (readjuntar la foto al `#000001`) y el **B-2** (la foto se ve
   en el historial) son la comprobacion de los puntos 1, 2 y 3 dentro de la app.

### 1.4 Pendiente: los resultados de E-1 a E-7

Los `EXPLAIN` de la 1.2 los pega quien administra el proyecto en el SQL Editor
de Supabase. **Cuando lleguen, se analizan aqui y se documentan en este mismo
archivo** (seccion 1.2, bajo "Que se espera"), con lo que confirmen o desmientan
las cuatro lineas de R-9. Hasta entonces no se da por buena ninguna conclusion
sobre el rendimiento del historial.

### 1.5 Cerrado: HTTP plano, la app aguanta `http://192.168.1.3:3000`

El celular entra por IP, que es un **contexto no seguro**: ahi
`crypto.randomUUID()` no existe y el formulario de movimientos se caia con
`TypeError` antes de pintar nada. `navigator.clipboard.writeText()` es peor,
porque no lanza error: el boton "Copiar" de la clave temporal no hacia nada y
nadie se enteraba. Detalle y criterios, en **ADR-020**.

```
$ npm run check:http-plano

--- 1) nuevoUuid() con crypto.randomUUID disponible ---
PASS  atajo nativo — 2723c870-8181-4c7b-b16e-a18ef859dee4
--- 2) nuevoUuid() sin crypto.randomUUID (contexto no seguro) · 2000 UUIDs ---
PASS  sin randomUUID genera UUID v4 valido — 2000 generados, ninguno invalido
PASS  sin randomUUID son distintos — 2000/2000 unicos
--- 3) nuevoUuid() sin crypto (navegador muy antiguo) ---
PASS  recurso de Math.random — 500 UUIDs v4 validos y distintos
WARN  entropia — Math.random no es aleatoriedad criptografica
--- 4) copiarAlPortapapeles sin contexto seguro ---
PASS  sin portapapeles devuelve false
PASS  sin portapapeles no deja nodos en el DOM
PASS  execCommand copia en HTTP plano
PASS  el textarea efimero se limpia
PASS  navigator.clipboard manda cuando existe
PASS  permiso denegado cae al camino antiguo
11 PASS · 0 FAIL · 1 WARN
```

El script importa los modulos **reales** y reproduce el entorno: a
`crypto.randomUUID` la pone a `undefined` sombreandola (no borrandola, que en
contexto no seguro no haria nada, porque la clave es heredada del prototipo) y
monta un `document`/`navigator` de mentira. Si alguien vuelve a llamar a la API
nativa, falla aqui y no en el celular de la tienda.

Como segunda red se audito el **build de produccion** (los 58 archivos de
`.next/static`), no el codigo fuente, porque un modulo puede estar bien y aun asi
quedar fuera del cliente:

| API | Archivos | Que es |
| --- | --- | --- |
| `randomUUID` | 1 | el `nuevoUuid()`, con su `typeof` intacto |
| `navigator.clipboard.writeText` | 1 | el `copiarAlPortapapeles()`, con su `typeof` y su `try/catch` |
| `execCommand` | 1 | el fallback de copiado |
| `clipboardData` | 2 | React DOM (`SyntheticEvent`), no la API |

Dato colateral que valida el patron: `supabase-js` trae su propio generador de
PKCE y hace lo mismo —comprueba `typeof`, y si no, cae a `Math.random()`.

**Lo que no cubre ninguna de las dos, y hay que hacer a mano:** el portapapeles
real de cada telefono. Algunos Android rechazan `writeText` sin lanzar error, y
eso solo se ve copiando de verdad. Por eso estan los pasos **A-3** y **J-1b** en
el guion, y hay que hacerlos **en el celular, por la IP**, no en el PC.

---

### 1.6 PENDIENTE: la migracion 15, y por que la 14 rompio la subida

El verificador de Storage es el que encontro el fallo, y ahora ademas lo explica.
Resultado actual, con la 14 aplicada:

```
--- 4) Subida: ruta canonica que exige la policy (sin el bucket) ---
FAIL  subida canonica — 403 new row violates row-level security policy
  -- diagnostico: que resuelve movement_id_de_foto("69d4.../verificacion-...png") --
  resultado -> null
  lectura: el helper NO resuelve la forma canonica ... Se corrige con la migracion 15.
3 PASS · 1 FAIL · 3 WARN
```

La llamada directa al helper, con la `service_role` y sin escribir nada, da la
sentencia en una tabla (**ADR-021**):

| Nombre del objeto | `movement_id_de_foto` | |
|---|---|---|
| `<uuid>/prueba.png` | `null` | canonica: **rota** |
| `<uuid>/sub/prueba.png` | el UUID | 2 carpetas |
| `<uuid>/sub/carpeta/prueba.png` | el UUID | 3 carpetas |
| `movement-photos/<uuid>/x.png` | `null` | rechazo previsto |

**Que hay que hacer**, en este orden:

1. Abrir el SQL Editor de Supabase y ejecutar el contenido de
   `supabase/migrations/20260101001400_15_storage_helper_fix.sql`. Es idempotente.
2. Si la consola muestra un error que empieza por **"Migracion 15: ..."**, es que
   **no** esta aplicada: la autocomprobacion fallo y la transaccion se deshizo
   entera. Nada queda a medias, que es justo para lo que esta.
3. Correr `npm run check:storage`: tiene que dar **9 PASS · 0 FAIL · 0 WARN**.
4. Solo entonces empezar el bloque **B** del guion.

Las 3 verificaciones bloqueadas de la 1.2 (los `EXPLAIN` de E-1 a E-7) siguen
pendientes y son independientes de esto.

---

## 2. Guion de pruebas

> **Antes de empezar: aplicar la migracion 15** (seccion 1.6, **H-4**). Mientras
> no este aplicada, los pasos **B-0** y **B-1** fallan con `new row violates
> row-level security policy` porque toda subida de fotos esta bloqueada. El sintoma
> es identico al bug de ADR-019, asi que conviene aplicar la 15 **antes** de
> empezar, no cuando falle.

Preparacion: tener el PC en `/login` y el celular en
`http://192.168.1.3:3000/login`, ambos en la misma red.

---

### A. Acceso

| # | Paso | Resultado esperado | |
|---|---|---|---|
| A-1 | `admin` entra a `/login` con su correo y clave. | Entra al inicio. Salen los avisos "Hola, admin" y el menu con el nombre. | [ ] |
| A-2 | `/admin/auditoria` tiene 98 eventos y la barra muestra tu entrada y tu salida. | Barra con "Auditoria"; el evento `login` mas reciente con tu correo. | [ ] |
| A-3 | En el **celular, por la IP** (`http://192.168.1.3:3000`), entra a `/movimientos/entrada`. | El formulario **pinta entero**: producto, cantidad, foto, motivo, resumen. Si saliera en blanco o con un error, es que `crypto.randomUUID` volvio a usarse en cliente: `FAIL`, se para. Este es el fix de ADR-020. | [ ] |
| A-4 | Con el movil, entra **por primera vez con una cuenta nueva** (la del paso J-1, si ya existe; si no, espera a J-1). | Se abre el carrusel de bienvenida solo, la primera vez. | [ ] |
| A-5 | Toca **"Saltar"** (o **"Entendido"**). | Se cierra. **No vuelve** a salir ni recargando la pagina. | [ ] |
| A-6 | Abre el menu de la cuenta y toca **"Ver tour de nuevo"**. | Se abre el carrusel aunque ya se hubiera cerrado. | [ ] |
| A-7 | Cierra el carrusel y entra a `/bienvenida`. | El recorrido se puede leer sin scrolls: pasos, ayuda y el footer. | [ ] |

---

### B. Entrada con foto (ACEITE, unidad `l`)

> Este bloque es la **prueba del bug de la Fase 11** y de la foto que sobrevive al
> reenvio. Es el mas importante del guion.

| # | Paso | Resultado esperado | |
|---|---|---|---|
| **B-0** | Abre `/movimientos` -> toca `#000001` (ACEITE, entrada de 20 l, la que quedo sin foto). Elige **cualquier foto real** de tu telefono y toca **"Adjuntar foto"**. | Aviso **"Foto adjuntada a #000001"**, y la foto aparece en la seccion de fotografia. **Este es el paso que verifica el fix de H-1.** El boton solo aparece si el movimiento no tiene foto y no esta anulado. **Requiere la migracion 15 aplicada** (H-4). | [ ] |
| B-1 | Entrar -> **"Recibir mercancia"**. Elige ACEITE. Escribe **10** en Cantidad. Adjunta una **foto** (cualquier `.jpg` de tu telefono). Pon el motivo y **Guardar la entrada**. | Vuelve al inicio con el aviso "Movimiento #000002 registrado." **Sin ningun aviso de "la foto no se pudo adjuntar"**: ese era el fallo. En Inventario, ACEITE pasa a `cantidad = 25`. | [ ] |
| B-2 | Abre `/historial`. | La primera fila es `#000002`, tipo entrada, con tu nombre. Al abrirla, la **foto se ve** y el resto de datos cuadran. | [ ] |
| B-3 | **Vuelve al detalle de `#000001` y comprueba que su foto se ve.** | La foto se ve. Si `#000001` ya tiene foto de B-0, el boton "Adjuntar foto" **no** aparece: solo se ofrece cuando no hay ninguna. | [ ] |
| B-4 | **Con la foto ya adjuntada**, escribe en Cantidad un numero invalido (por ejemplo `abc`) y pulsa Guardar. | Falla la validacion. **La foto sigue ahi**: el mensaje de arriba pasa a "Foto recuperada, se enviará otra vez" y la miniatura no desaparece. Corrige la cantidad y guarda: esta vez **si** entra, con foto. Prueba directa del fix de la foto. | [ ] |
| B-5 | En el paso 3, pon el motivo pero **deja vacio** Observaciones y guarda. | **Debe** fallar: `require_movement_reason = true`. Si entra, hay un fallo. | [ ] |

> B-4 es el paso que valida la Fase 11. Si la foto desaparece, **para ahi** y
> reportalo: es un `FAIL` y se corrige antes de seguir.
>
> B-0 y B-1 juntos son la prueba del fix de H-1: B-0 readjunta una foto en un
> movimiento ya escrito, y B-1 comprueba que un movimiento **nuevo** ya sube la
> foto sin quejarse. Si B-1 vuelve a decir "new row violates row-level security
> policy", es un `FAIL` y se reporta tal cual.

---

### C. Inventario y stock bajo minimo

| # | Paso | Resultado esperado | |
|---|---|---|---|
| C-1 | Abre `/inventario`. | ACEITE: `cantidad = 25`, minimo 20, **estado OK** (sin alerta). | [ ] |
| C-2 | En `< 375 px`, el mismo inventario. | Se ve en **tarjetas**, no en tabla, y sin scroll horizontal. | [ ] |
| C-3 | Mira la fila de un producto por debajo del minimo (con el snapshot actual, ACEITE ya lo esta si no hiciste B-1). | Etiqueta ambar **"⚠️ Inventario bajo"**, con el texto "Inventario bajo: por debajo del minimo configurado." | [ ] |
| C-4 | Un producto en cero. | Etiqueta roja **"⛔ Sin stock"**. | [ ] |

> Si B-1 se hizo, ACEITE quedo en 25 y **C-3 no tiene a quien aplicarse**:
> usa un producto de conteo, o haz una salida en el bloque D para volver a bajar
> del minimo. El paso D-2 es la via natural.

---

### D. Salida que deja el stock bajo minimo

| # | Paso | Resultado esperado | |
|---|---|---|---|
| D-1 | Entrar -> **"Sacar mercancia"**. ACEITE, **8** (deja 25 - 8 = 17, por debajo de 20). Foto. Motivo. Guardar. | Se registra. Inventario: `cantidad = 17`, estado **"⚠️ Inventario bajo"**. | [ ] |
| D-2 | Intenta sacar **50** de ACEITE. | **NO** se guarda. "Inventario insuficiente. Disponible: 17 l". `allow_negative_stock = false`. | [ ] |
| D-3 | Intenta sacar **0**. | No se guarda; avisa de que la cantidad debe ser mayor que 0. | [ ] |
| D-4 | En el paso 3 del ajuste, pon el motivo y **deja vacio** Observaciones. Guarda. | **Guarda.** La observacion es opcional; el motivo es obligatorio. Confirma la regla de H-2. | [ ] |

---

### E. Ajuste

| # | Paso | Resultado esperado | |
|---|---|---|---|
| E-1 | Entrar -> **"Ajustar inventario"**. ACEITE. Cantidad `-2` (puedes poner el menos). Foto. | Se registra. Inventario: `cantidad = 15`. En Historial aparece tipo **Ajuste**. | [ ] |
| E-2 | Ajusta `0`. | No se guarda: "En un ajuste la cantidad no puede ser 0". | [ ] |
| E-3 | Ajusta `+3` con motivo "produccion". | Se registra y el stock sube a 18. Confirma que el signo funciona en los dos sentidos. | [ ] |
| E-4 | Los movimientos de ajuste salen tachados o marcados como ajustes, distintos de una entrada. | Se distinguen a simple vista en `/historial`. | [ ] |

---

### F. Anulacion

| # | Paso | Resultado esperado | |
|---|---|---|---|
| F-1 | Abre `/movimientos` y elige el ultimo (el ajuste `+3`). Toca anular. | Se pide motivo con las 5 opciones (Error de captura, Registro duplicado, Devolucion, Ajuste de inventario, Otro). | [ ] |
| F-2 | Anulalo con "Error de captura". | Vuelve con aviso. El inventario **vuelve al estado anterior**: el `+3` deja de contar (18 -> 15). | [ ] |
| F-3 | En `/historial`. | El movimiento anulado aparece con el sello **"Anulado"**, tachado y más apagado. El stock no lo cuenta. | [ ] |
| F-4 | Abre el detalle del anulado y mira `/admin/auditoria`. | La anulacion sale como evento con el antes y el despues. | [ ] |
| F-5 | Intenta anular un movimiento ya anulado. | No se deja. | [ ] |

---

### G. Compras, con realtime entre PC y celular

> Deja el **PC** en `/compras` y el **celular** en `/compras`, a la vez.

| # | Paso | Resultado esperado | |
|---|---|---|---|
| G-1 | En el PC, **"+ Pendiente"**: elige **ACEITE** del catalogo, cantidad 6. | Se agrega. Estado **Pendiente**. | [ ] |
| G-2 | En el celular, sin recargar. | **El pendiente aparece solo.** Si hay que recargar, el realtime **no** funciona: es un FAIL importante. | [ ] |
| G-3 | En el celular, pulsa **Tomar**. En el PC, sin recargar. | El estado cambia a **En proceso** en las dos pantallas. | [ ] |
| G-4 | En el PC, pulsa **Comprado** y pon la cantidad comprada y el precio. | Estado **Comprado**, con el valor. El celular se actualiza. | [ ] |
| G-5 | En el celular, pulsa **Descartado**. | Estado **Descartado**. El PC se actualiza. | [ ] |
| G-6 | En el PC, agrega un pendiente con **texto libre** (sin producto, solo descripcion). | Se agrega con el nombre escrito. | [ ] |
| G-7 | Abre el detalle del pendiente descartado. | Sale el historial de cambios de estado (quien y cuando). | [ ] |

---

### H. Historial

| # | Paso | Resultado esperado | |
|---|---|---|---|
| H-1 | En `/historial`, filtra por **hoy**. | Solo los de hoy. Las fechas salen en hora de Guayaquil. | [ ] |
| H-2 | Filtra por tipo **Salida**. | Solo salidas. Combina fecha + tipo: acota. | [ ] |
| H-3 | Filtra por producto (ACEITE) y por responsable. | Acota a ese producto / esa persona. | [ ] |
| H-4 | Abre el detalle de un movimiento **con foto**. | La foto se ve. **Espera mas de 2 minutos** y recarga: si la foto sigue saliendo, la firma no caducaba como debe (la URL firmada dura 120 s y el codigo la pide cada vez, asi que **debe** seguir viéndose). Si despues de 2 minutos **no** se ve, es FAIL. | [ ] |
| H-5 | Con los filtros puestos, copia la URL y abrla en el celular. | Se ve la misma lista: los filtros viajan en la URL. | [ ] |
| H-6 | **Cargar mas** (necesita volumen; ver seccion 4). | Sin repetir ni saltar filas. | [ ] |

---

### I. Auditoria

| # | Paso | Resultado esperado | |
|---|---|---|---|
| I-1 | En `/admin/auditoria`, filtra por hoy. | Solo los de hoy. | [ ] |
| I-2 | Busca el evento `actualizar` de un producto y abrelo. | Sale el **antes → despues** de cada campo. | [ ] |
| I-3 | Edita de verdad un producto (cambiale el nombre, guarda) y mira la auditoria. | Evento nuevo `actualizar` con el nombre viejo y el nuevo. | [ ] |
| I-4 | Filtra por entidad **Movimiento** y por responsable. | Acota a los movimientos de esa persona. | [ ] |
| I-5 | Intenta editar o borrar un evento. | No se puede. La bitacora es de solo escribir. | [ ] |

---

### J. Personas (Fase 10)

| # | Paso | Resultado esperado | |
|---|---|---|---|
| J-1 | `/admin/usuarios` -> **Añadir persona**: nombre, correo nuevo (usa uno de pruebas, p. ej. `prueba.temporal@`), telefono, rol **Operador**. | Aparece la **contrasena temporal** una sola vez, con "Copiar la clave". **No** esta en la URL. Anotala. | [ ] |
| J-1b | En el **celular, por la IP**, repite J-1 y pulsa **"Copiar la clave"**. Despega la clave en el campo del correo, en un chat o en cualquier sitio. | Pega la clave **entera**. Si no pega nada, el portapapeles fallo en silencio: es justo el fallo de ADR-020. Si tampoco avisa, `FAIL` (deberia decir "copiala a mano"). | [ ] |
| J-2 | Con ese correo y esa clave, entra desde el celular. | Entra, y la app lo manda a `/cambiar-password` antes de dejarlo usar nada. | [ ] |
| J-3 | En su ficha, cambiale el rol a **Supervisor**. | "Guardado correctamente". Sin volver a entrar, su sesion ya tiene mas permisos. | [ ] |
| J-4 | Vuelve a **Operador** y luego **desactivalo** (pasa por el modal). | El modal avisa que no se borra nada. Queda **Inactivo**. Al intentar entrar con su clave, rebota. | [ ] |
| J-5 | **Cerrojo 1:** con tu sesion de admin, intenta desactivar **tu propia** cuenta. | El boton sale deshabilitado con la explicacion. Si se deja pulsar y guarda, es FAIL. | [ ] |
| J-6 | **Cerrojo 2:** en tu propia ficha, intenta cambiarte el rol a Operador. | Te dice que no puedes y **el modal/pantalla queda ahi**. No se guarda. | [ ] |
| J-7 | **Cerrojo 3:** crea un **segundo admin** y en su ficha intenta quitarle el rol admin. | Con dos admins, **si** deja (queda uno). Con uno solo, debe rebotar. | [ ] |
| J-8 | **Cerrojo 4:** con un unico admin, intenta desactivar a otro admin. | Rebota: "Debe quedar al menos un administrador activo." | [ ] |
| J-9 | Ficha -> **Cambiar su contrasena**. | Clave nueva temporal. La anterior deja de servir al instante. | [ ] |
| J-10 | Busca el evento del reset en `/admin/auditoria`. | Evento `cambio_password`. | [ ] |
| J-11 | `supervisor`, `operador` y `consulta` (celular, con la cuenta de J-1). | `/admin/usuarios` y `/admin/auditoria` dan **/no-autorizado**. La barra **no** muestra "Personas". | [ ] |
| J-12 | Borra la cuenta de prueba de J-1 (desactiva y ya esta) y **anota** que queda en la BD. | Ver seccion 4: la limpieza necesita aprobacion. | [ ] |

---

### K. Accesibilidad

| # | Paso | Resultado esperado | |
|---|---|---|---|
| K-1 | En `/login`, `Tab` repetido. | El foco se ve en cada control (contorno verde). El **primer** `Tab` da al enlace "Saltar al contenido" en las pantallas de la app. | [ ] |
| K-2 | En `/movimientos/entrada`, `Tab` de principio a fin. | Se puede recorrer **todo** sin raton: producto, cantidad, foto, motivo, resumen. | [ ] |
| K-3 | Completa el paso 1 **solo con teclado**. | Se puede. | [ ] |
| K-4 | En el modal de desactivar, `Esc`. | Cierra sin cambiar nada. `Tab` no se sale del modal. | [ ] |
| K-5 | Zoom del navegador al **200%** en `/inventario` y `/movimientos/entrada`. | Sin scroll horizontal ni texto cortado. | [ ] |
| K-6 | Viewport a **360x740** (movil pequeno) en las 6 pantallas principales. | Sin scroll horizontal. | [ ] |
| K-7 | Activa el **modo oscuro** del navegador (Windows: Personalizacion > Colores > Modo oscuro) y mira las 6 pantallas. | Los textos se leen igual: la app no queda con texto oscuro sobre fondo oscuro ni al reves. | [ ] |
| K-8 | Con el led apagado, mira los estados: Activo/Inactivo, OK/Bajo/Sin stock, Pendiente/En proceso/Comprado/Descartado. | Se distinguen **por el texto**, no solo por el color. | [ ] |

---

### L. Visor de fotos y compacto movil (Fase 12B)

> Este bloque necesita una foto de verdad: usa la del paso **B-0** o **B-1**. Y
> hay que hacerlo **en el celular**: el zoom con pellizco y el guardado no se
> pueden probar en el PC.

| # | Paso | Resultado esperado | |
|---|---|---|---|
| L-1 | En `/historial`, toca el **contador de fotos** de un movimiento con foto. | Se abre a pantalla completa con la foto. El listado **no** descarga imagenes: solo se pide al abrir. | [ ] |
| L-2 | **Pellizca** la foto con dos dedos. | Amplia y reduce con el gesto, sin que la pagina se mueva debajo. | [ ] |
| L-3 | Con la foto ampliada, **desliza un dedo**. | La foto se mueve a los lados y arriba: hay area desplazable de verdad. | [ ] |
| L-4 | Toca dos veces la foto. | Alterna entre tamaño completo y ampliado. | [ ] |
| L-5 | Toca **fuera** de la foto. | Cierra. | [ ] |
| L-6 | **Desliza hacia abajo** desde la barra superior. | Cierra. | [ ] |
| L-7 | Con el visor abierto, pulsa `Esc` (en el PC) y despues `Tab` varias veces. | Cierra con `Esc`. Con el visor abierto el foco **no sale** del modal. | [ ] |
| L-8 | Toca **"Guardar"** (o "Descargar foto" en PC). | Se abre la imagen. En el celular se guarda manteniendo pulsada. El archivo se llama `movimiento-#00000X-AAAA-MM-DD.jpg`. | [ ] |
| L-9 | Deja el visor abierto **mas de 5 minutos** y mira. | Aparece **"Recargar imagen"**. Al pulsarla, la foto vuelve. | [ ] |
| L-10 | En `/movimientos/[id]`, abre una foto desde la miniatura. | Se abre el visor, en la foto que tocaste (no siempre la primera). | [ ] |
| L-11 | En el celular, mira las pantallas principales: inicio, inventario, historial, compras, movimientos. | Todo se ve **mas compacto**: h1 de 22px, texto de 15px, tarjetas con menos aire. Los botones grandes de entrada/salida/inventario van **de dos en dos**. | [ ] |
| L-12 | Mira la **barra de abajo**. | Los cuatro destinos de uso diario, con el activo resaltado. Se reaches con el pulgar sin desplazar la pagina. | [ ] |
| L-13 | Toca **"Mas"**. | Panel con el resto de pantallas. Se cierra con `Esc` o tocando fuera. | [ ] |
| L-14 | Baja hasta el final de una lista larga en el celular. | La ultima fila **no** queda debajo de la barra de abajo: se lee y se toca. | [ ] |
| L-15 | En el **PC** (o con la ventana a 900px o mas), recorre las mismas pantallas. | El diseño **sigue igual que antes**: barra de secciones arriba, texto de 17px, tarjetas amplias. | [ ] |

> L-2 y L-3 son los que de verdad no se pueden cerrar sin el telefono: si el
> pellizco no responde o la pagina se mueve por debajo, es `FAIL` y se para.

---

## 3. Resumen

| Bloque | Pasos | PASS | FAIL |
|---|---|---|---|
| A. Acceso | 7 | | |
| B. Entrada con foto | 6 | | |
| C. Inventario | 4 | | |
| D. Salida | 4 | | |
| E. Ajuste | 4 | | |
| F. Anulacion | 5 | | |
| G. Compras + realtime | 7 | | |
| H. Historial | 6 | | |
| I. Auditoria | 5 | | |
| J. Personas | 13 | | |
| K. Accesibilidad | 8 | | |
| L. Visor + compacto | 15 | | |
| **Total** | **84** | | |

Al terminar: cambiar los `[ ]` del README por `[x]` en lo que paso, y dejar
anotado en este documento cada `FAIL` con su pasos y su foto.

---

## 4. Plan de volumen (APROBADO — no ejecutar hasta que A-F pase completo)

Los pasos **H-6** ("Cargar mas" con volumen) y las conclusiones de los `EXPLAIN`
de la seccion 1.2 necesitan **datos de mas**. La regla dura es no ensuciar la
base, asi que esto se propone y se espera.

> **Orden de ejecucion:** primero el guion manual **A-F completo**, y solo
> despues el plan de volumen. Si el guion finds a `FAIL`, se corrige antes de
> generar volumen: multiplicar un fallo por 60 movimientos no arregla nada y si
> llena la bitacora de ruido.

### Respuestas ya decididas

| Pregunta | Decision |
|---|---|
| ¿Como se generan los movimientos? | **Desde la app**, en el flujo normal, con foto incluida. No por SQL ni por RPC. |
| ¿El producto "PRUEBA TEMPORAL"? | Se queda **desactivado** al final (`is_active = false`). No se borra. |
| ¿Los usuarios de prueba del bloque J? | Se quedan **desactivados** (`is_active = false`). No se borran. |

Ninguna de las dos cosas se borra por una razon concreta, no por prudencia vaga:
el historial depende de ellas. `movements.product_id` es `on delete restrict` y
`photos.movement_id` tambien, asi que borrar el producto dejaria movimientos
huerfanos; y `profiles.id` es la FK de `photos.created_by` y de `audit_logs.actor`.
Un producto desactivado y una persona desactivada **no aparecen** en los
selectores de la app, pero su historia se conserva y se puede consultar.

### Lo que hace falta

- **~60 movimientos** para que "Cargar mas" tenga varias paginas (la pagina es
  de 25). Con 60 se ven tres paginas.
- **~120 filas de auditoria** para el mismo motivo. Ya hay 98.
- Idealmente **500-1000** para que el `EXPLAIN` del historial sea concluyente:
  por debajo de eso el planner elige seq scan porque le sale mas barato, y el
  resultado no dice nada sobre el indice.

### Propuesta: producto "PRUEBA TEMPORAL" + limpieza

**No son datos basura si se_clean al final, y se mueven por la RPC, no por
SQL suelto.** La idea es apoyarse en las reglas que ya existen:

1. Crear **un** producto `PRUEBA TEMPORAL` (mismo patron que ACEITE:
   `control_mode = 'cantidad'`, `stock_minimo = 0`).
2. Registrar los ~60 movimientos **desde la app**, en el flujo normal (con foto
   incluida), apuntando todos a ese producto. Cada uno queda auditado como
   cualquier otro.
3. Al terminar:
   - **Anular** los 60 desde la app (o por la RPC `anular_movimiento`). Un
     movimiento anulado **no cuenta para el stock**, asi que el inventario queda
     como estaba.
   - **Desactivar** el producto PRUEBA (`is_active = false`), no borrarlo: el
     historial depende de el (`ON DELETE RESTRICT`).
4. Lo que queda son filas legitimas, auditadas y coherentes.

**Ventaja:** cero `INSERT`/`DELETE` a mano, cero SQL que se salga del modelo, y
las fotos se suben al bucket de verdad (que es lo que hay que probar).

**Lo que NO haria:** `insert` masivo con SQL, `truncate`, o borrar
`movements` a mano. El trigger de inmutabilidad (ADR-003) lo impide, y saltarselo
deja la base incoherente con la bitacora.