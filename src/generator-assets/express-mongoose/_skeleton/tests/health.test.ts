import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '@/app';

/** Sözleşme zarfı (docs/api-contract.md). */
interface Envelope {
  isSuccess: boolean;
  traceId?: string;
  data: { status?: string; mongoConnected?: boolean } | null;
  errorData: { code: number; header?: string; message: string } | null;
}

// Mongo gerekmez: uygulama bağlantısız açılır, sağlık ucu `mongoConnected: false` döner.
let server: Server;
let base = '';

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('health: sözleşme zarfı, X-Request-Id yansıtılır', async () => {
  const res = await fetch(`${base}/api/health`, { headers: { 'x-request-id': 'req-1' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-request-id'), 'req-1');
  const body = (await res.json()) as Envelope;
  assert.equal(body.isSuccess, true);
  assert.equal(body.traceId, 'req-1');
  assert.equal(body.data?.status, 'ok');
  assert.equal(body.data?.mongoConnected, false);
});

test('tanımsız yol 404, istek dilinde', async () => {
  const res = await fetch(`${base}/api/missing`, { headers: { lang: 'en' } });
  assert.equal(res.status, 404);
  const body = (await res.json()) as Envelope;
  assert.equal(body.isSuccess, false);
  assert.equal(body.errorData?.code, 404);
  assert.equal(body.errorData?.header, 'Not Found');
});

test('bozuk JSON gövdesi 400', async () => {
  const res = await fetch(`${base}/api/health`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Envelope;
  assert.equal(body.errorData?.code, 400);
});
