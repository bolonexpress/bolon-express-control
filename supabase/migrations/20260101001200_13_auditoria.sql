-- =============================================================================
-- BOLON EXPRESS · Migracion 13 · Auditoria a nivel aplicacion (Fase 8)
--
-- La Fase 1 ya audita por trigger (`fn_audit`: catalogo, RBAC, config y lista
-- de compras) y las RPC de movimientos/anulacion escriben su propia fila, de
-- modo que cualquier escritura —vaya por la app o por SQL directo— deja
-- registro UNA vez. Lo que la base NO puede ver son los eventos de
-- autenticacion gestionados por Supabase Auth: login, logout y cambio de
-- contrasena.
--
-- 1. RPC `public.log_audit(...)`: unica via de INSERT a `audit_logs` desde la
--    app. `security definer` porque no hay policy de insert para
--    `authenticated` (ver migracion 04) y no la queremos: por este RPC el
--    actor SIEMPRE es el usuario de la sesion (`auth.uid()`), nadie puede
--    firmar log por otro ni escribir la tabla directamente.
-- 2. Append-only garantizado: no se crea policy de update/delete y la
--    revocacion general de la migracion 04 sigue en pie.
-- =============================================================================

create or replace function public.log_audit(
  p_accion public.auditoria_accion,
  p_entidad text,
  p_datos jsonb default '{}'::jsonb,
  p_entidad_id uuid default null,
  p_entidad_codigo text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb;
begin
  -- La accion viene tipada por el enum (el motor ya valida) y el actor lo
  -- fija la sesion: un cliente no puede declarar ser alguien mas.
  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;

  insert into public.audit_logs (
    actor_id, actor_email, accion, entidad, entidad_id, entidad_codigo, datos, ip_address, user_agent
  )
  values (
    auth.uid(),
    nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'email', ''),
    p_accion,
    p_entidad,
    p_entidad_id,
    p_entidad_codigo,
    coalesce(p_datos, '{}'::jsonb),
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), ''),
    nullif(v_headers ->> 'user-agent', '')
  );
end;
$$;

comment on function public.log_audit(public.auditoria_accion, text, jsonb, uuid, text)
  is 'Unica via de escritura de audit_logs desde la app. Actor/email salen de la sesion; pensada para eventos que la base no ve (login, logout, cambio de contrasena).';

-- El login FALLIDO ocurre sin sesion: lo llama el rol anon. No hay riesgo de
-- elevacion: el insert es append-only y el actor queda NULL.
grant execute on function public.log_audit(public.auditoria_accion, text, jsonb, uuid, text)
  to anon, authenticated;
