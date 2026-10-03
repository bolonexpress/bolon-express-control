-- =============================================================================
-- BOLON EXPRESS · Migracion 09 · Movimientos (Fase 4)
-- Tres cambios, todos Justificados por la primera entrega de movimientos:
--
-- 1. Enum `movimiento_motivo`: anade los motivos de ajuste que el negocio
--    pidio y que no existian (danio, diferencia de conteo, inventario inicial).
-- 2. `app_config.require_movement_photo` pasa a `true`. La Fase 1 lo sembro en
--    `false` por comodidad del despliegue, pero el principio de ARCHITECTURE.md
--    §1 ("movimientos con foto") y el enunciado de la Fase 4 lo exigen. El
--    admin puede devolverlo a `false` desde la Fase 6.
-- 3. `registrar_movimiento()`: el control de stock >= 0 solo miraba el peso
--    cuando control_mode = 'peso', dejando que un producto en modo 'ambos'
--    terminara con peso negativo (el peso es el stock_principal de ese modo).
--
-- El cuerpo de la funcion es IDENTICO al de la migracion 03 salvo por ese unico
-- predicado; se repite aqui porque Postgres no permite parchear el cuerpo de
-- una funcion sin redefinirla por completo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Motivos de ajuste que faltaban
-- ---------------------------------------------------------------------------

alter type public.movimiento_motivo add value if not exists 'danio';
alter type public.movimiento_motivo add value if not exists 'diferencia_conteo';
alter type public.movimiento_motivo add value if not exists 'inventario_inicial';

comment on type public.movimiento_motivo is
  'Motivo de todo movimiento. Es NOT NULL: la RPC registrar_movimiento lo exige siempre, no solo en ajustes.';

-- ---------------------------------------------------------------------------
-- 2. Foto obligatoria por defecto
-- ---------------------------------------------------------------------------

update public.app_config
   set value = 'true'::jsonb
 where key = 'require_movement_photo'
   and value <> 'true'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. registrar_movimiento: stock >= 0 tambien en modo 'ambos'
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
       or (v_product.control_mode in ('peso', 'ambos') and v_stock_peso + coalesce(v_delta_peso, 0) < 0)
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
  is 'Unica via de escritura de movimientos. Atomica: valida permiso, idempotencia, modo de control y stock >= 0 dentro de la misma transaccion. p_cantidad y p_cantidad_original van en la unidad BASE del producto; peso_kg siempre en KG.';