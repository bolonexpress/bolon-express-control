-- =============================================================================
-- BOLON EXPRESS · Migracion 12 · Historial (Fase 7)
--
-- 1. Permiso nuevo `history:read`. El enunciado de la Fase 7 lo pide con ese
--    nombre y la migracion 01 no lo sembro. Se crea en lugar de reusar
--    `movements:read`, igual que `inventory:read` en la Fase 5: leer el libro
--    completo con filtros y la foto asociada es un caso distinto de consultar
--    un movimiento.
--
--    NOTA sobre indices: no van en esta migracion. El filtro principal,
--    `created_at desc + id desc` del cursor keyset, lo cubre
--    `movements_created_idx` (migracion 01); los filtros por producto y por
--    usuario usan `movements_product_created_idx` y `movements_created_by_idx`,
--    y el anti-join de anulados usa `movement_anulations_movement_idx`
--    (migracion 10). Crearlos dos veces seria ruido.
-- =============================================================================

insert into public.permissions (key, module, description, is_sensitive)
values ('history:read', 'movimientos', 'Consultar el historial de movimientos con filtros y fotos', false)
on conflict (key) do nothing;

-- Los grants del seed de la migracion 01 son de su momento; un permiso nuevo
-- no se propaga solo (ni a admin). Ver ADR-012.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'history:read'
from public.roles r
where r.key in ('admin', 'supervisor', 'operador', 'consulta')
on conflict do nothing;
