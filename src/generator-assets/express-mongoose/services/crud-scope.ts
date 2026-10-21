/**
 * Normal API kayıt kapsamı — sözleşme §2.1, plan 5 G5. Saf modül; `BaseCrudService` kullanır.
 * `true`: `userId`'si auth kullanıcı olan kayıtlar; `'self'`: kullanıcının kendi kaydı (`users`); `false`: kapsam yok.
 */
export type CrudAuthScope = boolean | 'self';

/** `filter`'ı auth kullanıcıya daraltır (`authUserId` ObjectId olarak gelir); kapsam yoksa kopyasını döner. */
export function applyAuthScope<F extends object>(filter: F, scope: CrudAuthScope, authUserId: unknown): F {
  if (scope === false || authUserId === null || authUserId === undefined) return { ...filter };
  if (scope === 'self') {
    // `$and`: çağıranın `_id`'si (getById / update / delete) ezilmez, iki koşul birlikte aranır.
    return { $and: [{ ...filter }, { _id: authUserId }] } as unknown as F;
  }
  return { ...filter, userId: authUserId };
}
