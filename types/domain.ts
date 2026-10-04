import type { Database, EnumValue } from './database';

// Los enums son parte del dominio: se reexportan para que la UI y los
// repositorios importen todo desde `@/types/domain`.
export type { Enums } from './database';

export type ModoControl = EnumValue<'modo_control'>;
export type UnidadTipo = EnumValue<'unidad_tipo'>;

// -----------------------------------------------------------------------------
// Enums como unions utilizables en runtime (etiquetas, validaciones, filtros)
// -----------------------------------------------------------------------------

export const UNIDAD_TIPO = ['unidad', 'peso', 'volumen'] as const satisfies readonly EnumValue<'unidad_tipo'>[];

export const MODO_CONTROL = ['cantidad', 'peso', 'ambos'] as const satisfies readonly EnumValue<'modo_control'>[];

export const MOVIMIENTO_TIPO = ['entrada', 'salida', 'ajuste'] as const satisfies readonly EnumValue<'movimiento_tipo'>[];

export const MOVIMIENTO_MOTIVO = [
  'compra',
  'venta',
  'devolucion_cliente',
  'devolucion_proveedor',
  'merma',
  'danio',
  'caducidad',
  'perdida',
  'robo',
  'fuga',
  'correccion_inventario',
  'diferencia_conteo',
  'inventario_inicial',
  'transferencia_entrada',
  'transferencia_salida',
  'produccion',
  'consumo_interno',
  'otro',
] as const satisfies readonly EnumValue<'movimiento_motivo'>[];

/**
 * Motivos que la UI ofrece por tipo de movimiento. No son un filtro de
 * seguridad: la RPC acepta cualquier `movimiento_motivo`. Solo acotan lo que se
 * ofrece para no presentar 18 opciones en un movil.
 */
export const MOTIVOS_POR_TIPO: Record<
  EnumValue<'movimiento_tipo'>,
  readonly EnumValue<'movimiento_motivo'>[]
> = {
  entrada: [
    'compra',
    'devolucion_cliente',
    'transferencia_entrada',
    'produccion',
    'correccion_inventario',
    'otro',
  ],
  salida: [
    'venta',
    'merma',
    'caducidad',
    'danio',
    'perdida',
    'robo',
    'fuga',
    'consumo_interno',
    'transferencia_salida',
    'devolucion_proveedor',
    'produccion',
    'otro',
  ],
  ajuste: [
    'correccion_inventario',
    'diferencia_conteo',
    'inventario_inicial',
    'merma',
    'danio',
    'perdida',
    'robo',
    'fuga',
    'otro',
  ],
};

export const ANULACION_MOTIVO = [
  'error_captura',
  'error_doble_registro',
  'devolucion',
  'ajuste_inventario',
  'otro',
] as const satisfies readonly EnumValue<'anulacion_motivo'>[];

export const COMPRAS_ESTADO = ['pendiente', 'en_proceso', 'comprado', 'descartado'] as const satisfies readonly EnumValue<
  'compras_estado'
>[];

export const ROL_KEY = ['admin', 'supervisor', 'operador', 'consulta'] as const;

export type RolKey = (typeof ROL_KEY)[number];

// -----------------------------------------------------------------------------
// Etiquetas en espanol para la UI
// -----------------------------------------------------------------------------

export const MODO_CONTROL_LABEL: Record<EnumValue<'modo_control'>, string> = {
  cantidad: 'Cantidad',
  peso: 'Peso (kg)',
  ambos: 'Cantidad y peso',
};

export const MOVIMIENTO_TIPO_LABEL: Record<EnumValue<'movimiento_tipo'>, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
};

// En un ajuste el signo real no lo da el tipo sino el valor (delta_cantidad).
export const MOVIMIENTO_TIPO_SIGN: Record<EnumValue<'movimiento_tipo'>, 1 | -1 | 0> = {
  entrada: 1,
  salida: -1,
  ajuste: 0,
};

export const MOVIMIENTO_MOTIVO_LABEL: Record<EnumValue<'movimiento_motivo'>, string> = {
  compra: 'Compra',
  venta: 'Venta',
  devolucion_cliente: 'Devolución de cliente',
  devolucion_proveedor: 'Devolución a proveedor',
  merma: 'Merma',
  danio: 'Daño',
  caducidad: 'Caducidad',
  perdida: 'Pérdida',
  robo: 'Robo',
  fuga: 'Fuga',
  correccion_inventario: 'Corrección de inventario',
  diferencia_conteo: 'Diferencia de conteo',
  inventario_inicial: 'Inventario inicial',
  transferencia_entrada: 'Transferencia (entrada)',
  transferencia_salida: 'Transferencia (salida)',
  produccion: 'Producción',
  consumo_interno: 'Consumo interno',
  otro: 'Otro',
};

export const ANULACION_MOTIVO_LABEL: Record<EnumValue<'anulacion_motivo'>, string> = {
  error_captura: 'Error de captura',
  error_doble_registro: 'Registro duplicado',
  devolucion: 'Devolucion',
  ajuste_inventario: 'Ajuste de inventario',
  otro: 'Otro',
};

export const COMPRAS_ESTADO_LABEL: Record<EnumValue<'compras_estado'>, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  comprado: 'Comprado',
  descartado: 'Descartado',
};

export const COMPRAS_HISTORIAL_TIPO_LABEL: Record<EnumValue<'compras_historial_tipo'>, string> = {
  creacion: 'Creación',
  edicion: 'Edición',
  cambio_estado: 'Cambio de estado',
  cambio_cantidad: 'Cambio de cantidad',
  eliminacion: 'Eliminación',
};

/**
 * Transiciones permitidas de la lista de compras (ARCHITECTURE.md §6.3:
 * pendiente → en_proceso → comprado | descartado). El mismo mapa lo valida la
 * Server Action Y el trigger `trg_shopping_transicion` (migracion 11): la
 * accion da el mensaje amable, el trigger cierra la puerta por SQL directo.
 * Los estados terminales no tienen salida: un error se corrige registrando
 * un pendiente nuevo, no resucitando el descartado.
 */
export const COMPRAS_TRANSICIONES: Record<
  EnumValue<'compras_estado'>,
  readonly EnumValue<'compras_estado'>[]
> = {
  pendiente: ['en_proceso', 'descartado'],
  en_proceso: ['comprado', 'descartado'],
  comprado: [],
  descartado: [],
};

export const PRIORIDAD_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Alta',
  2: 'Media',
  3: 'Baja',
};

export const AUDITORIA_ACCION_LABEL: Record<EnumValue<'auditoria_accion'>, string> = {
  crear: 'Creo',
  actualizar: 'Actualizo',
  eliminar: 'Elimino',
  anular: 'Anulo',
  login: 'Inicio de sesion',
  logout: 'Cierre de sesion',
  cambio_password: 'Cambio de contrasena',
  cambio_estado_usuario: 'Cambio de estado de usuario',
  asignar_rol: 'Asignacion de rol',
  config_cambio: 'Cambio de configuracion',
  acceso_denegado: 'Acceso denegado',
};

export const UNIDAD_TIPO_LABEL: Record<EnumValue<'unidad_tipo'>, string> = {
  unidad: 'Conteo',
  peso: 'Peso',
  volumen: 'Volumen',
};

// -----------------------------------------------------------------------------
// Permisos
// -----------------------------------------------------------------------------

export const PERMISOS = {
  usersManage: 'users:manage',
  catalogRead: 'catalog:read',
  catalogWrite: 'catalog:write',
  movementsRead: 'movements:read',
  movementsWrite: 'movements:write',
  movementsAnular: 'movements:anular',
  movementsExport: 'movements:export',
  historyRead: 'history:read',
  inventoryRead: 'inventory:read',
  photosRead: 'photos:read',
  photosWrite: 'photos:write',
  photosDelete: 'photos:delete',
  shoppingRead: 'shopping:read',
  shoppingWrite: 'shopping:write',
  reportsRead: 'reports:read',
  reportsExport: 'reports:export',
  auditRead: 'audit:read',
  configWrite: 'config:write',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

// -----------------------------------------------------------------------------
// Configuracion global (claves de app_config, Fase 1 seed)
// -----------------------------------------------------------------------------

export const CONFIG_KEYS = {
  businessName: 'business_name',
  currency: 'currency',
  timezone: 'timezone',
  weightInternalUnit: 'weight_internal_unit',
  weightDisplayUnit: 'weight_display_unit',
  weightLbToKg: 'weight_lb_to_kg',
  requireMovementPhoto: 'require_movement_photo',
  requireMovementReason: 'require_movement_reason',
  allowNegativeStock: 'allow_negative_stock',
  lowStockAlertsEnabled: 'low_stock_alerts_enabled',
  shoppingDefaultPriority: 'shopping_default_priority',
  photosMaxSizeBytes: 'photos_max_size_bytes',
} as const satisfies Record<string, string>;

export const LB_TO_KG = 0.45359237;

export const PHOTO_BUCKET = 'movement-photos';

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export const PHOTO_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export const DISPLAY_ID_DIGITS = 6;

// -----------------------------------------------------------------------------
// DTOs de lectura que la UI consume
// -----------------------------------------------------------------------------

export type StockRow = Database['public']['Views']['v_stock_productos']['Row'];
export type MovimientoRow = Database['public']['Views']['v_movimientos']['Row'];
export type ShoppingRow = Database['public']['Views']['v_shopping_list']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// Filas del catalogo base. Los repositorios las usan para tipar lo que devuelve
// PostgREST (con `select` explicito de columnas, nunca `select *`).
export type UnitRow = Database['public']['Tables']['units']['Row'];
export type CategoryRow = Database['public']['Tables']['categories']['Row'];
export type ProductRow = Database['public']['Tables']['products']['Row'];

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

/**
 * Opcion de unidad para el formulario de producto. Lleva el factor para que el
 * formulario pueda previsualizar la conversion a kg; el valor que se guarda lo
 * decide el servidor, nunca este dato.
 */
export type UnitFormOption = {
  value: string;
  label: string;
  unit_type: UnidadTipo;
  factor_to_base: number;
  is_active: boolean;
};

/**
 * Estado de los formularios del catalogo (ver ARCHITECTURE.md §7: toda Server
 * Action devuelve `ActionResult`). Vive aqui y no en el modulo `'use server'`
 * porque los componentes cliente necesitan el tipo.
 */
export type CatalogActionState = Resultado<{ id: string; mensaje: string }> | null;

/** Estado de los formularios de compras (agregar pendiente, cambiar estado). */
export type ShoppingActionState = Resultado<{ id: string; mensaje: string }> | null;

// -----------------------------------------------------------------------------
// Usuarios (Fase 10): DTOs que la UI consume
// -----------------------------------------------------------------------------

/**
 * Un usuario con sus roles, tal como lo pinta el listado y la ficha.
 *
 * `email` no viene de `profiles`: vive en `auth.users` y exige service_role en
 * servidor. Por eso puede venir `null` (sin `SUPABASE_SERVICE_ROLE_KEY` la app
 * sigue funcionando, pero sin correos) y la UI lo trata como "no disponible",
 * no como "no tiene".
 */
export type UsuarioRow = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  force_password_change: boolean;
  last_seen_at: string | null;
  created_at: string;
  roleKeys: string[];
  roleNames: string[];
};

/**
 * Estado de las Server Actions de usuarios.
 *
 * `claveTemporal` viaja aqui, en la respuesta de la accion, y NO en la URL:
 * una contrasena en un query param queda en el historial del navegador, en los
 * logs del servidor y en el Referer. La UI la muestra una vez y la borra al
 * navegar.
 */
export type UsuariosActionState =
  | Resultado<{
      mensaje: string;
      claveTemporal?: string;
      email?: string;
      filas?: UsuarioRow[];
      nextCursor?: string | null;
    }>
  | null;

// -----------------------------------------------------------------------------
// Compras (Fase 6): DTOs que la UI consume
// -----------------------------------------------------------------------------

/** Fila de `v_shopping_list` tal como la lee el repositorio de compras. */
export type CompraItem = ShoppingRow;

/** Una entrada del historial del pendiente con el nombre legible del autor. */
export type CompraHistorialItem = {
  id: number;
  tipo_registro: EnumValue<'compras_historial_tipo'>;
  estado_anterior: EnumValue<'compras_estado'> | null;
  estado_nuevo: EnumValue<'compras_estado'> | null;
  changed_by: string;
  changed_by_nombre: string | null;
  created_at: string;
};

/** Opcion de producto del selector rapido del formulario de pendientes. */
export type ProductoCompraOption = {
  id: string;
  nombre: string;
  codigo: string | null;
  unidad: string | null;
  unit_id: string | null;
};

// -----------------------------------------------------------------------------
// Historial (Fase 7): DTOs que la UI y la Server Action comparten
// -----------------------------------------------------------------------------

/** Fila del historial tal como la lee el repositorio y la pinta la UI. */
export type HistorialRow = MovimientoRow;

/** Filtros del historial. El cursor keyset es `created_at|id` del ultimo dato visto. */
export type HistorialFiltros = {
  /** YYYY-MM-DD, inclusive, en hora America/Guayaquil. */
  desde: string | null;
  /** YYYY-MM-DD, inclusive, en hora America/Guayaquil. */
  hasta: string | null;
  tipo: EnumValue<'movimiento_tipo'> | null;
  productoId: string | null;
  usuarioId: string | null;
  cursor: string | null;
};

/** Pagina de resultados del historial. `nextCursor` y `hayMas` van siempre juntos. */
export type HistorialPagina = {
  filas: MovimientoRow[];
  nextCursor: string | null;
};

/** Opciones para los selectores de filtro (producto y responsable). */
export type HistorialOpciones = {
  productos: { id: string; nombre: string; codigo: string | null }[];
  usuarios: { id: string; nombre: string }[];
};

// -----------------------------------------------------------------------------
// Auditoria (Fase 8): DTOs que la UI y la Server Action comparten
// -----------------------------------------------------------------------------

export type AuditoriaRow = Database['public']['Tables']['audit_logs']['Row'];

/** Acciones auditables (es el enum de la base, exportado para los selectores). */
export const AUDITORIA_ACCIONES = [
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
  'acceso_denegado',
] as const satisfies readonly EnumValue<'auditoria_accion'>[];

/** Entidades con bitacora (cubiertas por trigger, RPC de movimientos o log_audit). */
export const AUDITORIA_ENTIDADES = [
  'products',
  'categories',
  'units',
  'profiles',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'app_config',
  'shopping_list',
  'movements',
  'movement_anulations',
  'auth',
] as const;

export type AuditoriaEntidad = (typeof AUDITORIA_ENTIDADES)[number];

export const AUDITORIA_ENTIDAD_LABEL: Record<string, string> = {
  products: 'Productos',
  categories: 'Categorías',
  units: 'Unidades',
  profiles: 'Perfiles',
  roles: 'Roles',
  permissions: 'Permisos',
  role_permissions: 'Permisos por rol',
  user_roles: 'Roles de usuario',
  app_config: 'Configuración',
  shopping_list: 'Lista de compras',
  movements: 'Movimientos',
  movement_anulations: 'Anulaciones',
  auth: 'Autenticación',
};

export type AuditoriaPagina = {
  filas: AuditoriaRow[];
  nextCursor: string | null;
};

export type AuditoriaOpciones = {
  usuarios: { id: string; nombre: string }[];
};
