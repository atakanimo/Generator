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
  fields: Fs;
  defaultSort?: { field: string; order: SortOrder };
  /** `false` → hiçbir kolon sıralanmaz, `defaultSort` yok sayılır (BE liste ucu sıralama desteklemiyorsa). */
  sortable?: boolean;
  pageSize?: number;
  /** Route path segmenti; yoksa `name`. */
  path?: string;
  /** Sol menü sırası (küçük önce). */
  menu?: { order?: number };
  /** Admin'de açık yazma işlemleri; verilmezse hepsi. Ör. loglar için `[]`. */
  operations?: ReadonlyArray<ResourceOperation>;
}

export type ResourceOperation = 'create' | 'update' | 'delete';

export function canPerform(resource: Pick<ResourceSchema, 'operations'>, operation: ResourceOperation): boolean {
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
