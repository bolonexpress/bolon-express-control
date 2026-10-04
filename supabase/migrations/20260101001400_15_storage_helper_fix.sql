-- =============================================================================
-- BOLON EXPRESS · Migracion 15 · Correccion del helper de rutas de foto
--
-- CONTEXTO (ADR-019 y ADR-021). La migracion 14 creo
-- `public.movement_id_de_foto(p_nombre text)` para resolver el movimiento desde
-- el nombre del objeto en un solo sitio. Se aplico en el proyecto con un fallo:
-- la guarda de forma pedia **dos** carpetas.
--
--   when coalesce(array_length(carpetas, 1), 0) < 2 then null
--
-- `storage.foldername()` devuelve **solo las carpetas y excluye el nombre del
-- archivo**. Para la forma canonica `<movement_id>/<archivo>` el array tiene
-- **un** elemento, no dos, asi que la guarda devolvia `null` para toda subida
-- legitima y las tres policies rechazaban el objeto con 403. En otras palabras:
-- la migracion 14 arreglo el diagnostico pero **rompio la subida de fotos**, que
-- es justo lo que paso a ser imposible de probar.
--
-- EVIDENCIA (llamada directa a la funcion ya aplicada, key de service_role):
--
--   movement_id_de_foto('69d4.../prueba.png')              => null   <- canonica, rota
--   movement_id_de_foto('69d4.../sub/prueba.png')          => 69d4...  (2 carpetas)
--   movement_id_de_foto('69d4.../sub/carpeta/prueba.png')  => 69d4...  (3 carpetas)
--   movement_id_de_foto('movement-photos/69d4.../x.png')   => null   (rechazo previsto)
--
-- `npm run check:storage` paso de 9 PASS a "3 PASS · 1 FAIL" en cuanto la 14 se
-- aplico: el paso 4 (subida canonica) devolvio 403.
--
-- QUE HACE ESTA MIGRACION. Solo `create or replace` de la funcion, con la guarda
-- en `< 1`. **No toca las policies**: `create or replace` conserva la firma, y las
-- policies la llaman por nombre, asi que en cuanto el cuerpo es el correcto
-- empiezan a evaluar bien sin recrearlas. Tampoco hace falta volver a dar el
-- `grant`: `create or replace` conserva los privilegios existentes.
--
-- El archivo de la migracion 14 tambien quedo corregido en el repo, para que una
-- instalacion nueva no pase por el mismo estado roto. Es idempotente: se puede
-- aplicar las veces que haga falta, y no modifica datos ni objetos del bucket.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. El helper, con la guarda correcta
-- ---------------------------------------------------------------------------
create or replace function public.movement_id_de_foto(p_nombre text)
returns uuid
language sql
stable
strict
set search_path = public, pg_temp
as $$
  with partes as (
    select storage.foldername(p_nombre) as carpetas
  )
  select case
    -- Forma NO canonica: el bucket repetido dentro del nombre (ADR-019).
    when p_nombre like 'movement-photos/%' then null
    -- Una carpeta basta: la del movimiento. `foldername()` excluye el archivo.
    when coalesce(array_length(carpetas, 1), 0) < 1 then null
    -- El primer segmento tiene que ser un UUID, y se valida antes de castear:
    -- un `::uuid` invalido lanzaria excepcion, y dentro de una policy eso es un
    -- 500 en vez de un 403 limpio.
    when carpetas[1] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then null
    else carpetas[1]::uuid
  end
  from partes
$$;

comment on function public.movement_id_de_foto(text) is
  'UUID del movimiento al que pertenece un objeto del bucket movement-photos, o null si el nombre no tiene la forma canonica <movement_id>/<archivo>. El nombre del objeto va SIN el bucket; public.photos.path si lo lleva (ver photos_path_movimiento).';

-- ---------------------------------------------------------------------------
-- 2. Autocomprobacion: si la funcion sigue rota, la migracion ABORTA
-- ---------------------------------------------------------------------------
-- Se ejecuta aqui mismo, en la misma transaccion, con un movimiento real del
-- proyecto (#000001). Si el helper no devuelve su UUID, no hay forma honesta de
-- seguir: se levanta excepcion y **no** se aplica nada. Es preferible a dejar
-- aplicada una migracion que parece correcta y rompe la subida de fotos.
--
-- El UUID es el del movimiento; el archivo es ficticio porque la funcion solo
-- parsea el nombre, no toca `movements`.

do $$
declare
  v_movimiento constant uuid := '69d4612c-1a8f-498f-8c63-e64b9d34f759';
  v_obtenido uuid;
begin
  v_obtenido := public.movement_id_de_foto(v_movimiento::text || '/autocomprobacion.png');

  if v_obtenido is distinct from v_movimiento then
    raise exception
      'Migracion 15: movement_id_de_foto no resuelve la forma canonica <movement_id>/<archivo> (devolvio %). La subida de fotos seguiria fallando con 403. Revisa la guarda de array_length: foldername() excluye el nombre del archivo, asi que la forma canonica tiene UNA carpeta, no dos.',
      coalesce(v_obtenido::text, 'null');
  end if;

  -- La forma con el bucket dentro tiene que seguir rechazandose: es el testejo
  -- del diagnostico del ADR-019.
  if public.movement_id_de_foto('movement-photos/' || v_movimiento::text || '/x.png') is not null then
    raise exception
      'Migracion 15: movement_id_de_foto acepta la forma con el bucket dentro del nombre. Se perdio el rechazo por forma del ADR-019.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Aviso por objetos que quedaron con la forma antigua
-- ---------------------------------------------------------------------------
-- Se avisa, no se borra: borrar un objeto es decision de quien administra el
-- proyecto. Con el helper corregido, un objeto con el bucket dentro es
-- ilegible (no tiene movimiento al que atribuirse) pero sigue ocupando sitio.

do $$
declare
  v_cantidad integer;
begin
  select count(*) into v_cantidad
  from storage.objects o
  where o.bucket_id = 'movement-photos'
    and public.movement_id_de_foto(o.name) is null;

  if v_cantidad > 0 then
    raise warning
      'Migracion 15: % objeto(s) de movement-photos tienen un nombre no canonico (con el bucket dentro o sin movimiento). No son legibles y no tienen fila en public.photos: revisarlos y borrarlos a mano si son basura.',
      v_cantidad;
  end if;
end;
$$;
