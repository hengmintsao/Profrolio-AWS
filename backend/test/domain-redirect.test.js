import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const template = readFileSync(new URL('../../infrastructure/template.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = template.split('      FunctionCode: !Sub |\n')[1].split('\n  FrontendDistribution:')[0]
  .replace(/^        /gm, '').replaceAll('${PrimaryDomainName}', 'henry-tsao.com');
const context = {};
runInNewContext(code, context);

function request(host, uri = '/', querystring = {}) {
  return { uri, querystring, headers: { host: { value: host } } };
}

test('www redirects to the primary HTTPS hostname', () => {
  const result = context.handler({ request: request('www.henry-tsao.com') });
  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location.value, 'https://henry-tsao.com/');
});

test('redirect preserves path, encoded query values and repeated parameters', () => {
  const result = context.handler({ request: request('www.henry-tsao.com', '/projects', {
    source: { value: 'a%20b%26c' },
    tag: { value: 'aws', multiValue: [{ value: 'aws' }, { value: 'web' }] },
    empty: { value: '' },
  }) });
  assert.equal(result.headers.location.value, 'https://henry-tsao.com/projects?source=a%20b%26c&tag=aws&tag=web&empty=');
});

test('primary and CloudFront hostnames pass through without redirect loops', () => {
  for (const host of ['henry-tsao.com', 'd1g9bicnpa0ufa.cloudfront.net']) {
    const original = request(host, '/css/style.css');
    assert.equal(context.handler({ request: original }), original);
  }
});
