-- =============================================================================
-- BOLON EXPRESS · Migracion 03 · Stock transaccional (RPC) y vistas de lectura
-- Requisito: PostgreSQL 15+ por las vistas con security_invoker.
-- La escritura de movimientos SOLO ocurre por estas funciones: no hay politica
-- INSERT/UPDATE/DELETE sobre public.movements para el rol authenticated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. registrar_movimiento
-- ---------------------------------------------------------------------------

create or replace function public.registrar_movimiento(
  p_product_id         uuid,
  p_tipo               public.movimiento_tipo,
  p_idempotency_key    text,
  p_cantidad           numeric            default null,
  p_peso_kg            numeric            default null,
  p_motivo             public.movimiento_motivo default null,
  p_notes              text               default null,
  p_cantidad_original  numeric            default null,
  p_unidad_original_id uuid               default null,
  p_related_movement_id uuid               default null
)
returns public.movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov            public.movements%rowtype;
  v_product        public.products%rowtype;
  v_headers        jsonb;
  v_stock_cantidad numeric := 0;
  v_stock_peso     numeric := 0;
  v_delta_cantidad numeric := 0;
  v_delta_peso     numeric := 0;
begin
  perform public.require_permission('movements:write');

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUERIDA' using errcode = '22023';
  end if;

  if p_motivo is null then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;

  -- 1) Idempotencia: reintento o doble toque devuelve el movimiento original.
  select * into v_mov from public.movements where idempotency_key = p_idempotency_key;
  if found then
    return v_mov;
  end if;

  -- 2) Lock de fila: serializa movimientos concurrentes del mismo producto.
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCTO_NO_EXISTE' using errcode = '23503';
  end if;

  if not v_product.is_active then
    raise exception 'PRODUCTO_INACTIVO' using errcode = '22023';
  end if;

  -- 3) Validacion segun modo de control (la app tambien valida con Zod).
  if v_product.control_mode = 'cantidad' and p_cantidad is null then
    raise exception 'CANTIDAD_REQUERIDA' using errcode = '22023';
  end if;

  if v_product.control_mode = 'peso' and p_peso_kg is null then
    raise exception 'PESO_REQUERIDO_EN_KG' using errcode = '22023';
  end if;

  if p_cantidad is not null and p_cantidad = 0 then
    raise exception 'CANTIDAD_NO_PUEDE_SER_CERO' using errcode = '22023';
  end if;

  if p_peso_kg is not null and p_peso_kg = 0 then
    raise exception 'PESO_NO_PUEDE_SER_CERO' using errcode = '22023';
  end if;

  if p_tipo <> 'ajuste' and p_cantidad is not null and p_cantidad < 0 then
    raise exception 'CANTIDAD_NEGATIVA_SOLO_EN_AJUSTE' using errcode = '22023';
  end if;

  if p_tipo <> 'ajuste' and p_peso_kg is not null and p_peso_kg < 0 then
    raise exception 'PESO_NEGATIVO_SOLO_EN_AJUSTE' using errcode = '22023';
  end if;

  -- 4) Stock vigente (excluye anulados) y efecto del nuevo movimiento.
  select coalesce(sum(m.delta_cantidad), 0), coalesce(sum(m.delta_peso_kg), 0)
    into v_stock_cantidad, v_stock_peso
  from public.movements m
  where m.product_id = p_product_id
    and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id);

  v_delta_cantidad := case p_tipo
                        when 'entrada' then p_cantidad
                        when 'salida'  then -p_cantidad
                        else p_cantidad
                      end;

  v_delta_peso := case p_tipo
                    when 'entrada' then p_peso_kg
                    when 'salida'  then -p_peso_kg
                    else p_peso_kg
                  end;

  if not public.get_config_bool('allow_negative_stock', false)
     and (
       v_stock_cantidad + coalesce(v_delta_cantidad, 0) < 0
       or (v_product.control_mode = 'peso' and v_stock_peso + coalesce(v_delta_peso, 0) < 0)
     ) then
    raise exception 'STOCK_INSUFICIENTE' using errcode = '23514';
  end if;

  -- 5) Insercion. Si una peticion concurrente gano la carrera de idempotencia,
  --    el bloque exception devuelve el movimiento ya creado.
  insert into public.movements (
    tipo, product_id, cantidad, peso_kg, motivo, related_movement_id,
    cantidad_original, unidad_original_id, notes, idempotency_key, created_by
  )
  values (
    p_tipo, p_product_id, p_cantidad, p_peso_kg, p_motivo, p_related_movement_id,
    p_cantidad_original, p_unidad_original_id, p_notes, p_idempotency_key, auth.uid()
  )
  returning * into v_mov;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;

  insert into public.audit_logs (
    actor_id, actor_email, accion, entidad, entidad_id, entidad_codigo, datos, ip_address, user_agent
  )
  values (
    auth.uid(),
    nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'email', ''),
    'crear'::public.auditoria_accion,
    'movements',
    v_mov.id,
    v_mov.codigo,
    jsonb_build_object(
      'tipo', v_mov.tipo,
      'motivo', v_mov.motivo,
      'cantidad', v_mov.cantidad,
      'peso_kg', v_mov.peso_kg,
      'stock_tras_movimiento_cantidad', v_stock_cantidad + coalesce(v_mov.delta_cantidad, 0),
      'stock_tras_movimiento_peso_kg', v_stock_peso + coalesce(v_mov.delta_peso_kg, 0),
      'after', to_jsonb(v_mov)
    ),
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), ''),
    nullif(v_headers ->> 'user-agent', '')
  );

  return v_mov;
exception
  when unique_violation then
    select * into v_mov
    from public.movements
    where idempotency_key = p_idempotency_key;

    if found then
      return v_mov;
    end if;

    raise;
end;
$$;

comment on function public.registrar_movimiento(uuid, public.movimiento_tipo, text, numeric, numeric, public.movimiento_motivo, text, numeric, uuid, uuid)
  is 'Unica via de escritura de movimientos. Atomica: valida permiso, idempotencia, modo de control y stock >= 0 dentro de la misma transaccion.';

-- ---------------------------------------------------------------------------
-- 2. anular_movimiento
-- ---------------------------------------------------------------------------

create or replace function public.anular_movimiento(
  p_movement_id uuid,
  p_motivo      public.anulacion_motivo,
  p_detalle     text default null
)
returns public.movement_anulations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov     public.movements%rowtype;
  v_anul    public.movement_anulations%rowtype;
  v_target  public.movements%rowtype;
  v_check   record;
  v_headers jsonb;
begin
  perform public.require_permission('movements:anular');

  if p_detalle is not null and btrim(p_detalle) = '' then
    raise exception 'DETALLE_REQUERIDO' using errcode = '22023';
  end if;

  select * into v_mov from public.movements where id = p_movement_id for update;
  if not found then
    raise exception 'MOVIMIENTO_NO_EXISTE' using errcode = 'P0002';
  end if;

  -- Idempotente: si ya estaba anulado devuelve la anulacion existente.
  select * into v_anul from public.movement_anulations where movement_id = p_movement_id;
  if found then
    return v_anul;
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;

  -- 1) La anulacion no puede dejar stock negativo (producto propio o pata gemela).
  if not public.get_config_bool('allow_negative_stock', false) then
    for v_check in
      select
        p.id as product_id,
        coalesce((
          select sum(m.delta_cantidad) from public.movements m
          where m.product_id = p.id
            and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
        ), 0) as stock_cantidad,
        coalesce((
          select sum(m.delta_peso_kg) from public.movements m
          where m.product_id = p.id
            and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
        ), 0) as stock_peso,
        coalesce((
          select sum(m.delta_cantidad) from public.movements m
          where m.product_id = p.id
            and (m.id = p_movement_id or m.id = v_mov.related_movement_id)
        ), 0) as a_anular_cantidad,
        coalesce((
          select sum(m.delta_peso_kg) from public.movements m
          where m.product_id = p.id
            and (m.id = p_movement_id or m.id = v_mov.related_movement_id)
        ), 0) as a_anular_peso
      from public.products p
      where p.id = v_mov.product_id
         or p.id = (select m2.product_id from public.movements m2 where m2.id = v_mov.related_movement_id)
    loop
      if v_check.stock_cantidad - v_check.a_anular_cantidad < 0
         or v_check.stock_peso - v_check.a_anular_peso < 0 then
        raise exception 'STOCK_NEGATIVO_AL_ANULAR' using errcode = '23514';
      end if;
    end loop;
  end if;

  -- 2) Anula el movimiento y, si es transferencia, tambien su pata gemela.
  for v_target in
    select m.*
    from public.movements m
    where m.id = p_movement_id
       or m.id = v_mov.related_movement_id
  loop
    if not exists (select 1 from public.movement_anulations a where a.movement_id = v_target.id) then
      insert into public.movement_anulations (movement_id, motivo, detail, snapshot, created_by)
      values (
        v_target.id,
        p_motivo,
        case
          when v_target.id = p_movement_id then p_detalle
          else coalesce(p_detalle, 'Anulacion en cascada de la pata gemela de la transferencia')
        end,
        to_jsonb(v_target),
        auth.uid()
      );

      insert into public.audit_logs (
        actor_id, actor_email, accion, entidad, entidad_id, entidad_codigo, datos, ip_address, user_agent
      )
      values (
        auth.uid(),
        nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'email', ''),
        'anular'::public.auditoria_accion,
        'movements',
        v_target.id,
        v_target.codigo,
        jsonb_build_object(
          'movimiento', to_jsonb(v_target),
          'motivo_anulacion', p_motivo,
          'detalle', p_detalle,
          'en_cascada', v_target.id <> p_movement_id
        ),
        nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), ''),
        nullif(v_headers ->> 'user-agent', '')
      );
    end if;
  end loop;

  select * into v_anul from public.movement_anulations where movement_id = p_movement_id;

  return v_anul;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Vistas de lectura (RLS del usuario que consulta)
-- ---------------------------------------------------------------------------

create or replace view public.v_stock_productos
with (security_invoker = true)
as
select
  p.id                                as product_id,
  p.display_id,
  p.codigo,
  p.sku,
  p.name                              as producto,
  p.control_mode,
  p.stock_minimo,
  p.category_id,
  c.name                              as categoria,
  p.unit_id,
  u.code                              as unidad,
  p.is_active,
  coalesce(s.cantidad, 0)             as cantidad,
  coalesce(s.peso_kg, 0)              as peso_kg,
  case
    when p.control_mode = 'cantidad' then coalesce(s.cantidad, 0)
    else coalesce(nullif(s.peso_kg, 0), coalesce(s.cantidad, 0))
  end                                 as stock_principal,
  case
    when p.control_mode = 'cantidad' then coalesce(s.cantidad, 0) < p.stock_minimo
    else coalesce(nullif(s.peso_kg, 0), coalesce(s.cantidad, 0)) < p.stock_minimo
  end                                 as bajo_minimo,
  s.ultimo_movimiento_at
from public.products p
left join public.categories c on c.id = p.category_id
left join public.units u on u.id = p.unit_id
left join lateral (
  select
    sum(m.delta_cantidad)    as cantidad,
    sum(m.delta_peso_kg)     as peso_kg,
    max(m.created_at)        as ultimo_movimiento_at
  from public.movements m
  where m.product_id = p.id
    and not exists (select 1 from public.movement_anulations a where a.movement_id = m.id)
) s on true;

comment on view public.v_stock_productos
  is 'Stock calculado, sin columna estatica. cantidad en la unidad base del producto; peso_kg siempre en KG.';

create or replace view public.v_stock_bajo_minimo
with (security_invoker = true)
as
select *
from public.v_stock_productos
where bajo_minimo;

create or replace view public.v_movimientos
with (security_invoker = true)
as
select
  m.id,
  m.display_id,
  m.codigo,
  m.tipo,
  m.motivo,
  m.notes,
  m.created_at,
  m.product_id,
  p.codigo                          as producto_codigo,
  p.name                            as producto,
  p.sku,
  p.control_mode,
  m.cantidad,
  m.peso_kg,
  m.delta_cantidad,
  m.delta_peso_kg,
  m.cantidad_original,
  uo.code                           as unidad_original,
  m.related_movement_id,
  m.created_by,
  pr.full_name                      as registrado_por,
  a.id                              as anulacion_id,
  a.motivo                          as anulacion_motivo,
  a.detail                          as anulacion_detalle,
  a.created_by                      as anulado_por,
  a.created_at                      as anulado_at,
  (select count(*)::integer from public.photos f where f.movement_id = m.id) as fotos_count
from public.movements m
join public.products p on p.id = m.product_id
left join public.units uo on uo.id = m.unidad_original_id
left join public.profiles pr on pr.id = m.created_by
left join public.movement_anulations a on a.movement_id = m.id;

create or replace view public.v_shopping_list
with (security_invoker = true)
as
select
  s.id,
  s.display_id,
  s.codigo,
  s.product_id,
  p.codigo                        as producto_codigo,
  p.name                          as producto,
  p.control_mode,
  p.sku,
  s.descripcion,
  s.unit_id,
  u.code                          as unidad,
  s.cantidad_sugerida,
  s.cantidad_comprada,
  s.precio_unitario,
  s.proveedor,
  s.prioridad,
  s.estado,
  s.notas,
  s.auto_generated,
  s.completed_at,
  s.completed_by,
  s.created_by,
  s.created_at,
  s.updated_at,
  v.stock_principal,
  v.bajo_minimo
from public.shopping_list s
left join public.products p on p.id = s.product_id
left join public.units u on u.id = s.unit_id
left join public.v_stock_productos v on v.product_id = s.product_id;
