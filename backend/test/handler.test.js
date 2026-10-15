import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';

const event = { body: JSON.stringify({ name: ' Henry ', email: 'HENRY@example.com', message: 'Hello' }) };

function setup({ storageFails = false, notificationFails = false } = {}) {
  const stored = [];
  const notified = [];
  const errors = [];
  const handler = createHandler({
    storeContact: async (submission) => {
      if (storageFails) throw new Error('storage unavailable');
      stored.push(submission);
    },
    notifyContact: async (submission) => {
      assert.equal(stored.length, 1, 'notification follows successful storage');
      notified.push(submission);
      if (notificationFails) throw new Error('notification unavailable');
    },
    logError: (...args) => errors.push(args),
  });
  return { handler, stored, notified, errors };
}

test('accepts a stored contact and attempts its notification', async () => {
  const { handler, stored, notified, errors } = setup();
  const result = await handler(event);
  assert.equal(result.statusCode, 202);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Henry');
  assert.equal(stored[0].email, 'henry@example.com');
  assert.equal(JSON.parse(result.body).id, stored[0].id);
  assert.deepEqual(notified, stored);
  assert.deepEqual(errors, []);
});

test('notification failure still accepts the stored contact and logs only its ID', async () => {
  const { handler, stored, errors } = setup({ notificationFails: true });
  const result = await handler(event);
  assert.equal(result.statusCode, 202);
  assert.equal(stored.length, 1);
  assert.equal(JSON.parse(result.body).id, stored[0].id);
  assert.deepEqual(errors, [['contact.notification_failed', { submissionId: stored[0].id }]]);
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

test('invalid JSON and invalid contacts produce no external effects', async () => {
  const { handler, stored, notified, errors } = setup();
  for (const body of ['{', '{}', JSON.stringify({ name: 'Bot', email: 'bot@example.com', website: 'spam' })]) {
    assert.equal((await handler({ body })).statusCode, 400);
  }
  assert.deepEqual(stored, []);
  assert.deepEqual(notified, []);
  assert.deepEqual(errors, []);
});
