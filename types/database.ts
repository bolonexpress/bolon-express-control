// Tipos del esquema de base de datos.
// Fuente de verdad: supabase/migrations/*.sql
// Cuando se ejecute `supabase gen types typescript --linked`, reemplazar este
// archivo por la salida generada y no editarlo a mano.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Enums = {
  unidad_tipo: 'unidad' | 'peso' | 'volumen';
  modo_control: 'cantidad' | 'peso' | 'ambos';
  movimiento_tipo: 'entrada' | 'salida' | 'ajuste';
  movimiento_motivo:
    | 'compra'
    | 'venta'
    | 'devolucion_cliente'
    | 'devolucion_proveedor'
    | 'merma'
    | 'danio'
    | 'caducidad'
    | 'perdida'
    | 'robo'
    | 'fuga'
    | 'correccion_inventario'
    | 'diferencia_conteo'
    | 'inventario_inicial'
    | 'transferencia_entrada'
    | 'transferencia_salida'
    | 'produccion'
    | 'consumo_interno'
    | 'otro';
  anulacion_motivo: 'error_captura' | 'error_doble_registro' | 'devolucion' | 'ajuste_inventario' | 'otro';
  compras_estado: 'pendiente' | 'en_proceso' | 'comprado' | 'descartado';
  compras_historial_tipo: 'creacion' | 'edicion' | 'cambio_estado' | 'cambio_cantidad' | 'eliminacion';
  auditoria_accion:
    | 'crear'
    | 'actualizar'
    | 'eliminar'
    | 'anular'
    | 'login'
    | 'logout'
    | 'cambio_password'
    | 'cambio_estado_usuario'
    | 'asignar_rol'
    | 'config_cambio'
    | 'acceso_denegado';
};

type UnitRow = {
  id: string;
  code: string;
  name: string;
  unit_type: Enums['unidad_tipo'];
  factor_to_base: number;
  base_unit: boolean;
  allow_fractional: boolean;
  decimals: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProductRow = {
  id: string;
  display_id: number;
  codigo: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  unit_id: string;
  control_mode: Enums['modo_control'];
  stock_minimo: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ShoppingListRow = {
  id: string;
  display_id: number;
  codigo: string;
  product_id: string | null;
  descripcion: string;
  unit_id: string | null;
  cantidad_sugerida: number;
  cantidad_comprada: number | null;
  precio_unitario: number | null;
  proveedor: string | null;
  prioridad: number;
  estado: Enums['compras_estado'];
  notas: string | null;
  auto_generated: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type StockRow = {
  product_id: string;
  display_id: number;
  codigo: string;
  sku: string;
  producto: string;
  control_mode: Enums['modo_control'];
  stock_minimo: number;
  category_id: string | null;
  categoria: string | null;
  unit_id: string;
  unidad: string;
  is_active: boolean;
  cantidad: number;
  peso_kg: number;
  stock_principal: number;
  bajo_minimo: boolean;
  ultimo_movimiento_at: string | null;
};

export type Tables = {
  profiles: Table<
    {
      id: string;
      full_name: string;
      phone: string | null;
      is_active: boolean;
      force_password_change: boolean;
      last_seen_at: string | null;
      created_at: string;
      updated_at: string;
    },
    {
      id: string;
      full_name?: string;
      phone?: string | null;
      is_active?: boolean;
      force_password_change?: boolean;
      last_seen_at?: string | null;
      created_at?: string;
      updated_at?: string;
    },
    { full_name?: string; phone?: string | null; last_seen_at?: string | null; is_active?: boolean; force_password_change?: boolean }
  >;

  permissions: Table<{
    key: string;
    module: string;
    description: string;
    is_sensitive: boolean;
  }>;

  roles: Table<
    {
      id: string;
      key: string;
      name: string;
      description: string | null;
      is_system: boolean;
      created_at: string;
    },
    {
      key: string;
      name: string;
      description?: string | null;
      is_system?: boolean;
      created_at?: string;
      id?: string;
    },
    { name?: string; description?: string | null; is_system?: boolean }
  >;

  role_permissions: Table<
    { role_id: string; permission_key: string; created_at: string },
    { role_id: string; permission_key: string; created_at?: string }
  >;

  user_roles: Table<
    { user_id: string; role_id: string; granted_at: string; granted_by: string | null },
    { user_id: string; role_id: string; granted_at?: string; granted_by?: string | null }
  >;

  units: Table<
    UnitRow,
    {
      code: string;
      name: string;
      unit_type: Enums['unidad_tipo'];
      factor_to_base?: number;
      base_unit?: boolean;
      allow_fractional?: boolean;
      decimals?: number;
      is_active?: boolean;
      id?: string;
      created_at?: string;
      updated_at?: string;
    },
    Partial<Omit<UnitRow, 'id' | 'created_at' | 'updated_at'>>
  >;

  categories: Table<
    CategoryRow,
    {
      name: string;
      code?: string | null;
      parent_id?: string | null;
      is_active?: boolean;
      sort_order?: number;
      id?: string;
      created_at?: string;
      updated_at?: string;
    },
    Partial<Omit<CategoryRow, 'id' | 'created_at' | 'updated_at'>>
  >;

  products: Table<
    ProductRow,
    {
      sku: string;
      name: string;
      unit_id: string;
      barcode?: string | null;
      description?: string | null;
      brand?: string | null;
      category_id?: string | null;
      control_mode?: Enums['modo_control'];
      stock_minimo?: number;
      notes?: string | null;
      is_active?: boolean;
      id?: string;
      created_at?: string;
      updated_at?: string;
    },
    Partial<Omit<ProductRow, 'id' | 'display_id' | 'codigo' | 'created_at' | 'updated_at'>>
  >;

  movements: Table<
    {
      id: string;
      display_id: number;
      codigo: string;
      tipo: Enums['movimiento_tipo'];
      product_id: string;
      cantidad: number | null;
      peso_kg: number | null;
      delta_cantidad: number | null;
      delta_peso_kg: number | null;
      motivo: Enums['movimiento_motivo'];
      related_movement_id: string | null;
      cantidad_original: number | null;
      unidad_original_id: string | null;
      notes: string | null;
      idempotency_key: string;
      created_by: string;
      created_at: string;
    },
    {
      tipo: Enums['movimiento_tipo'];
      product_id: string;
      idempotency_key: string;
      motivo: Enums['movimiento_motivo'];
      created_by: string;
      cantidad?: number | null;
      peso_kg?: number | null;
      related_movement_id?: string | null;
      cantidad_original?: number | null;
      unidad_original_id?: string | null;
      notes?: string | null;
      id?: string;
      created_at?: string;
    }
  >;

  movement_anulations: Table<
    {
      id: string;
      movement_id: string;
      motivo: Enums['anulacion_motivo'];
      detail: string | null;
      snapshot: Json;
      created_by: string;
      created_at: string;
    },
    { movement_id: string; motivo: Enums['anulacion_motivo']; detail?: string | null; snapshot?: Json; created_by: string; id?: string; created_at?: string }
  >;

  photos: Table<
    {
      id: string;
      movement_id: string;
      path: string;
      mime_type: string;
      size_bytes: number;
      width: number | null;
      height: number | null;
      created_by: string;
      created_at: string;
    },
    {
      movement_id: string;
      path: string;
      mime_type: string;
      size_bytes: number;
      created_by: string;
      width?: number | null;
      height?: number | null;
      id?: string;
      created_at?: string;
    }
  >;

  shopping_list: Table<
    ShoppingListRow,
    {
      descripcion?: string;
      cantidad_sugerida?: number;
      created_by: string;
      product_id?: string | null;
      unit_id?: string | null;
      cantidad_comprada?: number | null;
      precio_unitario?: number | null;
      proveedor?: string | null;
      prioridad?: number;
      estado?: Enums['compras_estado'];
      notas?: string | null;
      auto_generated?: boolean;
      completed_at?: string | null;
      completed_by?: string | null;
      id?: string;
      created_at?: string;
      updated_at?: string;
    },
    Partial<Omit<ShoppingListRow, 'id' | 'display_id' | 'codigo' | 'created_at' | 'updated_at'>>
  >;

  shopping_list_history: Table<
    {
      id: number;
      shopping_list_id: string;
      tipo_registro: Enums['compras_historial_tipo'];
      estado_anterior: Enums['compras_estado'] | null;
      estado_nuevo: Enums['compras_estado'] | null;
      snapshot: Json;
      changed_by: string;
      created_at: string;
    },
    {
      shopping_list_id: string;
      tipo_registro: Enums['compras_historial_tipo'];
      snapshot: Json;
      changed_by: string;
      estado_anterior?: Enums['compras_estado'] | null;
      estado_nuevo?: Enums['compras_estado'] | null;
      created_at?: string;
    }
  >;

  audit_logs: Table<
    {
      id: number;
      actor_id: string | null;
      actor_email: string | null;
      accion: Enums['auditoria_accion'];
      entidad: string;
      entidad_id: string | null;
      entidad_codigo: string | null;
      datos: Json;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    },
    {
      accion: Enums['auditoria_accion'];
      entidad: string;
      actor_id?: string | null;
      actor_email?: string | null;
      entidad_id?: string | null;
      entidad_codigo?: string | null;
      datos?: Json;
      ip_address?: string | null;
      user_agent?: string | null;
      created_at?: string;
    }
  >;

  app_config: Table<
    {
      key: string;
      value: Json;
      value_type: 'string' | 'number' | 'boolean' | 'json';
      description: string | null;
      is_public: boolean;
      updated_by: string | null;
      updated_at: string;
    },
    {
      key: string;
      value: Json;
      value_type?: 'string' | 'number' | 'boolean' | 'json';
      description?: string | null;
      is_public?: boolean;
      updated_by?: string | null;
      updated_at?: string;
    },
    { value: Json; value_type?: 'string' | 'number' | 'boolean' | 'json'; description?: string | null; is_public?: boolean; updated_by?: string | null }
  >;
};

export type Views = {
  v_stock_productos: Table<StockRow>;

  v_stock_bajo_minimo: Table<StockRow>;

  v_movimientos: Table<{
    id: string;
    display_id: number;
    codigo: string;
    tipo: Enums['movimiento_tipo'];
    motivo: Enums['movimiento_motivo'];
    notes: string | null;
    created_at: string;
    product_id: string;
    producto_codigo: string;
    producto: string;
    sku: string;
    control_mode: Enums['modo_control'];
    cantidad: number | null;
    peso_kg: number | null;
    delta_cantidad: number | null;
    delta_peso_kg: number | null;
    cantidad_original: number | null;
    unidad_original: string | null;
    related_movement_id: string | null;
    created_by: string;
    registrado_por: string | null;
    anulacion_id: string | null;
    anulacion_motivo: Enums['anulacion_motivo'] | null;
    anulacion_detalle: string | null;
    anulado_por: string | null;
    anulado_at: string | null;
    fotos_count: number;
  }>;

  v_shopping_list: Table<{
    id: string;
    display_id: number;
    codigo: string;
    product_id: string | null;
    producto_codigo: string | null;
    producto: string | null;
    control_mode: Enums['modo_control'] | null;
    sku: string | null;
    descripcion: string;
    unit_id: string | null;
    unidad: string | null;
    cantidad_sugerida: number;
    cantidad_comprada: number | null;
    precio_unitario: number | null;
    proveedor: string | null;
    prioridad: number;
    estado: Enums['compras_estado'];
    notas: string | null;
    auto_generated: boolean;
    completed_at: string | null;
    completed_by: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    stock_principal: number | null;
    bajo_minimo: boolean | null;
  }>;
};

export type Functions = {
  format_display_id: { Args: { p_display_id: number }; Returns: string };
  photo_object_path: { Args: { p_path: string }; Returns: string };
  is_active_user: { Args: Record<string, never>; Returns: boolean };
  is_admin: { Args: Record<string, never>; Returns: boolean };
  has_permission: { Args: { p_permission: string }; Returns: boolean };
  require_permission: { Args: { p_permission: string }; Returns: undefined };
  get_config_text: { Args: { p_key: string; p_default?: string | null }; Returns: string | null };
  get_config_number: { Args: { p_key: string; p_default?: number | null }; Returns: number | null };
  get_config_bool: { Args: { p_key: string; p_default?: boolean }; Returns: boolean };
  log_audit: {
    Args: {
      p_accion: Enums['auditoria_accion'];
      p_entidad: string;
      p_datos?: Json;
      p_entidad_id?: string | null;
      p_entidad_codigo?: string | null;
    };
    Returns: undefined;
  };
  registrar_movimiento: {
    Args: {
      p_product_id: string;
      p_tipo: Enums['movimiento_tipo'];
      p_idempotency_key: string;
      p_cantidad?: number | null;
      p_peso_kg?: number | null;
      p_motivo?: Enums['movimiento_motivo'] | null;
      p_notes?: string | null;
      p_cantidad_original?: number | null;
      p_unidad_original_id?: string | null;
      p_related_movement_id?: string | null;
    };
    Returns: Tables['movements']['Row'];
  };
  anular_movimiento: {
    Args: { p_movement_id: string; p_motivo: Enums['anulacion_motivo']; p_detalle?: string | null };
    Returns: Tables['movement_anulations']['Row'];
  };
};

export type Database = {
  public: {
    Tables: Tables & { [_: string]: never };
    Views: Views & { [_: string]: never };
    Functions: Functions & { [_: string]: never };
    Enums: Enums;
    CompositeTypes: Record<string, never>;
  };
};

export type TableRow<K extends keyof Tables> = Tables[K]['Row'];
export type TableInsert<K extends keyof Tables> = Tables[K]['Insert'];
export type TableUpdate<K extends keyof Tables> = Tables[K]['Update'];
export type ViewRow<K extends keyof Views> = Views[K]['Row'];
export type EnumValue<K extends keyof Enums> = Enums[K];
