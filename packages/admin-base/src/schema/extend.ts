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

/** Toolbar / toplu aksiyonun görünürlük kararı için o anki liste durumu. */
export interface CollectionActionState {
  listBody: ListBody;
  selectedIds: Id[];
}

export interface CollectionAction<Row> extends ActionCommon {
  placement: 'toolbar' | 'bulk';
  /** Ör. yalnızca belirli bir filtre uygulanmışken göster: `({ listBody }) => Boolean(listBody.filters?.reportId)`. */
  visible?(state: CollectionActionState): boolean;
  disabled?(state: CollectionActionState): boolean;
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

/** Seçenekleri çalışma anında yükler; sonuç resource + alan başına önbelleğe alınır. */
export type LoadOptions = (ctx: { signal: AbortSignal }) => Promise<readonly string[]>;

/**
 * Alan değeri dosya adıdır, dosyanın kendisi BE'de: hücre `GET {endpoint}/:id/{path}?variant=` (→ `{ url }`)
 * ile adresi alır. Küçük resim yüklenemezse bir kez `openVariant`'a düşer; ada tıklamak dosyayı yeni sekmede açar.
 */
export interface FilePreviewOptions<Row> {
  /** Varsayılan `file-url`. */
  path?: string;
  /** Küçük resim varyantı; yoksa küçük resim gösterilmez. */
  thumbnailVariant?: string;
  /** Açılan varyant (`?variant=`); yoksa parametre gönderilmez. */
  openVariant?: string;
  /** Satırda küçük resim var mı (ör. yalnız fotoğraf). Varsayılan: `thumbnailVariant` verildiyse her satır. */
  hasThumbnail?(row: Row): boolean;
}

export type FieldOverrides<Row> = {
  [K in keyof Row]?: {
    cell?: ComponentType<CellProps<Row, Row[K]>>;
    formField?: ComponentType<FormFieldProps<Row[K]>>;
    /**
     * Dinamik seçenekler (ör. BE'den gelen market kodları). `enum` alanında statik `options`'ın yerine geçer;
     * `string` alanında formda select, `filter: 'enum'` ile filtrede seçim kutusu çıkarır.
     */
    loadOptions?: LoadOptions;
    /** Tabloda ve detayda dosya önizlemesi; `cell` verilirse o geçerli. */
    file?: FilePreviewOptions<Row>;
  };
};

export interface ResourceSlots {
  toolbarStart?: ComponentType;
  aboveTable?: ComponentType;
  belowTable?: ComponentType;
}

export interface DetailViewProps<Row> {
  row: Row;
  /** Resource sorgularını yeniler (detay kaydı dahil). */
  refresh: () => Promise<void>;
  close: () => void;
}

/**
 * Detayda ilişkili kayıtlar (ör. etkinliğin siparişleri): hedef resource'un tablosu, sunucu sayfalamalı.
 * Hedefin satır ve detay aksiyonları satırda çıkar; aksiyon sonrası hem hedef hem bu resource yenilenir.
 */
export interface RelatedListOptions<Row> {
  /** Registry'deki hedef resource'un `name`'i. */
  resource: string;
  /** Liste filtresi, ör. `row => ({ eventId: row.id })`. */
  filters(row: Row): Record<string, unknown>;
  /** Gösterilen kolonlar (sırası korunur); yoksa hedefin `list: true` alanları. */
  fields?: readonly string[];
  /** Başlık (i18n anahtarı ya da metin); yoksa hedefin başlığı. */
  title?: string;
  /** Varsayılan 10. */
  pageSize?: number;
}

/** Salt okunur detay drawer'ı; satırda "Detay" ikonu açar, `placement: 'detail'` aksiyonları burada çıkar. */
export interface DetailViewOptions<Row> {
  /** Drawer açılınca kayıt `getOne` ile çekilir; `false` → listedeki satır gösterilir. Varsayılan `true`. */
  fetch?: boolean;
  /** Alan listesinin altına eklenen içerik (ör. rapor sonuçları). */
  component?: ComponentType<DetailViewProps<Row>>;
  /** `true` → alan listesi gizlenir, yalnızca `component` görünür. */
  hideFields?: boolean;
  /** `component`'ın altında, sırayla çizilen ilişkili kayıt tabloları. */
  related?: ReadonlyArray<RelatedListOptions<Row>>;
}

/** `modules/<m>/<m>.generated.ts` içeriği: Generator bir kez oluşturur, sonra dokunmaz. */
export interface ResourceExtensions<Row> {
  /** Sol menü ikonu. */
  icon?: ComponentType;
  actions?: ReadonlyArray<ResourceAction<Row>>;
  fields?: FieldOverrides<Row>;
  slots?: ResourceSlots;
  /**
   * Detay drawer'ı. `placement: 'detail'` aksiyonu varsa kendiliğinden açıktır (`true` ile aynı);
   * `false` verilirse o aksiyonlar satırda gösterilir.
   */
  detail?: boolean | DetailViewOptions<Row>;
}

/** Detay drawer'ının ayarları; resource'ta detay yoksa `null`. */
export function detailViewOptions<Row>(extensions: ResourceExtensions<Row> | undefined): DetailViewOptions<Row> | null {
  const detail = extensions?.detail;
  if (detail === false) return null;
  if (typeof detail === 'object') return detail;
  if (detail === true || (extensions?.actions ?? []).some(a => a.placement === 'detail')) return {};
  return null;
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
