/** Express `Request` ekleri (middleware'lerin yazdığı alanlar). */
import type { IUsers } from '@modules/users/users.model';

declare global {
  namespace Express {
    interface Request {
      /** `x-request-id` (en çok 128 karakter) ya da üretilen UUID: `requestIdMiddleware`. */
      requestId?: string;
      /** Token'ın `sub` claim'i: `authMiddleware`. */
      userId?: string;
      /** Giriş yapmış kullanıcının kaydı (DB'den): `authMiddleware`. */
      authUser?: IUsers;
      /** `[authUser.role]`: `authMiddleware`. */
      userRoles?: string[];
    }
  }
}

export {};
