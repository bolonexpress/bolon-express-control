-- ---------------------------------------------------------------------------
-- 08 · Invariantes del catalogo (productos, categorias, unidades)
-- ---------------------------------------------------------------------------
-- Complementa a la migracion 01 con las reglas que el formulario no puede
-- garantizar por si solo (ADR-009). La app las valida tambien en
-- `server/services/catalog.ts`: esto es la segunda barrera, no la unica.

-- 1) Una sola unidad base activa por tipo. Sin esto, dos unidades con
--    factor distinto dirian "la unidad base" y las conversiones serian
--    ambiguas para peso (kg) y para conteo (u).
create unique index units_base_unica_por_tipo
  on public.units (unit_type)
  where base_unit and is_active;

comment on index public.units_base_unica_por_tipo is
  'Una unica unidad base activa por tipo (peso -> kg, conteo -> u, volumen -> l).';

-- 2) La unidad base no convierte: por definicion su factor es 1.
alter table public.units
  add constraint units_base_factor_uno check (base_unit = false or factor_to_base = 1);

-- 3) Una categoria no puede ser su propia superior. El ciclo mas largo
--    (A -> B -> A) lo rechaza la validacion de la app; el caso trivial
--    queda cerrado aqui para cualquier escritura, incluida la manual.
alter table public.categories
  add constraint categories_no_autopadre check (parent_id is null or parent_id <> id);
