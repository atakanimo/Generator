import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { canPerform, createAtaRestProvider, filenameFromDisposition } from '../src/index.js';

const resource = { name: 'user-subscriptions', endpoint: '/api/userSubscriptions/admin/' };

function fakeHttp(response: unknown = { isSuccess: true, data: { ok: true } }) {
  const request = vi.fn(async (_config: AxiosRequestConfig) => response);
  return { http: { request } as unknown as AxiosInstance, request };
}

describe('createAtaRestProvider', () => {
  it('list: POST get-all, okuma bayrakları, body olduğu gibi', async () => {
    const { http, request } = fakeHttp();
    const body = { filters: { status: 'active' }, page: 2, limit: 25 };
    await createAtaRestProvider({ http }).list(resource, body);
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: '/api/userSubscriptions/admin/get-all',
      data: body,
      skipSuccessToast: true,
      skipLoading: false
    });
  });

  it('getOne / update / remove: id path segmenti encode edilir', async () => {
    const { http, request } = fakeHttp();
    const provider = createAtaRestProvider({ http });
    await provider.getOne(resource, 'a/b');
    await provider.update(resource, 'x1', { status: 'active' });
    await provider.remove(resource, 'x1');
    expect(request.mock.calls.map(([c]) => [c.method, c.url])).toEqual([
      ['GET', '/api/userSubscriptions/admin/a%2Fb'],
      ['POST', '/api/userSubscriptions/admin/update/x1'],
      ['DELETE', '/api/userSubscriptions/admin/x1']
    ]);
    expect(request.mock.calls[1][0].skipSuccessToast).toBeUndefined();
  });

  it('action: satır ve toplu endpoint ayrımı', async () => {
    const { http, request } = fakeHttp();
    const provider = createAtaRestProvider({ http });
    await provider.action(resource, 'grant-premium', { id: 'x1', input: { days: 30 } });
    await provider.action(resource, 'grant-premium', { ids: ['x1', 'x2'], input: { days: 30 } });
    expect(request.mock.calls[0][0]).toMatchObject({
      url: '/api/userSubscriptions/admin/x1/actions/grant-premium',
      data: { days: 30 }
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      url: '/api/userSubscriptions/admin/actions/grant-premium',
      data: { days: 30, ids: ['x1', 'x2'] }
    });
  });

  it('background → skipLoading, signal iletilir', async () => {
    const { http, request } = fakeHttp();
    const signal = new AbortController().signal;
    await createAtaRestProvider({ http }).list(resource, {}, { background: true, signal });
    expect(request.mock.calls[0][0]).toMatchObject({ skipLoading: true, signal });
  });

  it('LocalResponse.data döner; isSuccess false ise reject eder', async () => {
    const ok = fakeHttp({ isSuccess: true, data: { id: '1' } });
    await expect(createAtaRestProvider(ok).getOne(resource, '1')).resolves.toEqual({ id: '1' });

    const failed = { isSuccess: false, errorData: { message: 'x' } };
    const bad = fakeHttp(failed);
    await expect(createAtaRestProvider(bad).getOne(resource, '1')).rejects.toBe(failed);
  });

  it('exportCsv: POST export, blob, okuma bayrakları; dosya adı başlıktan', async () => {
    const blob = new Blob(['id\r\n']);
    const { http, request } = fakeHttp({ data: blob, headers: { 'content-disposition': 'attachment; filename="user-subscriptions-2026-10-25.csv"' } });
    const body = { filters: { status: 'active' }, fields: ['id'], headers: ['ID'] };
    const file = await createAtaRestProvider({ http }).exportCsv(resource, body);
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: '/api/userSubscriptions/admin/export',
      data: body,
      responseType: 'blob',
      skipSuccessToast: true
    });
    expect(file).toEqual({ blob, filename: 'user-subscriptions-2026-10-25.csv' });
  });

  it('exportCsv: çıplak Blob kabul edilir (ad: <name>.csv); zarf dönerse reject', async () => {
    const blob = new Blob(['x']);
    await expect(createAtaRestProvider(fakeHttp(blob)).exportCsv(resource, {})).resolves.toEqual({ blob, filename: 'user-subscriptions.csv' });
    const failed = { isSuccess: false, errorData: { message: 'x' } };
    await expect(createAtaRestProvider(fakeHttp(failed)).exportCsv(resource, {})).rejects.toBe(failed);
  });

  it('filenameFromDisposition: tırnaklı, tırnaksız, filename*', () => {
    expect(filenameFromDisposition('attachment; filename="a.csv"')).toBe('a.csv');
    expect(filenameFromDisposition('attachment; filename=b.csv')).toBe('b.csv');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%C3%A7.csv")).toBe('ç.csv');
    expect(filenameFromDisposition(undefined)).toBeUndefined();
  });
});

describe('canPerform', () => {
  it('export opt-in: yalnız operations listesinde varsa', () => {
    expect(canPerform({}, 'export')).toBe(false);
    expect(canPerform({}, 'create')).toBe(true);
    expect(canPerform({ operations: ['delete'] }, 'export')).toBe(false);
    expect(canPerform({ operations: ['delete', 'export'] }, 'export')).toBe(true);
    expect(canPerform({ operations: ['export'] }, 'create')).toBe(false);
  });
});
