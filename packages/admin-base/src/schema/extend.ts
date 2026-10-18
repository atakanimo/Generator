import type { ComponentType, ReactNode } from 'react';
import type { Id, ListBody } from '../contract/api.js';
import type { ResourceApi } from '../data/resourceApi.js';
import type { FieldConfig } from './fields.js';
import type { InferRow, ResourceSchema } from './resource.js';

export type ActionPlacement = 'row' | 'detail' | 'toolbar' | 'bulk';

interface ActionCommon {
  /** Sözleşmedeki `:actionId`. */
  id: string;
  label: string;
  icon?: ReactNode;
  /** Küçük action formu; alanlar entity alanlarıyla aynı tipte. */
  input?: readonly FieldConfig[];
  confirm?: { title: string; description?: string };
}

export interface RowActionContext<Row> {
  row: Row;
  input: Record<string, unknown>;
  api: ResourceApi<Row>;
  refresh: () => Promise<void>;
}

export interface CollectionActionContext<Row> {
  selectedIds: Id[];
  input: Record<string, unknown>;
  listBody: ListBody;
  api: ResourceApi<Row>;
  refresh: () => Promise<void>;
}

// Method sözdizimi bilerek seçildi: farklı Row tipli resource'lar aynı registry'de durabilsin.
export interface RowAction<Row> extends ActionCommon {
  placement: 'row' | 'detail';
  visible?(row: Row): boolean;
  disabled?(row: Row): boolean;
  /** Yoksa `POST {endpoint}/:id/actions/:actionId` çağrılır. Başarı mesajı BE `uiMessage`'ından gelir. */
  run?(ctx: RowActionContext<Row>): unknown;
}

export interface CollectionAction<Row> extends ActionCommon {
  placement: 'toolbar' | 'bulk';
  /** Yoksa `POST {endpoint}/actions/:actionId` çağrılır (`{ ids, ...input }`). */
  run?(ctx: CollectionActionContext<Row>): unknown;
}

export type ResourceAction<Row> = RowAction<Row> | CollectionAction<Row>;

export interface CellProps<Row, V> {
  row: Row;
  value: V;
}

export interface FormFieldProps<V> {
  value: V | undefined;
  onChange: (value: V | undefined) => void;
  disabled?: boolean;
  error?: string;
}

export type FieldOverrides<Row> = {
  [K in keyof Row]?: {
    cell?: ComponentType<CellProps<Row, Row[K]>>;
    formField?: ComponentType<FormFieldProps<Row[K]>>;
  };
};

export interface ResourceSlots {
  toolbarStart?: ComponentType;
  aboveTable?: ComponentType;
  belowTable?: ComponentType;
}

/** `modules/<m>/<m>.generated.ts` içeriği: Generator bir kez oluşturur, sonra dokunmaz. */
export interface ResourceExtensions<Row> {
  /** Sol menü ikonu. */
  icon?: ComponentType;
  actions?: ReadonlyArray<ResourceAction<Row>>;
  fields?: FieldOverrides<Row>;
  slots?: ResourceSlots;
}

export type Resource<S extends ResourceSchema = ResourceSchema> = S & {
  extensions?: ResourceExtensions<InferRow<S>>;
};

/** Registry'de farklı satır tipli resource'ları birlikte tutmak için. */
export type AnyResource = ResourceSchema & { extensions?: ResourceExtensions<any> };

export function extendResource<S extends ResourceSchema>(
  schema: S,
  extensions: ResourceExtensions<InferRow<S>>
): Resource<S> {
  return { ...schema, extensions };
}
