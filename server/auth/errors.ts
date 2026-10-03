export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Sesion requerida') {
    super('SESION_REQUERIDA', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  readonly permission: string;

  constructor(permission: string, message = `Permiso requerido: ${permission}`) {
    super('PERMISO_DENEGADO', message);
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}