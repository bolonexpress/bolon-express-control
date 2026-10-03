-- =============================================================================
-- BOLON EXPRESS · Migracion 07 · Soporte de autenticacion
--  a) Permite que un usuario limpie su propio force_password_change tras cambiarla
--  b) Tabla y funciones del limitador de intentos de login
-- Requisito: 01 a 06 aplicadas. Ejecutar una sola vez.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Campos reservados del perfil (ajuste de Fase 2)
--
-- is_active sigue siendo exclusivo de users:manage. En cambio, un usuario
-- autenticado puede limpiar SU PROPIO force_password_change (de true a false):
-- es el unico modo de cerrar el ciclo "clave provisional -> clave definitiva".
--
-- La clave service_role (backend de la app y scripts de administracion)
-- tambien puede fijar ambos campos: para ella auth.uid() es null, y es la
-- unica via del script seed-admin y de las Server Actions de administracion
-- que actuan por cuenta de otro usuario. Ver ADR-007.
-- ---------------------------------------------------------------------------

create or replace function public.is_service_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

comment on function public.is_service_role()
  is 'true solo cuando la peticion va firmada por la clave service_role.';

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

  if new.is_active is distinct from old.is_active then
    if not public.has_permission('users:manage') and not public.is_service_role() then
      raise exception 'PERMISO_DENEGADO: is_active requiere users:manage' using errcode = '42501';
    end if;
  end if;

  if new.force_password_change is distinct from old.force_password_change then
    if not public.has_permission('users:manage')
       and not public.is_service_role()
       and not (
          id = auth.uid()
          and old.force_password_change = true
          and new.force_password_change = false
        ) then
      raise exception 'PERMISO_DENEGADO: force_password_change requiere users:manage'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Intentos de login
--
-- Se guarda un hash del correo y de la IP, no los valores en claro: la tabla
-- sirve para limitar intentos, no para identificar personas. Sin politica RLS,
-- asi que solo es accesible con service_role (o con estas funciones).
-- ---------------------------------------------------------------------------

create table public.login_attempts (
  id           bigint generated always as identity primary key,
  identifier   text not null,
  kind         text not null,
  success      boolean not null default false,
  attempted_at timestamptz not null default now(),
  constraint login_attempts_kind check (kind in ('email', 'ip'))
);

create index login_attempts_identifier_idx on public.login_attempts (identifier, kind, attempted_at desc);
create index login_attempts_attempted_idx on public.login_attempts (attempted_at);

alter table public.login_attempts enable row level security;

revoke all on table public.login_attempts from anon, authenticated;
revoke all on sequence public.login_attempts_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Consulta del limite (sin registrar el intento actual)
-- ---------------------------------------------------------------------------

create or replace function public.fn_login_rate_limit_check(
  p_email          text,
  p_ip             text,
  p_max_email      integer default 5,
  p_max_ip         integer default 20,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email_id   text := md5(lower(coalesce(p_email, '')));
  v_ip_id      text := nullif(md5(coalesce(p_ip, '')), md5(''));
  v_email_hits integer := 0;
  v_ip_hits    integer := 0;
  v_email_wait integer := 0;
  v_ip_wait    integer := 0;
begin
  delete from public.login_attempts where attempted_at < now() - interval '24 hours';

  select count(*)::integer,
         coalesce(
           greatest(
             ceil(extract(epoch from (max(attempted_at) + make_interval(secs => p_window_seconds) - now())))::integer,
             0
           ),
           0
         )
    into v_email_hits, v_email_wait
  from public.login_attempts
  where identifier = v_email_id
    and kind = 'email'
    and not success
    and attempted_at > now() - make_interval(secs => p_window_seconds);

  if v_ip_id is not null then
    select count(*)::integer,
           coalesce(
             greatest(
               ceil(extract(epoch from (max(attempted_at) + make_interval(secs => p_window_seconds) - now())))::integer,
               0
             ),
             0
           )
      into v_ip_hits, v_ip_wait
    from public.login_attempts
    where identifier = v_ip_id
      and kind = 'ip'
      and not success
      and attempted_at > now() - make_interval(secs => p_window_seconds);
  end if;

  return jsonb_build_object(
    'allowed', (v_email_hits < p_max_email and (v_ip_id is null or v_ip_hits < p_max_ip)),
    'email_hits', v_email_hits,
    'ip_hits', v_ip_hits,
    'retry_after_seconds', greatest(v_email_wait, v_ip_wait)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Registro del intento (si fue exitoso, limpia el historial del correo)
-- ---------------------------------------------------------------------------

create or replace function public.fn_login_attempts_record(
  p_email  text,
  p_ip     text,
  p_success boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email_id text := md5(lower(coalesce(p_email, '')));
begin
  if p_success then
    delete from public.login_attempts where kind = 'email' and identifier = v_email_id;
    return;
  end if;

  insert into public.login_attempts (identifier, kind, success)
  values (v_email_id, 'email', false);

  if nullif(coalesce(p_ip, ''), '') is not null then
    insert into public.login_attempts (identifier, kind, success)
    values (md5(p_ip), 'ip', false);
  end if;
end;
$$;

-- Solo service_role (backend) puede usar el limitador.
revoke execute on function public.fn_login_rate_limit_check(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.fn_login_attempts_record(text, text, boolean) from public, anon, authenticated;

grant execute on function public.fn_login_rate_limit_check(text, text, integer, integer, integer) to service_role;
grant execute on function public.fn_login_attempts_record(text, text, boolean) to service_role;