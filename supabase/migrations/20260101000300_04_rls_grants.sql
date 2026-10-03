-- =============================================================================
-- BOLON EXPRESS · Migracion 04 · RLS estricto y permisos (grants)
-- Principio: por defecto se revoca todo y se concede lo minimo.
-- Las funciones SECURITY DEFINER de las migraciones 02 y 03 son el unico
-- camino de escritura; por eso algunas tablas no tienen politica de escritura.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Revocar todo a anon y authenticated
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

-- Protege futuras migraciones: en Supabase los privilegios por defecto de anon y
-- authenticated son TODOS. Sin esto, una tabla nueva heredaria acceso total.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'permissions', 'roles', 'role_permissions', 'user_roles',
    'units', 'categories', 'products',
    'movements', 'movement_anulations', 'photos',
    'shopping_list', 'shopping_list_history',
    'audit_logs', 'app_config'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lectura
-- ---------------------------------------------------------------------------

grant select on
  public.units, public.categories, public.products,
  public.movements, public.movement_anulations, public.photos,
  public.shopping_list, public.shopping_list_history,
  public.roles, public.permissions, public.role_permissions, public.profiles,
  public.app_config, public.audit_logs,
  -- `user_roles` es OBLIGATORIA aqui. El revoke general de arriba se la
  -- quitaba, y sin privilegio de tabla Postgres responde `permission denied
  -- for table user_roles` ANTES de evaluar la policy `user_roles_select`. Como
  -- getAuthContext() lee esta tabla, ese denial devolvia null y TODAS las
  -- paginas redirigian a /login en bucle. El permiso de escritura de mas abajo
  -- (insert/update/delete) NO cubre el SELECT.
  public.user_roles
to authenticated;

grant select on
  public.v_stock_productos, public.v_stock_bajo_minimo,
  public.v_movimientos, public.v_shopping_list
to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Escritura permitida (todas passes RLS con require_permission en su politica)
-- ---------------------------------------------------------------------------

grant insert, update, delete on
  public.units, public.categories, public.products
to authenticated;

grant insert, update on
  public.shopping_list
to authenticated;

grant insert, delete on
  public.photos
to authenticated;

grant insert, update on
  public.profiles
to authenticated;

grant insert, update, delete on
  public.roles, public.permissions, public.role_permissions, public.user_roles
to authenticated;

grant insert, update, delete on
  public.app_config
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Funciones accesibles desde el cliente autenticado (el resto quedan revocadas).
grant execute on function
  public.format_display_id(bigint),
  public.photo_object_path(text),
  public.is_active_user(),
  public.is_admin(),
  public.has_permission(text),
  public.require_permission(text),
  public.get_config_text(text, text),
  public.get_config_number(text, numeric),
  public.get_config_bool(text, boolean),
  public.registrar_movimiento(uuid, public.movimiento_tipo, text, numeric, numeric, public.movimiento_motivo, text, numeric, uuid, uuid),
  public.anular_movimiento(uuid, public.anulacion_motivo, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Politicas: identidad y RBAC
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.is_active_user()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users:manage')))
  with check (id = (select auth.uid()) or (select public.has_permission('users:manage')));

create policy permissions_select on public.permissions
  for select to authenticated
  using ((select public.is_active_user()));

create policy permissions_write on public.permissions
  for all to authenticated
  using ((select public.has_permission('users:manage')))
  with check ((select public.has_permission('users:manage')));

create policy roles_select on public.roles
  for select to authenticated
  using ((select public.is_active_user()));

create policy roles_write on public.roles
  for all to authenticated
  using ((select public.has_permission('users:manage')))
  with check ((select public.has_permission('users:manage')));

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ((select public.is_active_user()));

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using ((select public.has_permission('users:manage')))
  with check ((select public.has_permission('users:manage')));

-- Un usuario solo ve sus propios roles salvo que administre usuarios.
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users:manage')));

create policy user_roles_write on public.user_roles
  for all to authenticated
  using ((select public.has_permission('users:manage')))
  with check ((select public.has_permission('users:manage')));

-- ---------------------------------------------------------------------------
-- 6. Politicas: catalogo
-- ---------------------------------------------------------------------------

create policy units_select on public.units
  for select to authenticated
  using ((select public.is_active_user()));

create policy units_write on public.units
  for all to authenticated
  using ((select public.has_permission('catalog:write')))
  with check ((select public.has_permission('catalog:write')));

create policy categories_select on public.categories
  for select to authenticated
  using ((select public.is_active_user()));

create policy categories_write on public.categories
  for all to authenticated
  using ((select public.has_permission('catalog:write')))
  with check ((select public.has_permission('catalog:write')));

create policy products_select on public.products
  for select to authenticated
  using ((select public.is_active_user()));

create policy products_write on public.products
  for all to authenticated
  using ((select public.has_permission('catalog:write')))
  with check ((select public.has_permission('catalog:write')));

-- ---------------------------------------------------------------------------
-- 7. Politicas: movimientos (solo lectura; la escritura va por RPC)
-- ---------------------------------------------------------------------------

create policy movements_select on public.movements
  for select to authenticated
  using ((select public.has_permission('movements:read')));

create policy movement_anulations_select on public.movement_anulations
  for select to authenticated
  using ((select public.has_permission('movements:read')));

-- ---------------------------------------------------------------------------
-- 8. Politicas: fotos
-- ---------------------------------------------------------------------------

create policy photos_select on public.photos
  for select to authenticated
  using ((select public.has_permission('photos:read')));

create policy photos_insert on public.photos
  for insert to authenticated
  with check (
    (select public.has_permission('photos:write'))
    and split_part(photos.path, '/', 2) = photos.movement_id::text
    and exists (
      select 1 from public.movements m
      where m.id = photos.movement_id
        and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
    )
  );

create policy photos_delete on public.photos
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.has_permission('photos:delete'))
  );

-- ---------------------------------------------------------------------------
-- 9. Politicas: lista de compras (nunca se borra: se descarta)
-- ---------------------------------------------------------------------------

create policy shopping_list_select on public.shopping_list
  for select to authenticated
  using ((select public.has_permission('shopping:read')));

create policy shopping_list_insert on public.shopping_list
  for insert to authenticated
  with check ((select public.has_permission('shopping:write')));

create policy shopping_list_update on public.shopping_list
  for update to authenticated
  using ((select public.has_permission('shopping:write')))
  with check ((select public.has_permission('shopping:write')));

create policy shopping_list_history_select on public.shopping_list_history
  for select to authenticated
  using ((select public.has_permission('shopping:read')));

-- ---------------------------------------------------------------------------
-- 10. Politicas: auditoria y configuracion
-- ---------------------------------------------------------------------------

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select public.has_permission('audit:read')));

create policy app_config_select on public.app_config
  for select to authenticated
  using ((select public.is_active_user()));

create policy app_config_write on public.app_config
  for all to authenticated
  using ((select public.has_permission('config:write')))
  with check ((select public.has_permission('config:write')));
