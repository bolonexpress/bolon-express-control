import { z } from 'zod';

/**
 * Esquemas Zod de la capa servidor. La base de datos vuelve a validar (RLS,
 * constraints y RPC): esta es la primera de las dos barreras.
 */

export const loginSchema = z
  .object({
    email: z.string().trim().min(1, 'Ingresa tu correo').email('Correo no valido').max(254),
    password: z.string().min(1, 'Ingresa tu contrasena').max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contrasena actual').max(200),
    password: z
      .string()
      .min(12, 'La contrasena debe tener al menos 12 caracteres')
      .max(200)
      .regex(/[a-z]/, 'Debe incluir una letra minuscula')
      .regex(/[A-Z]/, 'Debe incluir una letra mayuscula')
      .regex(/[0-9]/, 'Debe incluir un numero'),
    confirmPassword: z.string().min(1, 'Repite la contrasena'),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  });

export const setUserActiveSchema = z
  .object({
    userId: z.string().uuid('Usuario no valido'),
    isActive: z.boolean(),
  })
  .strict();

export const assignRoleSchema = z
  .object({
    userId: z.string().uuid('Usuario no valido'),
    roleId: z.string().uuid('Rol no valido'),
  })
  .strict();

export const toggleRolePermissionSchema = z
  .object({
    roleId: z.string().uuid('Rol no valido'),
    permissionKey: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z_]+:[a-z_]+$/, 'Permiso no valido'),
    granted: z.boolean(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;