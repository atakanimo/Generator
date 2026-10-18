import type { Id, ListBody, PaginatedList } from '../contract/api.js';

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

/** Paketin BE ile konuştuğu tek arayüz. Varsayılan uygulama: `createAtaRestProvider`. */
export interface DataProvider {
  list<T>(resource: ResourceRef, body: ListBody, opts?: RequestOptions): Promise<PaginatedList<T>>;
  getOne<T>(resource: ResourceRef, id: Id, opts?: RequestOptions): Promise<T>;
  create<T>(resource: ResourceRef, data: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
  update<T>(resource: ResourceRef, id: Id, data: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
  remove(resource: ResourceRef, id: Id, opts?: RequestOptions): Promise<void>;
  action<T>(resource: ResourceRef, actionId: string, params: ActionParams, opts?: RequestOptions): Promise<T>;
}
