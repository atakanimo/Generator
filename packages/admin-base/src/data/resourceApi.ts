import type { Id, ListBody, PaginatedList } from '../contract/api.js';
import type { ResourceSchema } from '../schema/resource.js';
import { toWriteBody } from '../schema/write.js';
import type { ActionParams, DataProvider, ExportBody, ExportFile, RequestOptions } from './dataProvider.js';

/** Tek bir resource'a bağlanmış API; custom action `run` fonksiyonlarına `ctx.api` olarak verilir. */
export interface ResourceApi<Row> {
  list(body?: ListBody, opts?: RequestOptions): Promise<PaginatedList<Row>>;
  getOne(id: Id, opts?: RequestOptions): Promise<Row>;
  create(data: Record<string, unknown>, opts?: RequestOptions): Promise<Row>;
  update(id: Id, data: Record<string, unknown>, opts?: RequestOptions): Promise<Row>;
  remove(id: Id, opts?: RequestOptions): Promise<void>;
  action<T = unknown>(actionId: string, params?: ActionParams, opts?: RequestOptions): Promise<T>;
  exportCsv(body?: ExportBody, opts?: RequestOptions): Promise<ExportFile>;
}

export function bindResourceApi<Row>(provider: DataProvider, resource: ResourceSchema): ResourceApi<Row> {
  return {
    list: (body = {}, opts) => provider.list<Row>(resource, body, opts),
    getOne: (id, opts) => provider.getOne<Row>(resource, id, opts),
    create: (data, opts) => provider.create<Row>(resource, toWriteBody(resource.fields, data, 'create'), opts),
    update: (id, data, opts) => provider.update<Row>(resource, id, toWriteBody(resource.fields, data, 'update'), opts),
    remove: (id, opts) => provider.remove(resource, id, opts),
    action: <T>(actionId: string, params: ActionParams = {}, opts?: RequestOptions) =>
      provider.action<T>(resource, actionId, params, opts),
    exportCsv: (body = {}, opts) => provider.exportCsv(resource, body, opts)
  };
}
