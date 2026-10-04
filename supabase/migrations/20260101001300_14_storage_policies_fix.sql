-- =============================================================================
-- BOLON EXPRESS · Migracion 14 · Policies de Storage alineadas con la ruta real
--
-- CONTEXTO (ADR-019). El movimiento #000001 se registro sin foto y el aviso
-- fue "new row violates row-level security policy". No era la puerta de
-- obligatoriedad ni el bucket inexistente: era el nombre del objeto.
--
-- Doble convencion, dosAclaves distintas:
--
--   · `storage.objects.name`   -> RELATIVO AL BUCKET: `<movement_id>/<archivo>`
--   · `public.photos.path`     -> CON prefijo de bucket: `movement-photos/<movement_id>/<archivo>`
--
-- La segunda la fija el CHECK `photos_path_movimiento` (migracion 01), que
-- exige `split_part(path,'/',1) = 'movement-photos'` y 36 caracteres en el
-- segmento 2. `public.photo_object_path()` existe justo para quitar el
-- prefijo antes de firmar.
--
-- La migracion 05 leia el movimiento con `(storage.foldername(name))[1]`, que
-- para el nombre canonico devuelve el UUID. `adjuntarFotoMovimiento()` en cambio
-- pasaba el nombre CON el bucket dentro, con lo que `name` quedaba
-- `movement-photos/<movement_id>/<archivo>` y `foldername(name)[1]` devolvia la
-- cadena `"movement-photos"`. El `exists (select 1 from movements m where
-- m.id::text = 'movement-photos')` era falso y la policy rechazaba la fila con
-- 403. Verificado en runtime con `scripts/storage-check.mjs`: la ruta con el
-- bucket dentro da 403 y la canonica da 201.
--
-- QUE HACE ESTA MIGRACION. No reescribe la 05 (ya aplicada en el proyecto):
--
-- 1. `public.movement_id_de_foto(nombre text)` resuelve el movimiento desde el
--    nombre del objeto en UN solo sitio. Rechaza por forma el nombre con el
--    bucket dentro, en vez de dejarlo pasar a un `exists` que nunca encuentra.
-- 2. Las tres policies (select/insert/delete) se recrean sobre ese helper, con
--    la misma regla y los mismos permisos que tenian: no se abre nada.
-- 3. La de INSERT exige ademas `auth.uid()` no nulo: documenta y hace explicito
--    que la subida va con el cliente de SESION. Con `service_role` la RLS se
--    salta (BYPASSRLS) y `auth.uid()` es null, asi que el objeto quedaria sin
--    dueno; el trigger `objects_update_owner` de Supabase tampoco tendria a quien
--    atribuirlo.
-- 4. Avisa (no borra) si quedaran objetos con la forma antigua.
--
-- Idempotente: se puede aplicar las veces que haga falta. No toca datos de
-- negocio ni objetos del bucket.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Del nombre del objeto al movimiento, en un solo sitio
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
    -- Forma NO canonica: el bucket repetido dentro del nombre. Se rechaza por
    -- forma (y no por un `exists` que fallaria igual) para que el error sea
    -- inequivoco si alguien vuelve a construir la ruta asi.
    when p_nombre like 'movement-photos/%' then null
    -- Se necesita al menos UNA carpeta: la del movimiento. `storage.foldername()`
    -- devuelve SOLO las carpetas y excluye el nombre del archivo, asi que para la
    -- forma canonica `<movement_id>/<archivo>` el array tiene un unico elemento.
    -- (Exigir dos fue el error de la primera version de esta migracion, que
    -- rechazo toda subida legitima; corregido aqui y en la migracion 15.)
    when coalesce(array_length(carpetas, 1), 0) < 1 then null
    -- El primer segmento tiene que ser un UUID. Se valida antes de castear:
    -- un `::uuid` sobre un texto que no lo es lanza excepcion, y dentro de una
    -- policy eso se traduciria en un error 500 en vez de un 403 limpio.
    when carpetas[1] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then null
    else carpetas[1]::uuid
  end
  from partes
$$;

comment on function public.movement_id_de_foto(text) is
  'UUID del movimiento al que pertenece un objeto del bucket movement-photos, o null si el nombre no tiene la forma canonica <movement_id>/<archivo>. El nombre del objeto va SIN el bucket; public.photos.path si lo lleva (ver photos_path_movimiento).';

-- La migracion 04 dejo `revoke execute on all functions ... from public` y el
-- `alter default privileges` equivalente, asi que `authenticated` NO hereda el
-- permiso. Sin este grant la policy falla con "permission denied for function
-- movement_id_de_foto" en vez de con un 403: las policies se evaluan con los
-- privilegios de quien las invoca. Se revoca de `public`/`anon` primero por
-- coherencia con la migracion 04: la funcion existe para las policies, no para
-- que la llame cualquiera.
revoke execute on function public.movement_id_de_foto(text) from public, anon;
grant execute on function public.movement_id_de_foto(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Politicas recreadas sobre el helper
-- ---------------------------------------------------------------------------

drop policy if exists movement_photos_select on storage.objects;
drop policy if exists movement_photos_insert on storage.objects;
drop policy if exists movement_photos_delete on storage.objects;

-- La foto solo existe si su movimiento existe y NO esta anulado.
create policy movement_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'movement-photos'
    and (select public.has_permission('photos:read'))
    and (select public.has_permission('movements:read'))
    and exists (
      select 1
      from public.movements m
      where m.id = (select public.movement_id_de_foto(name))
        and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
    )
  );

create policy movement_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'movement-photos'
    -- Sesion real: la subida la hace el operador, no un proceso de servidor.
    and (select auth.uid()) is not null
    and (select public.has_permission('photos:write'))
    and (select public.has_permission('movements:write'))
    and exists (
      select 1
      from public.movements m
      where m.id = (select public.movement_id_de_foto(name))
        and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
    )
  );

-- Sin politica de UPDATE: una foto no se renombra ni se mueve de movimiento.
-- El borrado del objeto lo hace quien subio la foto o quien tenga photos:delete.
create policy movement_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'movement-photos'
    and (
      exists (
        select 1
        from public.photos f
        where f.path = 'movement-photos/' || name
          and f.created_by = (select auth.uid())
      )
      or (select public.has_permission('photos:delete'))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Aviso por objetos que quedaron con la forma antigua
-- ---------------------------------------------------------------------------
-- No se borran: borrar un objeto es decision de quien administra el proyecto.
-- Con la policy vigente ya son ilegibles (la policy de SELECT tambien exige el
-- helper), asi que un aviso basta para que se decida con calma.

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
      'Migracion 14: % objeto(s) de movement-photos tienen un nombre no canonico (con el bucket dentro o sin movimiento). No son legibles y no tienen fila en public.photos: revisarlos y borrarlos a mano si son basura.',
      v_cantidad;
  end if;
end;
$$;