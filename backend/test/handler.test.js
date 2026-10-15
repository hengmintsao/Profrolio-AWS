import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { createStoreContact } from '../src/storage.js';

const event = { body: JSON.stringify({ name: ' Henry ', email: 'HENRY@example.com', message: 'Hello' }) };

function setup({ storageFails = false } = {}) {
  const stored = [];
  const notified = [];
  const errors = [];
  const handler = createHandler({
    storeContact: async (submission) => {
      if (storageFails) throw new Error('storage unavailable');
      stored.push(submission);
    },
    logError: (...args) => errors.push(args),
  });
  return { handler, stored, notified, errors };
}

test('accepts a stored contact with a durable pending notification', async () => {
  const { handler, stored, notified, errors } = setup();
  const result = await handler(event);
  assert.equal(result.statusCode, 202);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Henry');
  assert.equal(stored[0].email, 'henry@example.com');
  assert.equal(JSON.parse(result.body).id, stored[0].id);
  assert.equal(stored[0].notificationStatus, 'pending');
  assert.deepEqual(notified, []);
  assert.deepEqual(errors, []);
});

test('storage failure returns a retryable error without notifying', async () => {
  const { handler, stored, notified, errors } = setup({ storageFails: true });
  const result = await handler(event);
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).id, undefined);
  assert.deepEqual(stored, []);
  assert.deepEqual(notified, []);
  assert.equal(errors[0][0], 'contact.storage_failed');
});

test('concurrent retries and a lost response keep one stored submission', async () => {
  const rows = new Map();
  const storeContact = createStoreContact({
    put: async (submission) => {
      if (rows.has(submission.id)) {
        const error = new Error('exists');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      rows.set(submission.id, submission);
    },
    get: async (id) => rows.get(id),
  });
  const handler = createHandler({ storeContact });
  const key = '12345678-1234-4234-8234-123456789abc';
  const request = { ...event, headers: { 'Idempotency-Key': key } };
  const responses = await Promise.all([handler(request), handler(request)]);
  responses.push(await handler(request));
  assert.equal(rows.size, 1);
  for (const result of responses) {
    assert.equal(result.statusCode, 202);
    assert.equal(JSON.parse(result.body).id, key);
  }
  const conflict = await handler({ ...request, body: JSON.stringify({ name: 'Different', email: 'other@example.com' }) });
  assert.equal(conflict.statusCode, 409);
  assert.equal(rows.get(key).name, 'Henry');
});

test('invalid submission keys are rejected before storage', async () => {
  const { handler, stored } = setup();
  assert.equal((await handler({ ...event, headers: { 'idempotency-key': 'bad-key' } })).statusCode, 400);
  assert.deepEqual(stored, []);
});

test('invalid JSON and invalid contacts produce no external effects', async () => {
  const { handler, stored, notified, errors } = setup();
  for (const body of ['{', '{}', JSON.stringify({ name: 'Bot', email: 'bot@example.com', website: 'spam' })]) {
    assert.equal((await handler({ body })).statusCode, 400);
  }
  assert.deepEqual(stored, []);
  assert.deepEqual(notified, []);
  assert.deepEqual(errors, []);
});
