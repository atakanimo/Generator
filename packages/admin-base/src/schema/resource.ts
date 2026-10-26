import type { Id, SortOrder } from '../contract/api.js';
import type { FieldConfig, InferFields, InferFilters } from './fields.js';

/** Generator'ın ürettiği config şemasının sürümü; kırıcı değişiklikte artar. */
export const RESOURCE_SCHEMA_VERSION = 1;

/**
 * Generator'ın `modules/<m>/<m>.generated.config.ts` dosyasına yazdığı, BE/DB'den bağımsız veri.
 * Davranış (action, custom cell, slot) burada değil, `extendResource` ile eklenir.
 */
export interface ResourceSchema<Fs extends readonly FieldConfig[] = readonly FieldConfig[]> {
  schemaVersion: typeof RESOURCE_SCHEMA_VERSION;
  /** Registry anahtarı; ilişkilerde `ref` bunu gösterir (ör. `user-subscriptions`). */
  name: string;
  /** Admin base path; paket path türetmez (ör. `/api/userSubscriptions/admin`). */
  endpoint: string;
  label?: string;
  /** Kaydı adlandıran alan (ör. `name`, `ticker`): silme onayında «değer» gösterilir. Yoksa genel metin. */
  titleField?: string;
  fields: Fs;
  defaultSort?: { field: string; order: SortOrder };
  /** `false` → hiçbir kolon sıralanmaz, `defaultSort` yok sayılır (BE liste ucu sıralama desteklemiyorsa). */
  sortable?: boolean;
  pageSize?: number;
  /** Route path segmenti; yoksa `name`. */
  path?: string;
  /** Sol menü sırası (küçük önce). */
  menu?: { order?: number };
  /**
   * Admin'de açık işlemler; verilmezse bütün yazma işlemleri (export hariç). Ör. loglar için `[]`. `export` (CSV,
   * `POST {endpoint}/export`) opt-in: yalnız listede varsa açık.
   */
  operations?: ReadonlyArray<ResourceOperation>;
}

export type ResourceOperation = 'create' | 'update' | 'delete' | 'export';

/** Satırın adı (`titleField` değeri); alan yoksa, boşsa ya da metin / sayı değilse `undefined`. */
export function recordTitle(resource: Pick<ResourceSchema, 'titleField'>, row: Record<string, unknown>): string | undefined {
  if (!resource.titleField) return undefined;
  const value = row[resource.titleField];
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function canPerform(resource: Pick<ResourceSchema, 'operations'>, operation: ResourceOperation): boolean {
  if (operation === 'export') return resource.operations?.includes('export') ?? false;
  return resource.operations === undefined || resource.operations.includes(operation);
}

/** Literal tipleri korur; `InferRow` bu sayede alan tiplerini çıkarabilir. */
export function defineResourceSchema<const S extends ResourceSchema>(schema: S): S {
  return schema;
}

export type InferRow<S extends ResourceSchema> = {
  id: Id;
  createdAt?: string;
  updatedAt?: string;
} & InferFields<S['fields']>;

export type InferResourceFilters<S extends ResourceSchema> = InferFilters<S['fields']>;
