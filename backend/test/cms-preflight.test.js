import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/cms/app.js';

function isolatedApp() {
  let accesses = 0;
  const forbidden = async () => {
    accesses += 1;
    throw new Error('Preflight must not access protected dependencies.');
  };
  const app = createApp({
    clientId: 'fixture-client',
    store: { get: forbidden, list: forbidden, commit: forbidden },
    media: {
      grant: forbidden,
      readIncoming: forbidden,
      writeVerified: forbidden,
      sign: forbidden,
    },
  });
  return { app, accesses: () => accesses };
}

test('anonymous CMS proxy preflight returns an empty response without accessing data', async () => {
  const { app, accesses } = isolatedApp();
  for (const path of [
    '/admin/projects',
    '/admin/media/example/complete',
    '/public/projects',
    '/public/projects/example/media/example',
  ]) {
    const response = await app({
      method: 'OPTIONS',
      path,
      headers: { origin: 'https://untrusted.example' },
    });
    assert.equal(response.statusCode, 204, path);
    assert.equal(response.body, '');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(accesses(), 0);
});

test('successful preflight does not authorize subsequent admin operations', async () => {
  const { app, accesses } = isolatedApp();
  await app({ method: 'OPTIONS', path: '/admin/projects' });
  for (const method of ['GET', 'POST', 'PUT']) {
    const response = await app({ method, path: '/admin/projects' });
    assert.equal(response.statusCode, 401, method);
    assert.equal(JSON.parse(response.body).error.code, 'UNAUTHENTICATED');
  }
  assert.equal(accesses(), 0);
});

test('preflight does not expose unrelated namespaces or bare proxy roots', async () => {
  const { app, accesses } = isolatedApp();
  for (const path of [
    '/',
    '/other/projects',
    '/public',
    '/admin',
    '/administrator/projects',
  ]) {
    const response = await app({ method: 'OPTIONS', path });
    assert.equal(response.statusCode, 404, path);
  }
  assert.equal(accesses(), 0);
});

test('preflight retains request size and JSON validation boundaries', async () => {
  const { app, accesses } = isolatedApp();
  assert.equal(
    (await app({ method: 'OPTIONS', path: '/admin/projects', rawBody: '{' }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app({
        method: 'OPTIONS',
        path: '/admin/projects',
        rawBody: 'x'.repeat(96 * 1024 + 1),
      })
    ).statusCode,
    413,
  );
  assert.equal(accesses(), 0);
});
