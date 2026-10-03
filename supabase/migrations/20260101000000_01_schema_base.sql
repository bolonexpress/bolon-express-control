-- =============================================================================
-- BOLON EXPRESS · Control Interno de Inventario
-- Migracion 01 · Esquema base
-- Requisitos: PostgreSQL 15+ (Supabase). Ejecutar una sola vez, en orden.
-- Nota: no se envuelve en BEGIN/COMMIT; el runner de migraciones ya lo hace.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Funciones puras (deben existir antes de las columnas generadas)
-- ---------------------------------------------------------------------------

create or replace function public.format_display_id(p_display_id bigint)
returns text
language sql
immutable
strict
as $$
  select '#' || lpad(p_display_id::text, 6, '0');
$$;

comment on function public.format_display_id(bigint)
  is 'Formatea el identificador legible de negocio (#000152).';

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

create type public.unidad_tipo as enum ('unidad', 'peso', 'volumen');

create type public.modo_control as enum ('cantidad', 'peso', 'ambos');

create type public.movimiento_tipo as enum ('entrada', 'salida', 'ajuste');

create type public.movimiento_motivo as enum (
  'compra',
  'venta',
  'devolucion_cliente',
  'devolucion_proveedor',
  'merma',
  'caducidad',
  'perdida',
  'robo',
  'fuga',
  'correccion_inventario',
  'transferencia_entrada',
  'transferencia_salida',
  'produccion',
  'consumo_interno',
  'otro'
);

create type public.anulacion_motivo as enum (
  'error_captura',
  'error_doble_registro',
  'devolucion',
  'ajuste_inventario',
  'otro'
);

create type public.compras_estado as enum ('pendiente', 'en_proceso', 'comprado', 'descartado');

create type public.compras_historial_tipo as enum (
  'creacion',
  'edicion',
  'cambio_estado',
  'cambio_cantidad',
  'eliminacion'
);

create type public.auditoria_accion as enum (
  'crear',
  'actualizar',
  'eliminar',
  'anular',
  'login',
  'logout',
  'cambio_password',
  'cambio_estado_usuario',
  'asignar_rol',
  'config_cambio',
  'acceso_denegado'
);

-- ---------------------------------------------------------------------------
-- 2. Identidad y RBAC
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  full_name             text not null default '',
  phone                 text,
  is_active             boolean not null default true,
  force_password_change boolean not null default false,
  last_seen_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_full_name_no_vacio check (btrim(full_name) <> '')
);

comment on table public.profiles is 'Extension de auth.users. El usuario nunca se elimina, se desactiva (is_active).';

create table public.permissions (
  key         text primary key,
  module      text not null,
  description text not null,
  is_sensitive boolean not null default false,
  constraint permissions_key_formato check (key ~ '^[a-z_]+:[a-z_]+$')
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint roles_key_formato check (key ~ '^[a-z_]+$')
);

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, role_id)
);

create index user_roles_user_idx on public.user_roles (user_id);

-- ---------------------------------------------------------------------------
-- 3. Catalogo base
-- ---------------------------------------------------------------------------

create table public.units (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  unit_type         public.unidad_tipo not null,
  factor_to_base    numeric(18, 8) not null default 1,
  base_unit         boolean not null default false,
  allow_fractional  boolean not null default false,
  decimals          smallint not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint units_factor_positivo check (factor_to_base > 0),
  constraint units_decimals_rango check (decimals between 0 and 3)
);

comment on column public.units.factor_to_base
  is 'Factor de conversion hacia la unidad base del tipo (peso -> kg, volumen -> l, unidad -> 1). Las libras son solo visual, peso interno siempre en kg.';
comment on column public.units.base_unit is 'true solo para la unidad base de cada tipo (u, kg, l).';

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  name       text not null,
  parent_id  uuid references public.categories (id) on delete restrict,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_no_vacio check (btrim(name) <> '')
);

create unique index categories_name_lower_key on public.categories (lower(btrim(name)));

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  display_id    bigint generated always as identity,
  codigo        text generated always as (public.format_display_id(display_id)) stored,
  sku           text not null unique,
  barcode       text unique,
  name          text not null,
  description   text,
  brand         text,
  category_id   uuid references public.categories (id) on delete restrict,
  unit_id       uuid not null references public.units (id) on delete restrict,
  control_mode  public.modo_control not null default 'cantidad',
  stock_minimo  numeric(14, 3) not null default 0,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint products_name_no_vacio check (btrim(name) <> ''),
  constraint products_stock_minimo_no_negativo check (stock_minimo >= 0)
);

create unique index products_display_id_key on public.products (display_id);
create index products_codigo_idx on public.products (codigo);
create index products_name_lower_idx on public.products (lower(btrim(name)));
create index products_category_idx on public.products (category_id);
create index products_is_active_idx on public.products (is_active);

comment on table public.products
  is 'Catalogo de productos. NO tiene columna de stock: el stock se calcula en v_stock_productos a partir de movements.';

-- ---------------------------------------------------------------------------
-- 4. Movimientos (append-only) y anulaciones
-- ---------------------------------------------------------------------------

create table public.movements (
  id                   uuid primary key default gen_random_uuid(),
  display_id           bigint generated always as identity,
  codigo               text generated always as (public.format_display_id(display_id)) stored,
  tipo                 public.movimiento_tipo not null,
  product_id           uuid not null references public.products (id) on delete restrict,
  cantidad             numeric(14, 3),
  peso_kg              numeric(14, 3),
  delta_cantidad       numeric(14, 3) generated always as (
                         case tipo
                           when 'entrada' then cantidad
                           when 'salida'  then -cantidad
                           when 'ajuste'  then cantidad
                         end
                       ) stored,
  delta_peso_kg        numeric(14, 3) generated always as (
                         case tipo
                           when 'entrada' then peso_kg
                           when 'salida'  then -peso_kg
                           when 'ajuste'  then peso_kg
                         end
                       ) stored,
  motivo               public.movimiento_motivo not null,
  related_movement_id  uuid references public.movements (id) on delete restrict,
  cantidad_original    numeric(14, 3),
  unidad_original_id   uuid references public.units (id) on delete restrict,
  notes                text,
  idempotency_key      text not null unique,
  created_by           uuid not null references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  constraint movements_valor_presente check (cantidad is not null or peso_kg is not null),
  constraint movements_cantidad_valida check (
    cantidad is null
    or (tipo = 'ajuste' and cantidad <> 0)
    or (tipo <> 'ajuste' and cantidad > 0)
  ),
  constraint movements_peso_valido check (
    peso_kg is null
    or (tipo = 'ajuste' and peso_kg <> 0)
    or (tipo <> 'ajuste' and peso_kg > 0)
  ),
  constraint movements_no_autocompleto check (related_movement_id is null or related_movement_id <> id),
  constraint movements_idempotency_key check (btrim(idempotency_key) <> '')
);

comment on table public.movements
  is 'Libro de movimientos inmutable (append-only). UPDATE/DELETE bloqueados por trigger. Las correcciones se hacen con movement_anulations + un movimiento nuevo.';
comment on column public.movements.peso_kg is 'Peso en KILOGRAMOS (unidad interna). Las libras solo se presentan en la UI.';
comment on column public.movements.delta_cantidad is 'Efecto firmado en la unidad base del producto. Generado: no puede alterarse sin alterar el tipo.';
comment on column public.movements.idempotency_key is 'Clave de idempotencia generada por el cliente; evita duplicados por doble toque o reintento.';
comment on column public.movements.cantidad_original is 'Cantidad tal como la ingreso el usuario, antes de convertir a la unidad base (trazabilidad).';

create unique index movements_display_id_key on public.movements (display_id);
create index movements_codigo_idx on public.movements (codigo);
create index movements_product_created_idx on public.movements (product_id, created_at desc);
create index movements_created_idx on public.movements (created_at desc);
create index movements_created_by_idx on public.movements (created_by);

create table public.movement_anulations (
  id          uuid primary key default gen_random_uuid(),
  movement_id uuid not null unique references public.movements (id) on delete restrict,
  motivo      public.anulacion_motivo not null,
  detail      text,
  snapshot    jsonb not null default '{}'::jsonb,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.movement_anulations
  is 'Borrado logico de movimientos. Un movimiento anulado deja de afectar el stock. Unico movimiento permitido por movimiento.';

create index movement_anulations_created_idx on public.movement_anulations (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Fotos (bucket privado)
-- ---------------------------------------------------------------------------

create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.movements (id) on delete restrict,
  path        text not null unique,
  mime_type   text not null,
  size_bytes  integer not null,
  width       integer,
  height      integer,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint photos_mime_permitido check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  constraint photos_size_rango check (size_bytes > 0 and size_bytes <= 15728640),
  constraint photos_path_movimiento check (split_part(path, '/', 1) = 'movement-photos' and length(split_part(path, '/', 2)) = 36)
);

comment on column public.photos.path is 'Formato: movement-photos/<movement_id>/<uuid>.<ext>. Bucket privado, nunca URL publica. Para firmar: public.photo_object_path(path).';

create index photos_movement_idx on public.photos (movement_id);

-- ---------------------------------------------------------------------------
-- 6. Lista de compras
-- ---------------------------------------------------------------------------

create table public.shopping_list (
  id                 uuid primary key default gen_random_uuid(),
  display_id         bigint generated always as identity,
  codigo             text generated always as (public.format_display_id(display_id)) stored,
  product_id         uuid references public.products (id) on delete restrict,
  descripcion        text not null default '',
  unit_id            uuid references public.units (id) on delete restrict,
  cantidad_sugerida  numeric(14, 3) not null default 1,
  cantidad_comprada  numeric(14, 3),
  precio_unitario    numeric(14, 4),
  proveedor          text,
  prioridad          smallint not null default 2,
  estado             public.compras_estado not null default 'pendiente',
  notas              text,
  auto_generated     boolean not null default false,
  completed_at       timestamptz,
  completed_by       uuid references public.profiles (id) on delete set null,
  created_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shopping_item_definido check (product_id is not null or btrim(descripcion) <> ''),
  constraint shopping_cantidad_sugerida check (cantidad_sugerida > 0),
  constraint shopping_cantidad_comprada check (cantidad_comprada is null or cantidad_comprada >= 0),
  constraint shopping_precio check (precio_unitario is null or precio_unitario >= 0),
  constraint shopping_prioridad_rango check (prioridad between 1 and 3),
  constraint shopping_completado_consistente check (
    (estado = 'comprado' and completed_at is not null)
    or (estado <> 'comprado' and completed_at is null)
  )
);

comment on table public.shopping_list is
  'Lista de compras. No se borra: un item se descarta (estado=descartado). estado=comprado exige completed_at y completed_by (ver constraint).';

create unique index shopping_list_display_id_key on public.shopping_list (display_id);
create index shopping_list_codigo_idx on public.shopping_list (codigo);
create index shopping_list_estado_idx on public.shopping_list (estado, prioridad);
create index shopping_list_product_idx on public.shopping_list (product_id);
create index shopping_list_estado_pendiente_idx on public.shopping_list (estado)
  where estado in ('pendiente', 'en_proceso');

create table public.shopping_list_history (
  id               bigint generated always as identity primary key,
  shopping_list_id uuid not null references public.shopping_list (id) on delete restrict,
  tipo_registro    public.compras_historial_tipo not null,
  estado_anterior  public.compras_estado,
  estado_nuevo     public.compras_estado,
  snapshot         jsonb not null,
  changed_by       uuid not null references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now()
);

create index shopping_list_history_item_idx on public.shopping_list_history (shopping_list_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Auditoria (bitacora inmutable)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid,
  actor_email   text,
  accion        public.auditoria_accion not null,
  entidad       text not null,
  entidad_id    uuid,
  entidad_codigo text,
  datos         jsonb not null default '{}'::jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  constraint audit_logs_entidad_requerida check (btrim(entidad) <> '')
);

comment on table public.audit_logs is 'Bitacora append-only. UPDATE/DELETE bloqueados por trigger, incluso para service_role.';
comment on column public.audit_logs.actor_id is 'UUID del actor sin FK a proposito: el registro de auditoria no debe alterarse al eliminar usuarios (ademas no se eliminan).';
comment on column public.audit_logs.datos is 'JSONB con before/after en cambios, o detalle de la accion critica.';

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entidad_idx on public.audit_logs (entidad, entidad_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Configuracion global
-- ---------------------------------------------------------------------------

create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  value_type  text not null default 'string',
  description text,
  is_public   boolean not null default false,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint app_config_key_formato check (key ~ '^[a-z0-9_.]+$'),
  constraint app_config_value_type check (value_type in ('string', 'number', 'boolean', 'json'))
);

comment on table public.app_config is 'Configuracion global clave-valor. Nunca guardar secretos aqui: usar Supabase Vault o variables de entorno de Vercel.';

create index app_config_public_idx on public.app_config (key) where is_public;

-- ---------------------------------------------------------------------------
-- 9. RBAC base (debe existir antes de crear usuarios)
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, description, is_sensitive) values
  ('users:manage',     'usuarios',   'Crear, activar/desactivar usuarios y asignar roles', true),
  ('catalog:read',     'catalogo',   'Consultar productos, categorias y unidades', false),
  ('catalog:write',    'catalogo',   'Crear y editar productos, categorias y unidades', false),
  ('movements:read',   'movimientos','Consultar movimientos y anulaciones', false),
  ('movements:write',  'movimientos','Registrar entradas, salidas y ajustes', false),
  ('movements:anular', 'movimientos','Anular movimientos existentes', true),
  ('movements:export', 'movimientos','Exportar movimientos a CSV/Excel', true),
  ('photos:read',      'fotos',      'Ver fotos de los movimientos', false),
  ('photos:write',     'fotos',      'Adjuntar y reemplazar fotos de movimientos', false),
  ('photos:delete',    'fotos',      'Eliminar fotos de cualquier usuario', true),
  ('shopping:read',    'compras',    'Consultar la lista de compras', false),
  ('shopping:write',   'compras',    'Crear y actualizar items de la lista de compras', false),
  ('reports:read',     'reportes',   'Ver tableros e indicadores', false),
  ('reports:export',   'reportes',   'Exportar reportes', true),
  ('audit:read',       'auditoria',  'Consultar la bitacora de auditoria', true),
  ('config:write',     'configuracion', 'Cambiar la configuracion global (app_config)', true)
on conflict (key) do update
  set module = excluded.module,
      description = excluded.description,
      is_sensitive = excluded.is_sensitive;

insert into public.roles (key, name, description, is_system) values
  ('admin',     'Administrador', 'Acceso total, incluidos usuarios, configuracion y auditoria', true),
  ('supervisor', 'Supervisor',   'Control de operaciones: catalogo, movimientos, compras y reportes', true),
  ('operador',  'Operador',      'Registra movimientos y gestiona la lista de compras', true),
  ('consulta',  'Consulta',      'Solo lectura de catalogo, movimientos y compras', true)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description;

-- admin: todos los permisos.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

-- Los demas roles parten de la lista completa menos los sensibles.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.key in ('supervisor', 'operador', 'consulta')
  and p.key not in ('users:manage', 'config:write', 'audit:read', 'photos:delete')
  and (r.key <> 'operador' or p.key not in ('movements:anular', 'movements:export', 'reports:export'))
  and (r.key <> 'consulta' or p.key not in ('catalog:write', 'movements:write', 'photos:write', 'shopping:write'))
on conflict do nothing;
