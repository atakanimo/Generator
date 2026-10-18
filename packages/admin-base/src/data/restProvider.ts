import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse, Id, ListBody, PaginatedList } from '../contract/api.js';
import type { AtaRequestFlags } from './axiosFlags.js';
import type { ActionParams, DataProvider, RequestOptions, ResourceRef } from './dataProvider.js';

export interface AtaRestProviderOptions {
  /** Host'un axios instance'ı: token, global loading ve toast interceptor'da (sözleşme §7). */
  http: AxiosInstance;
}

function joinPath(endpoint: string, ...parts: string[]): string {
  return [endpoint.replace(/\/+$/, ''), ...parts.map(encodeURIComponent)].join('/');
}

function readConfig(opts?: RequestOptions): AxiosRequestConfig & AtaRequestFlags {
  return { signal: opts?.signal, skipSuccessToast: true, skipLoading: opts?.background === true };
}

function writeConfig(opts?: RequestOptions): AxiosRequestConfig & AtaRequestFlags {
  return { signal: opts?.signal, skipLoading: opts?.background === true };
}

/** Sözleşmedeki endpoint setini (§2) host axios'u üzerinden çağıran `DataProvider`. */
export function createAtaRestProvider({ http }: AtaRestProviderOptions): DataProvider {
  // Host interceptor AxiosResponse yerine `LocalResponse` döndürür.
  async function send<T>(config: AxiosRequestConfig): Promise<T> {
    const res = (await http.request(config)) as unknown as ApiResponse<T>;
    if (!res || res.isSuccess !== true) throw res;
    return res.data as T;
  }

  return {
    list<T>(resource: ResourceRef, body: ListBody, opts?: RequestOptions) {
      return send<PaginatedList<T>>({ ...readConfig(opts), method: 'POST', url: joinPath(resource.endpoint, 'get-all'), data: body });
    },
    getOne<T>(resource: ResourceRef, id: Id, opts?: RequestOptions) {
      return send<T>({ ...readConfig(opts), method: 'GET', url: joinPath(resource.endpoint, id) });
    },
    create<T>(resource: ResourceRef, data: Record<string, unknown>, opts?: RequestOptions) {
      return send<T>({ ...writeConfig(opts), method: 'POST', url: joinPath(resource.endpoint, 'create'), data });
    },
    update<T>(resource: ResourceRef, id: Id, data: Record<string, unknown>, opts?: RequestOptions) {
      return send<T>({ ...writeConfig(opts), method: 'POST', url: joinPath(resource.endpoint, 'update', id), data });
    },
    async remove(resource: ResourceRef, id: Id, opts?: RequestOptions) {
      await send<null>({ ...writeConfig(opts), method: 'DELETE', url: joinPath(resource.endpoint, id) });
    },
    action<T>(resource: ResourceRef, actionId: string, { id, ids, input }: ActionParams, opts?: RequestOptions) {
      if (id !== undefined) {
        return send<T>({
          ...writeConfig(opts),
          method: 'POST',
          url: joinPath(resource.endpoint, id, 'actions', actionId),
          data: input ?? {}
        });
      }
      return send<T>({
        ...writeConfig(opts),
        method: 'POST',
        url: joinPath(resource.endpoint, 'actions', actionId),
        data: { ...input, ...(ids ? { ids } : {}) }
      });
    }
  };
}
