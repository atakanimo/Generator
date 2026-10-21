/**
 * JSON'a giden veri — sözleşme K1 (kimlik her zaman `id`) ve K5 (decimal string).
 *
 * Mongo'ya özgü dönüşümler:
 * - `_id` → `id` (iç içe: populate edilmiş referanslar, subdoc dizileri); `_id` cevaptan çıkar
 * - `ObjectId` → hex string, `Decimal128` → string
 * - Mongoose dokümanı → `toJSON()` (model `toJSON` transform'ları, ör. `delete obj.password`, korunur)
 * - `Map` → düz obje
 *
 * Saf modül: mongoose import etmez (BSON tipleri `_bsontype` ile tanınır).
 */

type BsonLike = { _bsontype?: unknown; toString(): string };
type MongooseDocumentLike = { $__: unknown; toJSON(): unknown };

function bsonTypeOf(value: object): unknown {
  return (value as BsonLike)._bsontype;
}

function isMongooseDocument(value: object): value is MongooseDocumentLike {
  return '$__' in value && typeof (value as MongooseDocumentLike).toJSON === 'function';
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function idString(value: unknown): string {
  if (value && typeof value === 'object' && bsonTypeOf(value) === 'ObjectId') return value.toString();
  return String(value);
}

export function toWire(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toWire);
  if (value instanceof Date) return value;

  const bsonType = bsonTypeOf(value);
  if (bsonType === 'ObjectId' || bsonType === 'Decimal128') return value.toString();
  if (isMongooseDocument(value)) return toWire(value.toJSON());
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, child]) => [String(key), toWire(child)]));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  if (value._id !== undefined && value._id !== null && value.id === undefined) {
    out.id = idString(value._id);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '_id') continue;
    out[key] = toWire(child);
  }
  return out;
}
