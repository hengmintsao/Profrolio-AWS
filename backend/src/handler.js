import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { validateContact } from './validation.js';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

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

export function createHandler({ storeContact, notifyContact, logError = console.error }) {
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

    const submission = {
      id: crypto.randomUUID(),
      ...result.value,
      createdAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
    };

    try {
      await storeContact(submission);
    } catch {
      logError('contact.storage_failed', { submissionId: submission.id });
      return response(503, { message: 'Unable to accept message. Please try again later.' });
    }

    try {
      await notifyContact(submission);
    } catch {
      // Storage defines acceptance; notification failure must not invite resubmission.
      logError('contact.notification_failed', { submissionId: submission.id });
    }

    return response(202, { message: 'Message accepted', id: submission.id });
  };
}

export const handler = createHandler({
  storeContact: (submission) => dynamodb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: submission,
    ConditionExpression: 'attribute_not_exists(id)',
  })),

  notifyContact: (submission) => sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Subject: `Portfolio contact from ${submission.name}`.slice(0, 100),
    Message: [
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Phone: ${submission.phone || 'Not provided'}`,
      '',
      submission.message || 'No message provided',
    ].join('\n'),
  }), { abortSignal: AbortSignal.timeout(2000) }),
});
