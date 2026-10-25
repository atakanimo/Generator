/** Express `Request` ekleri (middleware'lerin yazdığı alanlar). */
export {};

declare global {
  namespace Express {
    interface Request {
      /** `x-request-id` (en çok 128 karakter) ya da üretilen UUID: `requestIdMiddleware`. */
      requestId?: string;
      /** Token'ın `userId` ya da `sub` claim'i: `authMiddleware`. */
      userId?: string;
      /** Token'ın `role` claim'i (string ya da liste): `authMiddleware`. */
      userRoles?: string[];
    }
  }
}
