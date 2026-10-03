-- =============================================================================
-- BOLON EXPRESS · Migracion 05 · Storage privado (bucket de fotos de movimiento)
-- Convencion de ruta del objeto: <movement_id>/<uuid>.<ext>
-- La columna photos.path guarda el prefijo del bucket:
--   movement-photos/<movement_id>/<uuid>.<ext>
-- Al firmar la URL, quitar el bucket con public.photo_object_path(path).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'movement-photos',
  'movement-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin politica para anon ni para lectura anonima: el bucket es privado y
-- ningun rol puede leer objetos sin pasar por movement_photos_select.

-- La foto solo existe si su movimiento existe y NO esta anulado.
create policy movement_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'movement-photos'
    and (select public.has_permission('photos:read'))
    and exists (
      select 1
      from public.movements m
      where m.id::text = (storage.foldername(name))[1]
        and (select public.has_permission('movements:read'))
        and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
    )
  );

create policy movement_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'movement-photos'
    and (select public.has_permission('photos:write'))
    and (select public.has_permission('movements:write'))
    and (storage.foldername(name))[1] is not null
    and exists (
      select 1
      from public.movements m
      where m.id::text = (storage.foldername(name))[1]
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
        select 1 from public.photos f
        where f.path = 'movement-photos/' || name
          and f.created_by = (select auth.uid())
      )
      or (select public.has_permission('photos:delete'))
    )
  );
