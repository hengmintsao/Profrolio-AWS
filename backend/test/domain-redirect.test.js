import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const template = readFileSync(
  new URL('../../infrastructure/template.yaml', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
function functionContext(mode = 'legacy') {
  const code = template
    .split('      FunctionCode: !Sub |\n')[1]
    .split('\n  CmsFrontendCachePolicy:')[0]
    .replace(/^ {8}/gm, '')
    .replaceAll('${PrimaryDomainName}', 'henry-tsao.com')
    .replaceAll('${FrontendMode}', mode);
  const context = {};
  runInNewContext(code, context);
  return context;
}
const context = functionContext();

function request(host, uri = '/', querystring = {}, method = 'GET') {
  return { uri, querystring, method, headers: { host: { value: host } } };
}

test('www redirects to the primary HTTPS hostname', () => {
  const result = context.handler({ request: request('www.henry-tsao.com') });
  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location.value, 'https://henry-tsao.com/');
});

test('legacy mode never rewrites CMS routes', () => {
  for (const uri of ['/', '/projects/example', '/admin/callback']) {
    const original = request('henry-tsao.com', uri);
    assert.equal(context.handler({ request: original }).uri, uri);
  }
});

test('CMS mode rewrites only known page routes and preserves OAuth query data', () => {
  const cms = functionContext('cms');
  const id = '550e8400-e29b-41d4-a716-446655440000';
  for (const method of ['GET', 'HEAD']) {
    for (const uri of [
      '/',
      '/about',
      '/about/',
      '/projects',
      '/projects/',
      '/projects/airline-point',
      '/experience/airline-revenue',
      '/contact',
      '/admin/login',
      '/admin/callback',
      '/admin/projects',
      '/admin/projects/new',
      '/admin/trash',
      `/admin/projects/${id}/edit`,
      `/admin/projects/${id}/preview`,
    ]) {
      const query = {
        code: { value: 'oauth-code' },
        state: { value: 'csrf-state' },
      };
      const result = cms.handler({
        request: request('henry-tsao.com', uri, query, method),
      });
      assert.equal(result.uri, '/index.html', `${method} ${uri}`);
      assert.equal(result.querystring, query);
    }
  }
});

test('CMS mode preserves assets, API paths, unknown pages and unsafe encodings', () => {
  const cms = functionContext('cms');
  for (const uri of [
    '/assets/app.js',
    '/assets/missing.js',
    '/runtime-config.js',
    '/public/projects',
    '/api/contact',
    '/contact/unknown',
    '/unknown',
    '/projects/a/b',
    '/projects/../contact',
    '/projects/%2e%2e',
    '/projects/a%2fb',
    '/projects/a.b',
    '/admin/projects/not-a-uuid/edit',
    `/projects/${'a'.repeat(81)}`,
  ]) {
    const result = cms.handler({ request: request('henry-tsao.com', uri) });
    assert.equal(result.uri, uri);
  }
  for (const method of ['POST', 'PUT', 'OPTIONS', 'DELETE']) {
    assert.equal(
      cms.handler({
        request: request('henry-tsao.com', '/admin/callback', {}, method),
      }).uri,
      '/admin/callback',
    );
  }
});

test('CMS www redirect happens before SPA rewrite and preserves repeated query values', () => {
  const result = functionContext('cms').handler({
    request: request('www.henry-tsao.com', '/admin/callback', {
      state: { multiValue: [{ value: 'a' }, { value: 'b' }] },
    }),
  });
  assert.equal(
    result.headers.location.value,
    'https://henry-tsao.com/admin/callback?state=a&state=b',
  );
});

test('redirect preserves path, encoded query values and repeated parameters', () => {
  const result = context.handler({
    request: request('www.henry-tsao.com', '/projects', {
      source: { value: 'a%20b%26c' },
      tag: { value: 'aws', multiValue: [{ value: 'aws' }, { value: 'web' }] },
      empty: { value: '' },
    }),
  });
  assert.equal(
    result.headers.location.value,
    'https://henry-tsao.com/projects?source=a%20b%26c&tag=aws&tag=web&empty=',
  );
});

test('primary and CloudFront hostnames pass through without redirect loops', () => {
  for (const host of ['henry-tsao.com', 'd1g9bicnpa0ufa.cloudfront.net']) {
    const original = request(host, '/css/style.css');
    assert.equal(context.handler({ request: original }), original);
  }
});
