/**
 * Generated CRUD'da gizli alanlar — sözleşme §2.1, plan 5 G2: şifre, OTP gibi alanlar hiçbir cevapta dönmez.
 * Saf modül; `BaseCrudService` kullanır.
 */

export type CrudProjection = string | Record<string, 0 | 1 | boolean> | null | undefined;

/** Sorgu projection'ı: açıkça verilen öncelikli; yoksa gizli alanlar dışlanır (`-password -otpCode`). */
export function resolveCrudProjection(projection: CrudProjection, hiddenFields: readonly string[]): CrudProjection {
  if (projection) return projection;
  return hiddenFields.length > 0 ? hiddenFields.map(field => `-${field}`).join(' ') : undefined;
}

/**
 * Düz objelerden (lean sonuç, `toObject()`) gizli alanları siler. Mongoose dokümanlarına dokunmaz:
 * dokümanda alan silmek sonraki bir `.save()` ile veritabanına yazılabilir.
 */
export function stripHiddenFields<T>(value: T, hiddenFields: readonly string[]): T {
  if (hiddenFields.length === 0 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => stripHiddenFields(item, hiddenFields)) as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = { ...(value as Record<string, unknown>) };
  for (const field of hiddenFields) delete out[field];
  return out as T;
}
