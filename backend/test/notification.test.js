import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationHandler } from '../src/notification.js';

const record = (id, sequence, eventName = 'INSERT') => ({
  eventName,
  dynamodb: { Keys: { id: { S: id } }, SequenceNumber: sequence },
});

test('failed publication is retried; a completed notification is skipped on replay', async () => {
  const contact = { id: 'contact-1', notificationStatus: 'pending' };
  const errors = [];
  let attempts = 0;
  const handler = createNotificationHandler({
    getContact: async () => contact,
    publish: async () => {
      attempts++;
      if (attempts === 1) throw new Error('SNS unavailable');
    },
    markNotified: async () => { contact.notificationStatus = 'sent'; },
    logError: (...args) => errors.push(args),
  });
  const event = { Records: [record(contact.id, '123')] };
  assert.deepEqual(await handler(event), { batchItemFailures: [{ itemIdentifier: '123' }] });
  assert.equal(contact.notificationStatus, 'pending');
  assert.deepEqual(await handler(event), { batchItemFailures: [] });
  assert.equal(contact.notificationStatus, 'sent');
  assert.deepEqual(await handler(event), { batchItemFailures: [] });
  assert.equal(attempts, 2);
  assert.deepEqual(errors, [['contact.notification_failed', { submissionId: contact.id }]]);
});

test('failed status persistence is retryable even after publication', async () => {
  const handler = createNotificationHandler({
    getContact: async () => ({ id: 'contact-1', notificationStatus: 'pending' }),
    publish: async () => {},
    markNotified: async () => { throw new Error('DynamoDB unavailable'); },
    logError: () => {},
  });
  assert.deepEqual(await handler({ Records: [record('contact-1', '456')] }), {
    batchItemFailures: [{ itemIdentifier: '456' }],
  });
});

test('updates and deleted contacts do not produce notifications', async () => {
  let reads = 0;
  const handler = createNotificationHandler({
    getContact: async () => { reads++; return undefined; },
    publish: async () => assert.fail('must not publish'),
    markNotified: async () => assert.fail('must not update'),
  });
  assert.deepEqual(await handler({ Records: [record('missing', '1'), record('updated', '2', 'MODIFY')] }), { batchItemFailures: [] });
  assert.equal(reads, 1);
});
