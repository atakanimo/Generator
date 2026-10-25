import type { Id, ListBody, PaginatedList, SortOrder } from '../contract/api.js';

export interface ResourceRef {
  name: string;
  endpoint: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** true → global loading açılmaz (`skipLoading`). */
  background?: boolean;
}

export interface ActionParams {
  /** Satır action'ı: `POST {endpoint}/:id/actions/:actionId`. */
  id?: Id;
  /** Toplu action: `POST {endpoint}/actions/:actionId` body'sinde `ids`. */
  ids?: Id[];
  input?: Record<string, unknown>;
}

/** `POST {endpoint}/export` gövdesi (sözleşme §2 "Export"): liste filtre / sırası, kolonlar ve başlıkları. */
export interface ExportBody {
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortOrder?: SortOrder;
  fields?: string[];
  headers?: string[];
}

export interface ExportFile {
  blob: Blob;
  /** `Content-Disposition`'dan; yoksa `<resource>.csv`. */
  filename: string;
}

/** Paketin BE ile konuştuğu tek arayüz. Varsayılan uygulama: `createAtaRestProvider`. */
export interface DataProvider {
  list<T>(resource: ResourceRef, body: ListBody, opts?: RequestOptions): Promise<PaginatedList<T>>;
  getOne<T>(resource: ResourceRef, id: Id, opts?: RequestOptions): Promise<T>;
  create<T>(resource: ResourceRef, data: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
  update<T>(resource: ResourceRef, id: Id, data: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
  remove(resource: ResourceRef, id: Id, opts?: RequestOptions): Promise<void>;
  action<T>(resource: ResourceRef, actionId: string, params: ActionParams, opts?: RequestOptions): Promise<T>;
  /** CSV export (`operations` `export` içeriyorsa). */
  exportCsv(resource: ResourceRef, body: ExportBody, opts?: RequestOptions): Promise<ExportFile>;
}
