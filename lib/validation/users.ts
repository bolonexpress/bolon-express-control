import { z } from 'zod';

/**
 * Esquemas Zod de la administracion de usuarios (Fase 10).
 *
 * Los mismos filtros viajan por dos caminos: como `searchParams` (la pagina los
 * lee de la URL, para que el listado sea compartible) y como objeto desde la
 * Server Action del "Cargar mas". Un solo esquema los normaliza en los dos, y
 * un filtro manipulado degrada a "sin filtro" en vez de reventar la pagina.
 *
 * El cursor de keyset es `base64url(nombre)|uuid`. El nombre va en base64 a
 * proposito: un nombre puede traer acentos, espacios o comas, y dentro de un
 * filtro `or(...)` de PostgREST una coma rompe la sintaxis. Codificandolo, el
 * cursor viaja entero por la URL y el servidor lo decodifica y lo escapa antes
 * de usarlo.
 */

const vacioANulo = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
    esquema,
  );

/** Roles del sistema. La lista es cerrada a proposito (ver migracion 01). */
export const ROLES_KEY = ['admin', 'supervisor', 'operador', 'consulta'] as const;

export type RolKey = (typeof ROLES_KEY)[number];

export const ROL_LABEL: Record<RolKey, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operador: 'Operador',
  consulta: 'Consulta',
};

/** Una frase por rol: quien elige tiene que saber a qué se está exposeiendo. */
export const ROL_RESUMEN: Record<RolKey, string> = {
  admin: 'Puede hacer de todo, incluidas las pantallas de administración.',
  supervisor: 'Controla el día a día: catálogo, movimientos y compras. No entra a administración.',
  operador: 'Registra entradas, salidas y ajustes, y anota lo que hay que comprar.',
  consulta: 'Solo mira: no puede cambiar nada.',
};

export const ESTADO_FILTRO = ['todos', 'activo', 'inactivo'] as const;
export type EstadoFiltro = (typeof ESTADO_FILTRO)[number];

export const ESTADO_LABEL: Record<EstadoFiltro, string> = {
  todos: 'Todos',
  activo: 'Activos',
  inactivo: 'Inactivos',
};

const cursorSeguro = vacioANulo(
  z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9_-]+\|[0-9a-f-]{36}$/i, 'Cursor inválido')
    .nullable(),
);

export const usuariosFiltrosSchema = z
  .object({
    busqueda: vacioANulo(z.string().trim().min(1).max(120).nullable()),
    rol: vacioANulo(z.enum(ROLES_KEY, { message: 'Rol no válido' }).nullable()),
    estado: z.enum(ESTADO_FILTRO).default('todos'),
    cursor: cursorSeguro,
  })
  .strict();

export type UsuariosFiltrosInput = z.input<typeof usuariosFiltrosSchema>;
export type UsuariosFiltrosParsed = z.infer<typeof usuariosFiltrosSchema>;

/**
 * Alta de usuario. El correo es la identidad en Supabase Auth y no se puede
 * cambiar despues desde aqui, asi que se valida con la misma forma que el login.
 *
 * La contrasena NO la escribe el admin: la genera el servidor y se muestra una
 * sola vez (ver `generarContrasenaTemporal`). Aqui solo se valida el longitud
 * minimo por si algun dia se admite escribirla a mano.
 */
export const crearUsuarioSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre de la persona')
      .max(120, 'El nombre es demasiado largo'),
    email: z.string().trim().min(1, 'Escribe el correo').email('Correo no válido').max(254),
    phone: vacioANulo(
      z
        .string()
        .trim()
        .regex(/^[0-9+\-\s()]{7,20}$/, 'Teléfono no válido (solo números, espacios y + - ( ))'),
    ),
    rol: z.enum(ROLES_KEY, { message: 'Elige un rol' }),
  })
  .strict();

/** Edicion de los datos de contacto. El rol y el estado van en su propia accion. */
export const editarUsuarioSchema = z
  .object({
    userId: z.string().uuid('Usuario no válido'),
    full_name: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre de la persona')
      .max(120, 'El nombre es demasiado largo'),
    phone: vacioANulo(
      z
        .string()
        .trim()
        .regex(/^[0-9+\-\s()]{7,20}$/, 'Teléfono no válido (solo números, espacios y + - ( ))'),
    ),
  })
  .strict();

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;