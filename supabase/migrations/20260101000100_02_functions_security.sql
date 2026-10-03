-- =============================================================================
-- BOLON EXPRESS · Migracion 02 · Sesion, RBAC, triggers de integridad y auditoria
-- Requisitos: 01_schema_base.sql aplicado. Ejecutar una sola vez.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helpers de sesion y permisos (SECURITY DEFINER: evitan recursion de RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
  );
$$;

comment on function public.is_active_user() is 'true solo si hay sesion valida y el usuario esta activo.';

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = auth.uid()
            and rp.permission_key = p_permission
        )
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = auth.uid()
            and r.key = 'admin'
        )
    ),
    false
  );
$$;

comment on function public.has_permission(text)
  is 'RBAC dinamico. El rol admin tiene acceso total por diseno. Sin cambios de codigo ni redesploy al modificar permisos.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.key = 'admin'
  );
$$;

create or replace function public.require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_user() then
    raise exception 'USUARIO_INACTIVO_O_SIN_SESION' using errcode = '42501';
  end if;

  if not public.has_permission(p_permission) then
    raise exception 'PERMISO_DENEGADO: %', p_permission using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lectura tipada de app_config
-- ---------------------------------------------------------------------------

create or replace function public.get_config_text(p_key text, p_default text default null)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value #>> '{}' from public.app_config where key = p_key), p_default);
$$;

create or replace function public.get_config_number(p_key text, p_default numeric default null)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_value numeric;
begin
  begin
    v_value := (select (value #>> '{}')::numeric from public.app_config where key = p_key);
  exception when others then
    v_value := null;
  end;
  return coalesce(v_value, p_default);
end;
$$;

create or replace function public.get_config_bool(p_key text, p_default boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_value boolean;
begin
  begin
    v_value := (select (value #>> '{}')::boolean from public.app_config where key = p_key);
  exception when others then
    v_value := null;
  end;
  return coalesce(v_value, p_default);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Utilidades
-- ---------------------------------------------------------------------------

-- photos.path guarda el prefijo del bucket; Storage usa el nombre sin bucket.
create or replace function public.photo_object_path(p_path text)
returns text
language sql
immutable
strict
as $$
  select substring(p_path from position('/' in p_path) + 1);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'categories', 'units', 'profiles', 'shopping_list', 'app_config']
  loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Inmutabilidad (bloquea UPDATE/DELETE a nivel motor, no solo RLS)
-- ---------------------------------------------------------------------------

create or replace function public.fn_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'TABLA_INMUTABLE: % no admite %', TG_TABLE_NAME, TG_OP
    using errcode = '42501',
          hint = 'Para corregir un movimiento, anulalo y registra uno nuevo.';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['movements', 'movement_anulations', 'audit_logs', 'shopping_list_history']
  loop
    execute format(
      'create trigger trg_%1$s_inmutable before update or delete on public.%1$I for each row execute function public.fn_prevent_mutation()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Campos reservados del perfil (is_active / force_password_change)
-- ---------------------------------------------------------------------------

create or replace function public.fn_protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id then
    raise exception 'CAMPO_INMUTABLE: id de perfil' using errcode = '42501';
  end if;

  if (new.is_active is distinct from old.is_active)
     or (new.force_password_change is distinct from old.force_password_change) then
    if not public.has_permission('users:manage') then
      raise exception 'PERMISO_DENEGADO: is_active y force_password_change requieren users:manage'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_profiles_protect_fields
before update on public.profiles
for each row execute function public.fn_protect_profile_fields();

-- ---------------------------------------------------------------------------
-- 6. Bitacora de auditoria automatica
-- ---------------------------------------------------------------------------

create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_accion public.auditoria_accion;
  v_row jsonb;
  v_old jsonb;
  v_id uuid;
  v_codigo text;
  v_headers jsonb;
begin
  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
  else
    v_row := to_jsonb(NEW);
    if TG_OP = 'UPDATE' then
      v_old := to_jsonb(OLD);
    end if;
  end if;

  if TG_TABLE_NAME = 'user_roles' and TG_OP = 'INSERT' then
    v_accion := 'asignar_rol';
  elsif TG_TABLE_NAME = 'app_config' then
    v_accion := 'config_cambio';
  else
    v_accion := case TG_OP
                  when 'INSERT' then 'crear'::public.auditoria_accion
                  when 'UPDATE' then 'actualizar'::public.auditoria_accion
                  else 'eliminar'::public.auditoria_accion
                end;
  end if;

  v_id := nullif(coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'role_id'), '')::uuid;
  v_codigo := nullif(v_row ->> 'codigo', '');

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;

  insert into public.audit_logs (
    actor_id, actor_email, accion, entidad, entidad_id, entidad_codigo, datos, ip_address, user_agent
  )
  values (
    auth.uid(),
    nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'email', ''),
    v_accion,
    TG_TABLE_NAME,
    v_id,
    v_codigo,
    case
      when v_accion = 'eliminar' then jsonb_build_object('before', v_row)
      when v_accion = 'crear' or v_accion = 'asignar_rol' or v_accion = 'config_cambio'
        then jsonb_build_object('after', v_row)
      else jsonb_build_object('before', v_old, 'after', v_row)
    end,
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), ''),
    nullif(v_headers ->> 'user-agent', '')
  );

  return null;
end;
$$;

comment on function public.fn_audit() is
  'Registra catalogo, RBAC, config y lista de compras en audit_logs. Los movimientos y anulaciones se registran explicitamente en sus RPC para usar la accion correcta.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'categories', 'units', 'profiles',
    'roles', 'permissions', 'role_permissions', 'user_roles',
    'app_config', 'shopping_list'
  ]
  loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Historial de la lista de compras
-- ---------------------------------------------------------------------------

create or replace function public.fn_shopping_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  if TG_OP = 'DELETE' then
    v_actor := coalesce(auth.uid(), old.created_by);
  else
    v_actor := coalesce(auth.uid(), new.created_by);
  end if;

  if TG_OP = 'INSERT' then
    insert into public.shopping_list_history (
      shopping_list_id, tipo_registro, estado_anterior, estado_nuevo, snapshot, changed_by
    )
    values (
      new.id,
      'creacion'::public.compras_historial_tipo,
      null,
      new.estado,
      to_jsonb(new),
      v_actor
    );
  elsif TG_OP = 'UPDATE' then
    if new.estado is distinct from old.estado then
      insert into public.shopping_list_history (
        shopping_list_id, tipo_registro, estado_anterior, estado_nuevo, snapshot, changed_by
      )
      values (
        new.id,
        'cambio_estado'::public.compras_historial_tipo,
        old.estado,
        new.estado,
        jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
        v_actor
      );
    elsif new.cantidad_comprada is distinct from old.cantidad_comprada
       or new.cantidad_sugerida is distinct from old.cantidad_sugerida then
      insert into public.shopping_list_history (
        shopping_list_id, tipo_registro, estado_anterior, estado_nuevo, snapshot, changed_by
      )
      values (
        new.id,
        'cambio_cantidad'::public.compras_historial_tipo,
        old.estado,
        new.estado,
        jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
        v_actor
      );
      else
        insert into public.shopping_list_history (
          shopping_list_id, tipo_registro, estado_anterior, estado_nuevo, snapshot, changed_by
        )
        values (
          new.id,
          'edicion'::public.compras_historial_tipo,
          old.estado,
          new.estado,
          jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
          v_actor
        );
      end if;
  end if;

  return null;
end;
$$;

create trigger trg_shopping_history
after insert or update on public.shopping_list
for each row execute function public.fn_shopping_history();

-- ---------------------------------------------------------------------------
-- 8. Alta de usuario: perfil automatico + rol por defecto
-- ---------------------------------------------------------------------------

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuario'
    ),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id
  from public.roles r
  where r.key = 'operador'
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.fn_handle_new_user();

-- Respaldo para usuarios previos a esta migracion.
insert into public.profiles (id, full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Usuario')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.user_roles (user_id, role_id)
select p.id, r.id
from public.profiles p
cross join public.roles r
where r.key = 'operador'
  and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role_id = r.id);
