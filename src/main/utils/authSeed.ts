/**
 * First admin of a new host (docs/backend/auth.md "İlk admin"): the bootstrap dialog's e-mail / name / password become a
 * seed file in the host with the bcrypt hash only (`$2b$12$…`, verified by bcryptjs, Python `bcrypt` and
 * BCrypt.Net-Next alike). The plain password never reaches the project.
 */
import bcrypt from 'bcryptjs';
import { authAdminError, type AuthBootstrapOptions } from '../../shared/authModules.js';

export const AUTH_BCRYPT_COST = 12;

export interface AuthSeedAdmin {
  email: string;
  name: string;
  passwordHash: string;
}

export function buildAuthSeedAdmin(admin: AuthBootstrapOptions['admin']): AuthSeedAdmin {
  const error = authAdminError(admin);
  if (error) throw new Error(error);
  return {
    email: admin.email.trim().toLowerCase(),
    name: admin.name.trim(),
    passwordHash: bcrypt.hashSync(admin.password, AUTH_BCRYPT_COST)
  };
}
