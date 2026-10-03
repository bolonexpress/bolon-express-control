-- =============================================================================
-- BOLON EXPRESS · Migracion 06 · Datos base (unidades, categorias, config)
-- Idempotente. Ejecutar despues de las migraciones 01 a 05.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unidades
--    factor_to_base convierte hacia la unidad base del tipo: kg (peso),
--    l (volumen), u (conteo). Las libras son solo visual: el sistema nunca
--    almacena ni compara pesos en libras.
--    Cada producto elige UNA unidad base (products.unit_id); por eso una
--    unidad de conteo (caja, paquete) tiene factor 1.
-- ---------------------------------------------------------------------------

insert into public.units (code, name, unit_type, factor_to_base, base_unit, allow_fractional, decimals) values
  ('u',       'Unidad',    'unidad',  1.00000000, true,  false, 0),
  ('par',     'Par',       'unidad',  1.00000000, false, false, 0),
  ('caja',    'Caja',      'unidad',  1.00000000, false, false, 0),
  ('paquete', 'Paquete',   'unidad',  1.00000000, false, false, 0),
  ('kg',      'Kilogramo', 'peso',    1.00000000, true,  true,  3),
  ('g',       'Gramo',     'peso',    0.00100000, false, true,  3),
  ('lb',      'Libra',     'peso',    0.45359237, false, true,  3),
  ('l',       'Litro',     'volumen', 1.00000000, true,  true,  3),
  ('ml',      'Mililitro', 'volumen', 0.00100000, false, true,  2)
on conflict (code) do update
  set name = excluded.name,
      unit_type = excluded.unit_type,
      factor_to_base = excluded.factor_to_base,
      base_unit = excluded.base_unit,
      allow_fractional = excluded.allow_fractional,
      decimals = excluded.decimals;

-- ---------------------------------------------------------------------------
-- 2. Categorias
-- ---------------------------------------------------------------------------

insert into public.categories (code, name, sort_order) values
  ('bebidas',    'Bebidas',       10),
  ('abarrotes',  'Abarrotes',     20),
  ('lacteos',    'Lacteos',       30),
  ('congelados', 'Congelados',    40),
  ('panaderia',  'Panaderia',     50),
  ('limpieza',   'Limpieza',      60),
  ('descarables','Descartables',  70),
  ('embalaje',   'Embalaje',      80),
  ('papeleria',  'Papeleria',     90),
  ('otros',      'Otros',        999)
on conflict (code) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. Configuracion global
--    value es jsonb: "USD", 5, true...
-- ---------------------------------------------------------------------------

insert into public.app_config (key, value, value_type, description, is_public) values
  ('business_name',            '"BOLON EXPRESS"',        'string',  'Nombre comercial del negocio', true),
  ('business_country',         '"EC"',                   'string',  'Pais (Ecuador)', true),
  ('currency',                 '"USD"',                  'string',  'Moneda de trabajo', true),
  ('timezone',                 '"America/Guayaquil"',    'string',  'Zona horaria para presentation', true),
  ('weight_internal_unit',     '"kg"',                   'string',  'Unidad interna de peso. No cambiar: la BD almacena KG', true),
  ('weight_display_unit',      '"lb"',                   'string',  'Unidad de presentacion de peso (solo visual)', true),
  ('weight_lb_to_kg',          '0.45359237',             'number',  'Factor Libra -> Kilogramo', true),
  ('require_movement_photo',   'false',                  'boolean', 'Exigir al menos una foto por movimiento', false),
  ('require_movement_reason',  'true',                   'boolean', 'Motivo obligatorio en movimientos y anulaciones', false),
  ('allow_negative_stock',     'false',                  'boolean', 'Permitir stock negativo. Mantener en false', false),
  ('low_stock_alerts_enabled', 'true',                   'boolean', 'Mostrar alertas de stock minimo', true),
  ('shopping_default_priority','2',                      'number',  'Prioridad por defecto de items de compras (1 alta, 3 baja)', false),
  ('photos_max_size_bytes',    '15728640',               'number',  'Tamano maximo por foto (15 MB)', false)
on conflict (key) do update
  set description = excluded.description,
      value_type = excluded.value_type;
-- A proposito no se sobreescribe value: los valores afinados por el admin
-- (por ejemplo weight_display_unit) sobreviven a un re-seed.
