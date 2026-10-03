-- =============================================================================
-- BOLON EXPRESS · Migracion 10 · Inventario calculado (Fase 5)
-- Tres cambios:
--
-- 1. Permiso nuevo `inventory:read`. El enunciado de la Fase 5 lo pide con ese
--    nombre y la migracion 01 no lo sembro. No se reusa `catalog:read` ni
--    `movements:read`: un rol podria querer ver el stock sin abrirle el libro
--    de movimientos, y los permisos de lectura son lo suficientemente baratos
--    como para no mezclarlos.
-- 2. Grants del permiso a los cuatro roles. La migracion 01 sembro los grants
--    con un cross join EN SU MOMENTO: un permiso creado despues no llega solo
--    (ni siquiera a `admin`, que hoy ya tiene todo lo sembrado).
-- 3. Indice `movement_anulations_movement_idx`. La vista v_stock_productos hace
--    un `not exists (...) where a.movement_id = m.id` POR PRODUCTO y la tabla de
--    anulaciones solo tenia indice por `created_at`: el anti-join escalaba con
--    el total de anulaciones. El indice lo convierte en un index scan puntual.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Permiso
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, description, is_sensitive)
values ('inventory:read', 'inventario', 'Consultar el stock actual por producto', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Grants a los roles existentes
--
--    Todos los roles activos pueden leer el inventario: `consulta` es el rol de
--    solo lectura y su nombre no tendria sentido sin el stock. El permiso se
--    puede retirar por rol desde la Fase 6 sin tocar nada mas.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_key)
select r.id, 'inventory:read'
from public.roles r
where r.key in ('admin', 'supervisor', 'operador', 'consulta')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Indice del anti-join de anulaciones
-- ---------------------------------------------------------------------------

create index if not exists movement_anulations_movement_idx
  on public.movement_anulations (movement_id);

comment on index public.movement_anulations_movement_idx
  is 'Sostiene el "not exists" de v_stock_productos / registrar_movimiento: una consulta por movimiento, no un barrido de la tabla.';
