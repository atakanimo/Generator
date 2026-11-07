import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse, Id, ListBody, PaginatedList } from '../contract/api.js';
import type { AtaRequestFlags } from './axiosFlags.js';
import type { ActionParams, DataProvider, ExportBody, ExportFile, FileUrlParams, RequestOptions, ResourceRef } from './dataProvider.js';

/** What the provider calls: an `AxiosInstance` fits, so does a wrapper with only `request`. */
export type AtaHttp = Pick<AxiosInstance, 'request'> | { request(config: AxiosRequestConfig): Promise<unknown> };

export interface AtaRestProviderOptions {
  /** Host'un axios instance'ı (ya da yalnız `request`'i olan sarmalayıcı): token, global loading ve toast
   * interceptor'da (sözleşme §7). `request` zarfı (`LocalResponse`) döndürmeli. */
  http: AtaHttp;
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

/** `attachment; filename="a.csv"` ya da `filename*=UTF-8''a.csv` → `a.csv`. */
export function filenameFromDisposition(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const encoded = /filename\*=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1];
}

/** Blob yanıtı: host interceptor axios yanıtını (`data` Blob) ya da çıplak Blob'u döner (sözleşme §7 madde 8). */
function readExportResponse(res: unknown, fallbackName: string): ExportFile {
  if (res instanceof Blob) return { blob: res, filename: fallbackName };
  const response = res as { data?: unknown; headers?: Record<string, unknown> } | null | undefined;
  if (!(response?.data instanceof Blob)) throw res;
  const headers = response.headers ?? {};
  const disposition = headers['content-disposition'] ?? headers['Content-Disposition'];
  return { blob: response.data, filename: filenameFromDisposition(disposition) ?? fallbackName };
}

/** Gövdede dosya (`Blob`) varsa multipart: alan başına bir parça, dizi her eleman için tekrarlanır, obje JSON metni. */
export function toActionBody(body: Record<string, unknown>): Record<string, unknown> | FormData {
  if (!Object.values(body).some(v => v instanceof Blob)) return body;
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      if (item instanceof Blob) form.append(key, item);
      else form.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item));
    }
  }
  return form;
}

function actionConfig(opts: RequestOptions | undefined, url: string, body: Record<string, unknown>): AxiosRequestConfig & AtaRequestFlags {
  const data = toActionBody(body);
  // Instance varsayılanı JSON ise axios FormData'yı JSON'a çevirir; multipart verilince sınır (boundary) eklenir.
  const headers = data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined;
  return { ...writeConfig(opts), method: 'POST', url, data, ...(headers ? { headers } : {}) };
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
        return send<T>(actionConfig(opts, joinPath(resource.endpoint, id, 'actions', actionId), input ?? {}));
      }
      return send<T>(actionConfig(opts, joinPath(resource.endpoint, 'actions', actionId), { ...input, ...(ids ? { ids } : {}) }));
    },
    async fileUrl(resource: ResourceRef, id: Id, { path = 'file-url', variant }: FileUrlParams = {}, opts?: RequestOptions) {
      const res = await send<{ url?: string } | null>({
        ...readConfig(opts),
        method: 'GET',
        url: joinPath(resource.endpoint, id, path),
        params: variant ? { variant } : undefined
      });
      return res?.url ?? null;
    },
    async exportCsv(resource: ResourceRef, body: ExportBody, opts?: RequestOptions) {
      const res = await http.request({
        ...readConfig(opts),
        method: 'POST',
        url: joinPath(resource.endpoint, 'export'),
        data: body,
        responseType: 'blob'
      });
      return readExportResponse(res, `${resource.name}.csv`);
    }
  };
}
