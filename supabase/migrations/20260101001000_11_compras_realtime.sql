-- =============================================================================
-- BOLON EXPRESS · Migracion 11 · Lista de compras: realtime + transiciones
--
-- 1. Suscripcion Realtime: publica `shopping_list` y `shopping_list_history`
--    en `supabase_realtime`. Sin esto, los cambios NO llegan al navegador: la
--    publicacion es la lista de difusion, y la RLS que el suscriptor tenga
--    decide que filas ve.
-- 2. `replica identity full` en ambas: el cliente necesita la fila completa
--    de los UPDATE (recompute visual de prioridad/estado) sin ir y venir.
-- 3. Trigger `trg_shopping_transicion`: cierra el estado del ciclo de vida
--    (pendiente → en_proceso → comprado | descartado; los terminales no
--    tienen salida). La Server Action ya lo valida con mensaje amable, pero la
--    base es quien lo cierra cualquier via de escritura.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 y 2. Publicacion realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_list'
  ) then
    execute 'alter publication supabase_realtime add table public.shopping_list';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_list_history'
  ) then
    execute 'alter publication supabase_realtime add table public.shopping_list_history';
  end if;

end $$;

alter table public.shopping_list replica identity full;
alter table public.shopping_list_history replica identity full;

-- ---------------------------------------------------------------------------
-- 3. Transiciones de estado
-- ---------------------------------------------------------------------------

create or replace function public.fn_shopping_transicion_valida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Solo se valida cuando cambia el estado: editar notas/cantidad siempre va.
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  if (old.estado = 'pendiente' and new.estado in ('en_proceso', 'descartado'))
     or (old.estado = 'en_proceso' and new.estado in ('comprado', 'descartado')) then
    return new;
  end if;

  raise exception 'TRANSICION_NO_PERMITIDA % -> %', old.estado, new.estado
    using errcode = '23514';
end;
$$;

create trigger trg_shopping_transicion
before update on public.shopping_list
for each row execute function public.fn_shopping_transicion_valida();

comment on function public.fn_shopping_transicion_valida()
  is 'Lista de compras: pendiente -> en_proceso -> comprado | descartado. Los terminales no tienen salida. La app valida con mensaje amable; aqui se cierra cualquier otra via.';
