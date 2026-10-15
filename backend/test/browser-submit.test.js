import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../../frontend/js/submitForm.js', import.meta.url), 'utf8');

function loadForm(storage, fetch) {
  let submit;
  const button = { disabled: false };
  const fields = {
    Name: { value: 'Henry' }, email: { value: 'henry@example.com' },
    phone: { value: '' }, description: { value: 'Test message' },
    website: { value: '' }, 'form-status': { textContent: '' },
  };
  fields['contact-form'] = {
    querySelector: () => button,
    addEventListener: (_event, handler) => { submit = handler; },
    reset: () => {},
  };
  runInNewContext(source, {
    document: {
      addEventListener: (_event, handler) => handler(),
      getElementById: (id) => fields[id],
    },
    window: { APP_CONFIG: { API_URL: 'https://example.test/contact' } },
    sessionStorage: storage, crypto: webcrypto, TextEncoder,
    fetch,
  });
  return { submit: () => submit({ preventDefault() {} }), fields, button };
}

test('browser retries reuse a key across reload and clear it after acceptance', async () => {
  const items = new Map();
  const storage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
  const keys = [];
  const failedRequest = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    throw new Error('response lost');
  };
  const firstPage = loadForm(storage, failedRequest);
  await firstPage.submit();
  assert.equal(firstPage.button.disabled, false);
  const persisted = items.get('portfolio.pendingContact');
  assert.ok(persisted);
  assert.equal(persisted.includes('henry@example.com'), false);
  assert.equal(persisted.includes('Test message'), false);
  const reloadedPage = loadForm(storage, async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    return { ok: true };
  });
  await reloadedPage.submit();
  assert.equal(keys[0], keys[1]);
  assert.equal(items.size, 0);
  assert.match(reloadedPage.fields['form-status'].textContent, /received/);
  await reloadedPage.submit();
  assert.notEqual(keys[1], keys[2]);
});

test('changed input gets a new key, even when session storage is unavailable', async () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const keys = [];
  const page = loadForm(storage, async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    return { ok: false, status: 503 };
  });
  await page.submit();
  await page.submit();
  assert.equal(keys[0], keys[1]);
  page.fields.description.value = 'Changed message';
  await page.submit();
  assert.notEqual(keys[1], keys[2]);
  assert.equal(page.button.disabled, false);
});
