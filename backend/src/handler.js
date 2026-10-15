import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { validateContact } from './validation.js';
import { createStoreContact } from './storage.js';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': process.env.ALLOWED_ORIGIN,
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

export function createHandler({ storeContact, logError = console.error }) {
  return async function handleContact(event) {
    let input;

    try {
      input = JSON.parse(event.body || '{}');
    } catch {
      return response(400, { message: 'Invalid JSON body' });
    }

    const result = validateContact(input);
    if (!result.valid) {
      return response(400, { message: result.reason });
    }

    const key = Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
    if (key !== undefined && (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))) {
      return response(400, { message: 'Idempotency-Key must be a UUID v4' });
    }

    const submission = {
      id: key?.toLowerCase() || crypto.randomUUID(),
      ...result.value,
      payloadFingerprint: crypto.createHash('sha256').update(JSON.stringify(result.value)).digest('hex'),
      notificationStatus: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
    };

    try {
      await storeContact(submission);
    } catch (error) {
      if (error.name === 'IdempotencyConflict') {
        return response(409, { message: 'This submission key was already used for different contact details.' });
      }
      logError('contact.storage_failed', { submissionId: submission.id });
      return response(503, { message: 'Unable to accept message. Please try again later.' });
    }

    return response(202, { message: 'Message accepted', id: submission.id });
  };
}

export const handler = createHandler({
  storeContact: createStoreContact({
    put: (submission) => dynamodb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: submission,
      ConditionExpression: 'attribute_not_exists(id)',
    })),
    get: async (id) => (await dynamodb.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { id },
      ConsistentRead: true,
    }))).Item,
  }),
});
